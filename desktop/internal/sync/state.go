package sync

import (
	"database/sql"
	"os"

	_ "modernc.org/sqlite"

	"github.com/jan/dataserver-desktop/internal/config"
)

type StateDB struct {
	db *sql.DB
}

type LocalFile struct {
	RemoteID   string
	Path       string
	Checksum   string
	Size       int64
	ModifiedAt string
	SyncedAt   string
}

type LocalFolder struct {
	RemoteID string
	Path     string
	SyncedAt string
}

func OpenStateDB() (*StateDB, error) {
	dbPath := config.StateDBPath()
	if err := os.MkdirAll(config.ConfigDir(), 0700); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL")
	if err != nil {
		return nil, err
	}

	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}

	return &StateDB{db: db}, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS local_files (
			remote_id TEXT PRIMARY KEY,
			path TEXT NOT NULL,
			checksum TEXT NOT NULL,
			size INTEGER NOT NULL,
			modified_at TEXT NOT NULL,
			synced_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_files_path ON local_files(path);

		CREATE TABLE IF NOT EXISTS local_folders (
			remote_id TEXT PRIMARY KEY,
			path TEXT NOT NULL,
			synced_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_folders_path ON local_folders(path);

		CREATE TABLE IF NOT EXISTS sync_cursor (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
	`)
	return err
}

func (s *StateDB) Close() error {
	return s.db.Close()
}

// ─── Cursor ──────────────────────────────────────────────────

func (s *StateDB) GetCursor(key string) (string, error) {
	var val string
	err := s.db.QueryRow("SELECT value FROM sync_cursor WHERE key = ?", key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return val, err
}

func (s *StateDB) SetCursor(key, value string) error {
	_, err := s.db.Exec(
		"INSERT INTO sync_cursor (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
		key, value, value,
	)
	return err
}

// ─── Files ───────────────────────────────────────────────────

func (s *StateDB) GetFile(remoteID string) (*LocalFile, error) {
	f := &LocalFile{}
	err := s.db.QueryRow(
		"SELECT remote_id, path, checksum, size, modified_at, synced_at FROM local_files WHERE remote_id = ?",
		remoteID,
	).Scan(&f.RemoteID, &f.Path, &f.Checksum, &f.Size, &f.ModifiedAt, &f.SyncedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return f, err
}

func (s *StateDB) GetFileByPath(path string) (*LocalFile, error) {
	f := &LocalFile{}
	err := s.db.QueryRow(
		"SELECT remote_id, path, checksum, size, modified_at, synced_at FROM local_files WHERE path = ?",
		path,
	).Scan(&f.RemoteID, &f.Path, &f.Checksum, &f.Size, &f.ModifiedAt, &f.SyncedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return f, err
}

func (s *StateDB) UpsertFile(f LocalFile) error {
	_, err := s.db.Exec(`
		INSERT INTO local_files (remote_id, path, checksum, size, modified_at, synced_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(remote_id) DO UPDATE SET
			path = excluded.path,
			checksum = excluded.checksum,
			size = excluded.size,
			modified_at = excluded.modified_at,
			synced_at = excluded.synced_at
	`, f.RemoteID, f.Path, f.Checksum, f.Size, f.ModifiedAt, f.SyncedAt)
	return err
}

func (s *StateDB) DeleteFile(remoteID string) error {
	_, err := s.db.Exec("DELETE FROM local_files WHERE remote_id = ?", remoteID)
	return err
}

func (s *StateDB) AllFiles() ([]LocalFile, error) {
	rows, err := s.db.Query("SELECT remote_id, path, checksum, size, modified_at, synced_at FROM local_files")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []LocalFile
	for rows.Next() {
		var f LocalFile
		if err := rows.Scan(&f.RemoteID, &f.Path, &f.Checksum, &f.Size, &f.ModifiedAt, &f.SyncedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

// ─── Folders ─────────────────────────────────────────────────

func (s *StateDB) GetFolder(remoteID string) (*LocalFolder, error) {
	f := &LocalFolder{}
	err := s.db.QueryRow(
		"SELECT remote_id, path, synced_at FROM local_folders WHERE remote_id = ?",
		remoteID,
	).Scan(&f.RemoteID, &f.Path, &f.SyncedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return f, err
}

func (s *StateDB) GetFolderByPath(path string) (*LocalFolder, error) {
	f := &LocalFolder{}
	err := s.db.QueryRow(
		"SELECT remote_id, path, synced_at FROM local_folders WHERE path = ?",
		path,
	).Scan(&f.RemoteID, &f.Path, &f.SyncedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return f, err
}

func (s *StateDB) UpsertFolder(f LocalFolder) error {
	_, err := s.db.Exec(`
		INSERT INTO local_folders (remote_id, path, synced_at)
		VALUES (?, ?, ?)
		ON CONFLICT(remote_id) DO UPDATE SET
			path = excluded.path,
			synced_at = excluded.synced_at
	`, f.RemoteID, f.Path, f.SyncedAt)
	return err
}

func (s *StateDB) DeleteFolder(remoteID string) error {
	_, err := s.db.Exec("DELETE FROM local_folders WHERE remote_id = ?", remoteID)
	return err
}

func (s *StateDB) AllFolders() ([]LocalFolder, error) {
	rows, err := s.db.Query("SELECT remote_id, path, synced_at FROM local_folders")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var folders []LocalFolder
	for rows.Next() {
		var f LocalFolder
		if err := rows.Scan(&f.RemoteID, &f.Path, &f.SyncedAt); err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}
	return folders, rows.Err()
}

func (s *StateDB) ClearAll() error {
	_, err := s.db.Exec("DELETE FROM local_files; DELETE FROM local_folders; DELETE FROM sync_cursor;")
	return err
}
