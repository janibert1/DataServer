package sync

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/jan/dataserver-desktop/internal/api"
	"github.com/jan/dataserver-desktop/internal/config"
)

type Engine struct {
	client  *api.Client
	state   *StateDB
	syncDir string
	paused  atomic.Bool
}

type SyncStatus struct {
	State      string // "idle", "syncing", "error"
	Message    string
	LastSync   time.Time
	FilesUp    int
	FilesDown  int
	FilesError int
}

var CurrentStatus atomic.Value // stores SyncStatus

func init() {
	CurrentStatus.Store(SyncStatus{State: "idle"})
}

func NewEngine(client *api.Client, state *StateDB) *Engine {
	cfg := config.Get()
	return &Engine{
		client:  client,
		state:   state,
		syncDir: cfg.SyncDir,
	}
}

func (e *Engine) SetPaused(p bool) {
	e.paused.Store(p)
}

func (e *Engine) IsPaused() bool {
	return e.paused.Load()
}

func (e *Engine) RunOnce() error {
	if e.paused.Load() {
		return nil
	}

	setStatus("syncing", "Checking for changes...")

	cursor, _ := e.state.GetCursor("lastSyncTime")

	var err error
	if cursor == "" {
		err = e.fullSync()
	} else {
		err = e.deltaSync(cursor)
	}

	if err != nil {
		setStatus("error", err.Error())
		return err
	}

	setStatus("idle", "Up to date")
	return nil
}

func setStatus(state, msg string) {
	CurrentStatus.Store(SyncStatus{
		State:    state,
		Message:  msg,
		LastSync: time.Now(),
	})
}

// ─── Full sync ───────────────────────────────────────────────

func (e *Engine) fullSync() error {
	log.Info().Msg("Starting full sync...")

	resp, err := e.client.GetSyncState()
	if err != nil {
		return fmt.Errorf("fetch sync state: %w", err)
	}

	// Build folder ID→path map
	folderPaths := e.buildFolderPaths(resp.Folders)

	// Create folders
	for _, rf := range resp.Folders {
		relPath := folderPaths[rf.ID]
		absPath := filepath.Join(e.syncDir, relPath)
		if err := os.MkdirAll(absPath, 0755); err != nil {
			log.Error().Err(err).Str("path", relPath).Msg("Failed to create folder")
			continue
		}
		e.state.UpsertFolder(LocalFolder{
			RemoteID: rf.ID,
			Path:     relPath,
			SyncedAt: time.Now().UTC().Format(time.RFC3339),
		})
	}

	// Download files
	downloaded := 0
	for _, rf := range resp.Files {
		relPath := e.fileRelPath(rf, folderPaths)
		absPath := filepath.Join(e.syncDir, relPath)

		// Skip if already exists with matching checksum
		if existing, _ := e.state.GetFile(rf.ID); existing != nil && existing.Checksum == rf.Checksum {
			// Verify file still exists on disk
			if _, err := os.Stat(absPath); err == nil {
				continue
			}
		}

		// Pause between downloads to avoid overwhelming the server
		if downloaded > 0 {
			time.Sleep(500 * time.Millisecond)
		}

		setStatus("syncing", fmt.Sprintf("Downloading %s (%d/%d)", rf.Name, downloaded+1, len(resp.Files)))
		if err := e.downloadFile(rf, absPath); err != nil {
			log.Error().Err(err).Str("file", rf.Name).Msg("Download failed")
			continue
		}
		downloaded++

		size, _ := strconv.ParseInt(rf.Size, 10, 64)
		e.state.UpsertFile(LocalFile{
			RemoteID:   rf.ID,
			Path:       relPath,
			Checksum:   rf.Checksum,
			Size:       size,
			ModifiedAt: rf.UpdatedAt.UTC().Format(time.RFC3339),
			SyncedAt:   time.Now().UTC().Format(time.RFC3339),
		})
	}

	e.state.SetCursor("lastSyncTime", resp.ServerTime)
	log.Info().Int("folders", len(resp.Folders)).Int("files", len(resp.Files)).Msg("Full sync complete")
	return nil
}

// ─── Delta sync ──────────────────────────────────────────────

