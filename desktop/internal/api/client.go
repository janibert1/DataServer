package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

const (
	maxRetries       = 5
	baseRetryDelay   = 2 * time.Second
	requestThrottle  = 300 * time.Millisecond // min delay between API calls
)

type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client

	lastRequest time.Time
	throttleMu  sync.Mutex
}

func NewClient(baseURL, token string) *Client {
	return &Client{
		baseURL: baseURL,
		token:   token,
		httpClient: &http.Client{
			Timeout: 5 * time.Minute,
		},
	}
}

func (c *Client) SetToken(token string) {
	c.token = token
}

func (c *Client) throttle() {
	c.throttleMu.Lock()
	defer c.throttleMu.Unlock()

	elapsed := time.Since(c.lastRequest)
	if elapsed < requestThrottle {
		time.Sleep(requestThrottle - elapsed)
	}
	c.lastRequest = time.Now()
}

func (c *Client) do(method, path string, body io.Reader, contentType string) (*http.Response, error) {
	// Buffer the body so we can replay it on retries
	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = io.ReadAll(body)
		if err != nil {
			return nil, fmt.Errorf("read request body: %w", err)
		}
	}

	url := c.baseURL + "/api" + path

	for attempt := 0; attempt <= maxRetries; attempt++ {
		c.throttle()

		var reqBody io.Reader
		if bodyBytes != nil {
			reqBody = bytes.NewReader(bodyBytes)
		}

		req, err := http.NewRequest(method, url, reqBody)
		if err != nil {
			return nil, err
		}

		if c.token != "" {
			req.Header.Set("Authorization", "Bearer "+c.token)
		}
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode != http.StatusTooManyRequests {
			return resp, nil
		}

		// Rate limited — parse Retry-After or use exponential backoff
		resp.Body.Close()

		delay := baseRetryDelay * (1 << attempt)
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			if secs, err := strconv.Atoi(ra); err == nil {
				delay = time.Duration(secs) * time.Second
			}
		}

		if attempt < maxRetries {
			log.Warn().
				Int("attempt", attempt+1).
				Dur("backoff", delay).
				Str("path", path).
				Msg("Rate limited (429), backing off")
			time.Sleep(delay)
		}
	}

	return nil, fmt.Errorf("rate limited on %s after %d retries", path, maxRetries)
}

func (c *Client) getJSON(path string, out interface{}) error {
	resp, err := c.do("GET", path, nil, "")
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *Client) postJSON(path string, payload interface{}, out interface{}) error {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}

	resp, err := c.do("POST", path, body, "application/json")
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// ─── Auth ────────────────────────────────────────────────────

func (c *Client) GetMe() (*User, error) {
	var resp struct {
		User User `json:"user"`
	}
	if err := c.getJSON("/auth/me", &resp); err != nil {
		return nil, err
	}
	return &resp.User, nil
}

func (c *Client) PollDeviceAuth(code string) (*DevicePollResponse, error) {
	var resp DevicePollResponse
	if err := c.getJSON(fmt.Sprintf("/tokens/device/%s/poll", code), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// ─── Sync ────────────────────────────────────────────────────

func (c *Client) GetSyncState() (*SyncStateResponse, error) {
	var resp SyncStateResponse
	if err := c.getJSON("/sync/state", &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (c *Client) GetSyncChanges(since string) (*SyncChangesResponse, error) {
	var resp SyncChangesResponse
	if err := c.getJSON(fmt.Sprintf("/sync/changes?since=%s", since), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// ─── Files ───────────────────────────────────────────────────

func (c *Client) GetDownloadURL(fileID string) (string, error) {
	var resp DownloadResponse
	if err := c.getJSON(fmt.Sprintf("/files/%s/download", fileID), &resp); err != nil {
		return "", err
	}
	return resp.URL, nil
}

func (c *Client) DownloadFile(downloadURL, destPath string) error {
	resp, err := http.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download HTTP %d", resp.StatusCode)
	}

	dir := filepath.Dir(destPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	tmpPath := destPath + ".dsync-tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return err
	}

	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return err
	}
	f.Close()

	return os.Rename(tmpPath, destPath)
}

func (c *Client) UploadFile(localPath, folderID string) (*UploadedFile, error) {
	f, err := os.Open(localPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	if folderID != "" {
		_ = writer.WriteField("folderId", folderID)
	}

	part, err := writer.CreateFormFile("files", filepath.Base(localPath))
	if err != nil {
		return nil, err
	}

	if _, err := io.Copy(part, f); err != nil {
		return nil, err
	}
	writer.Close()

	resp, err := c.do("POST", "/files/upload", &buf, writer.FormDataContentType())
	if err != nil {
		return nil, fmt.Errorf("upload failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("upload HTTP %d: %s", resp.StatusCode, string(body))
	}

	var uploadResp UploadResponse
	if err := json.NewDecoder(resp.Body).Decode(&uploadResp); err != nil {
		return nil, err
	}

	if len(uploadResp.Files) == 0 {
		return nil, fmt.Errorf("upload returned no files")
	}

	return &uploadResp.Files[0], nil
}

// ─── Folders ─────────────────────────────────────────────────

func (c *Client) CreateFolder(name string, parentID *string) (*SyncFolder, error) {
	payload := map[string]interface{}{"name": name}
	if parentID != nil {
		payload["parentId"] = *parentID
	}

	var resp FolderCreateResponse
	if err := c.postJSON("/folders", payload, &resp); err != nil {
		return nil, err
	}
	return &resp.Folder, nil
}

func (c *Client) TrashFile(fileID string) error {
	resp, err := c.do("POST", fmt.Sprintf("/files/%s/trash", fileID), nil, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("trash HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (c *Client) TrashFolder(folderID string) error {
	resp, err := c.do("POST", fmt.Sprintf("/folders/%s/trash", folderID), nil, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("trash folder HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (c *Client) RenameFile(fileID, newName string) error {
	payload := map[string]interface{}{"name": newName}
	data, _ := json.Marshal(payload)

	resp, err := c.do("PATCH", fmt.Sprintf("/files/%s", fileID), bytes.NewReader(data), "application/json")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("rename HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func init() {
	_ = log.Logger // ensure zerolog is imported
}
