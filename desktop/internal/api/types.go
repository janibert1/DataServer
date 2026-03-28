package api

import "time"

type User struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
}

type SyncFolder struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	ParentID  *string   `json:"parentId"`
	Path      string    `json:"path"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type SyncFile struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	FolderID  *string   `json:"folderId"`
	Path      string    `json:"path"`
	Size      string    `json:"size"`
	Checksum  string    `json:"checksum"`
	MimeType  string    `json:"mimeType"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type SyncStateResponse struct {
	Folders    []SyncFolder `json:"folders"`
	Files      []SyncFile   `json:"files"`
	ServerTime string       `json:"serverTime"`
}

type SyncChangesResponse struct {
	Folders          []SyncFolder `json:"folders"`
	Files            []SyncFile   `json:"files"`
	TrashedFolderIDs []string     `json:"trashedFolderIds"`
	TrashedFileIDs   []string     `json:"trashedFileIds"`
	ServerTime       string       `json:"serverTime"`
}

type DevicePollResponse struct {
	Status string `json:"status"`
	Token  string `json:"token,omitempty"`
	User   *User  `json:"user,omitempty"`
}

type DownloadResponse struct {
	URL string `json:"url"`
}

type UploadedFile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Size     string `json:"size"`
	Checksum string `json:"checksum"`
	FolderID *string `json:"folderId"`
}

type UploadResponse struct {
	Files []UploadedFile `json:"files"`
}

type FolderCreateResponse struct {
	Folder SyncFolder `json:"folder"`
}