func (e *Engine) deltaSync(since string) error {
	log.Debug().Str("since", since).Msg("Delta sync")

	// 1. Fetch remote changes
	resp, err := e.client.GetSyncChanges(since)
	if err != nil {
		return fmt.Errorf("fetch changes: %w", err)
	}

	// 2. Handle remote folder changes
	if len(resp.Folders) > 0 {
		// Need full folder list to rebuild paths
		fullState, err := e.client.GetSyncState()
		if err != nil {
			return fmt.Errorf("fetch full state for folder paths: %w", err)
		}
		folderPaths := e.buildFolderPaths(fullState.Folders)

		for _, rf := range resp.Folders {
			relPath := folderPaths[rf.ID]
			absPath := filepath.Join(e.syncDir, relPath)
			os.MkdirAll(absPath, 0755)
			e.state.UpsertFolder(LocalFolder{
				RemoteID: rf.ID,
				Path:     relPath,
				SyncedAt: time.Now().UTC().Format(time.RFC3339),
			})
		}
	}

	// 3. Handle remote file changes (downloads)
	downloaded := 0
	for _, rf := range resp.Files {
		existing, _ := e.state.GetFile(rf.ID)
		if existing != nil && existing.Checksum == rf.Checksum {
			continue // No actual change
		}

		// Determine relative path from folder or server path
		relPath := rf.Name
		if rf.FolderID != nil {
			folder, _ := e.state.GetFolder(*rf.FolderID)
			if folder != nil {
				relPath = filepath.Join(folder.Path, rf.Name)
			} else if rf.Path != "" {
				// Folder not in local state — derive path from server's path field
				// Server path is like "/parent/child/filename", strip leading / and use as-is
				serverPath := strings.TrimPrefix(rf.Path, "/")
				if serverPath != "" {
					relPath = filepath.FromSlash(serverPath)
				}
			}
		}

		absPath := filepath.Join(e.syncDir, relPath)

		// Check for local modifications (conflict)
		if existing != nil {
			localChecksum, _ := checksumFile(absPath)
			if localChecksum != "" && localChecksum != existing.Checksum && localChecksum != rf.Checksum {
				// Both sides changed — conflict
				e.handleConflict(absPath, rf.Name)
			}
		}

		// Pause between downloads to avoid overwhelming the server
		if downloaded > 0 {
			time.Sleep(500 * time.Millisecond)
		}

		setStatus("syncing", fmt.Sprintf("Downloading %s", rf.Name))
		if err := e.downloadFile(rf, absPath); err != nil {
			log.Error().Err(err).Str("file", rf.Name).Msg("Download failed")
			continue
		}
		downloaded++

		size, _ := strconv.ParseInt(rf.Size, 10, 64)
		e.state.UpsertFile(LocalFile{
			RemoteID:   rf.ID,
			Path:       relPath,
			Checksum:   rf.Checksum,
			Size:       size,
			ModifiedAt: rf.UpdatedAt.UTC().Format(time.RFC3339),
			SyncedAt:   time.Now().UTC().Format(time.RFC3339),
		})
	}

	// 4. Handle remote deletions
	for _, id := range resp.TrashedFileIDs {
		f, _ := e.state.GetFile(id)
		if f != nil {
			absPath := filepath.Join(e.syncDir, f.Path)
			os.Remove(absPath)
			e.state.DeleteFile(id)
			log.Info().Str("path", f.Path).Msg("Deleted local file (trashed remotely)")
		}
	}

	for _, id := range resp.TrashedFolderIDs {
		f, _ := e.state.GetFolder(id)
		if f != nil {
			absPath := filepath.Join(e.syncDir, f.Path)
			os.RemoveAll(absPath)
			e.state.DeleteFolder(id)
			log.Info().Str("path", f.Path).Msg("Deleted local folder (trashed remotely)")
		}
	}

	// 5. Scan local filesystem for local-only changes
	if err := e.scanLocalChanges(); err != nil {
		log.Error().Err(err).Msg("Local scan failed")
	}

	e.state.SetCursor("lastSyncTime", resp.ServerTime)
	return nil
}

// ─── Local change detection ─────────────────────────────────

func (e *Engine) scanLocalChanges() error {
	knownFiles, _ := e.state.AllFiles()
	knownFolders, _ := e.state.AllFolders()

	knownFilePaths := make(map[string]*LocalFile, len(knownFiles))
	for i := range knownFiles {
		knownFilePaths[knownFiles[i].Path] = &knownFiles[i]
	}
	knownFolderPaths := make(map[string]*LocalFolder, len(knownFolders))
	for i := range knownFolders {
		knownFolderPaths[knownFolders[i].Path] = &knownFolders[i]
	}

	cfg := config.Get()
	seenPaths := make(map[string]bool)
	uploaded := 0

	err := filepath.Walk(e.syncDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip errors
		}

		relPath, _ := filepath.Rel(e.syncDir, path)
		if relPath == "." {
			return nil
		}

		// Check ignore patterns
		base := filepath.Base(relPath)
		for _, pattern := range cfg.IgnoredPatterns {
			if matched, _ := filepath.Match(pattern, base); matched {
				if info.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
		}

		// Skip conflict files
		if strings.Contains(base, "(Conflict ") {
			return nil
		}

		seenPaths[relPath] = true

		if info.IsDir() {
			// New local folder
			if _, known := knownFolderPaths[relPath]; !known {
				// Find parent folder ID
				parentPath := filepath.Dir(relPath)
				var parentID *string
				if parentPath != "." {
					if pf, ok := knownFolderPaths[parentPath]; ok {
						parentID = &pf.RemoteID
					} else {
						// Parent folder not known — skip entire subtree to avoid
						// creating orphaned folders/files at root level
						log.Warn().Str("path", relPath).Msg("Skipping folder: parent not synced yet")
						return filepath.SkipDir
					}
				}

				setStatus("syncing", fmt.Sprintf("Creating folder %s", relPath))
				folder, err := e.client.CreateFolder(info.Name(), parentID)
				if err != nil {
					log.Error().Err(err).Str("path", relPath).Msg("Create remote folder failed, skipping subtree")
					return filepath.SkipDir
				}

				lf := LocalFolder{
					RemoteID: folder.ID,
					Path:     relPath,
					SyncedAt: time.Now().UTC().Format(time.RFC3339),
				}
				e.state.UpsertFolder(lf)
				knownFolderPaths[relPath] = &lf
				log.Info().Str("path", relPath).Msg("Created remote folder")
			}
			return nil
		}

		// File handling
		known, exists := knownFilePaths[relPath]
		if !exists {
			// New local file — upload
			folderID := ""
			dirPath := filepath.Dir(relPath)
			if dirPath != "." {
				if pf, ok := knownFolderPaths[dirPath]; ok {
					folderID = pf.RemoteID
				} else {
					// Parent folder not synced — skip to avoid uploading to root
					log.Warn().Str("path", relPath).Msg("Skipping file: parent folder not synced yet")
					return nil
				}
			}

			// Pause between uploads to stay within rate limits
			if uploaded > 0 {
				time.Sleep(1 * time.Second)
			}

			setStatus("syncing", fmt.Sprintf("Uploading %s", base))
			uploadedFile, err := e.client.UploadFile(path, folderID)
			if err != nil {
				log.Error().Err(err).Str("path", relPath).Msg("Upload failed")
				return nil
			}
			uploaded++

			e.state.UpsertFile(LocalFile{
				RemoteID:   uploadedFile.ID,
				Path:       relPath,
				Checksum:   uploadedFile.Checksum,
				Size:       info.Size(),
				ModifiedAt: info.ModTime().UTC().Format(time.RFC3339),
				SyncedAt:   time.Now().UTC().Format(time.RFC3339),
			})
			log.Info().Str("path", relPath).Msg("Uploaded new file")
			return nil
		}

		// Known file — check for local modifications
		if info.Size() != known.Size || info.ModTime().UTC().Format(time.RFC3339) != known.ModifiedAt {
			checksum, err := checksumFile(path)
			if err != nil || checksum == known.Checksum {
				return nil // No actual change or error
			}

			// Local file changed — upload new version
			folderID := ""
			dirPath := filepath.Dir(relPath)
			if dirPath != "." {
				if pf, ok := knownFolderPaths[dirPath]; ok {
					folderID = pf.RemoteID
				} else {
					log.Warn().Str("path", relPath).Msg("Skipping modified file: parent folder not synced yet")
					return nil
				}
			}

			// Trash old version first, then upload new
			e.client.TrashFile(known.RemoteID)

			// Pause between uploads to stay within rate limits
			if uploaded > 0 {
				time.Sleep(1 * time.Second)
			}

			setStatus("syncing", fmt.Sprintf("Uploading %s", base))
			uploadedFile, err := e.client.UploadFile(path, folderID)
			if err != nil {
				log.Error().Err(err).Str("path", relPath).Msg("Re-upload failed")
				return nil
			}
			uploaded++

			e.state.UpsertFile(LocalFile{
				RemoteID:   uploadedFile.ID,
				Path:       relPath,
				Checksum:   uploadedFile.Checksum,
				Size:       info.Size(),
				ModifiedAt: info.ModTime().UTC().Format(time.RFC3339),
				SyncedAt:   time.Now().UTC().Format(time.RFC3339),
			})
			log.Info().Str("path", relPath).Msg("Uploaded modified file")
		}

		return nil
	})

	if err != nil {
		return err
	}

	// Check for locally deleted files
	for _, f := range knownFiles {
		if !seenPaths[f.Path] {
			absPath := filepath.Join(e.syncDir, f.Path)
			if _, err := os.Stat(absPath); os.IsNotExist(err) {
				log.Info().Str("path", f.Path).Msg("Local file deleted, trashing remote")
				e.client.TrashFile(f.RemoteID)
				e.state.DeleteFile(f.RemoteID)
			}
		}
	}

	// Check for locally deleted folders (reverse order so children first)
	sort.Slice(knownFolders, func(i, j int) bool {
		return len(knownFolders[i].Path) > len(knownFolders[j].Path)
	})
	for _, f := range knownFolders {
		if !seenPaths[f.Path] {
			absPath := filepath.Join(e.syncDir, f.Path)
			if _, err := os.Stat(absPath); os.IsNotExist(err) {
				log.Info().Str("path", f.Path).Msg("Local folder deleted, trashing remote")
				e.client.TrashFolder(f.RemoteID)
				e.state.DeleteFolder(f.RemoteID)
			}
		}
	}

	return nil
}

// ─── Helpers ─────────────────────────────────────────────────

func (e *Engine) buildFolderPaths(folders []api.SyncFolder) map[string]string {
	byID := make(map[string]*api.SyncFolder, len(folders))
	for i := range folders {
		byID[folders[i].ID] = &folders[i]
	}

	paths := make(map[string]string, len(folders))
	var resolve func(id string) string
	resolve = func(id string) string {
		if p, ok := paths[id]; ok {
			return p
		}
		f := byID[id]
		if f == nil {
			return ""
		}
		if f.ParentID == nil {
			paths[id] = f.Name
			return f.Name
		}
		parent := resolve(*f.ParentID)
		if parent == "" {
			paths[id] = f.Name
		} else {
			paths[id] = filepath.Join(parent, f.Name)
		}
		return paths[id]
	}

	for _, f := range folders {
		resolve(f.ID)
	}
	return paths
}

func (e *Engine) fileRelPath(f api.SyncFile, folderPaths map[string]string) string {
	if f.FolderID == nil {
		return f.Name
	}
	if fp, ok := folderPaths[*f.FolderID]; ok {
		return filepath.Join(fp, f.Name)
	}
	return f.Name
}

func (e *Engine) downloadFile(rf api.SyncFile, absPath string) error {
	url, err := e.client.GetDownloadURL(rf.ID)
	if err != nil {
		return err
	}
	return e.client.DownloadFile(url, absPath)
}

func (e *Engine) handleConflict(absPath, name string) {
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	conflictName := fmt.Sprintf("%s (Conflict %s)%s", base, time.Now().Format("2006-01-02"), ext)
	conflictPath := filepath.Join(filepath.Dir(absPath), conflictName)
	if err := os.Rename(absPath, conflictPath); err != nil {
		log.Error().Err(err).Msg("Failed to create conflict copy")
	} else {
		log.Warn().Str("original", absPath).Str("conflict", conflictPath).Msg("Conflict detected, local copy saved")
	}
}

func checksumFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
