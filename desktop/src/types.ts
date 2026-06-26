export interface FolderConfig {
  path: string;
  enabled: boolean;
}

export interface Config {
  server_url: string;
  api_token: string;
  source_name: string;
  folders: FolderConfig[];
  excludes: string[];
  auto_sync_minutes: number;
  last_sync: string | null;
  sync_on_startup: boolean;
  max_file_size_mb: number;
  smart_excludes: string[];
}

export interface SmartExcludeCategory {
  id: string;
  label: string;
  description: string;
  icon: string;
  patterns: string[];
}

export interface SyncProgress {
  current: number;
  total: number;
  current_file: string;
  errors: number;
}

export interface SyncResult {
  uploaded: number;
  skipped: number;
  errors: number;
}

export type SyncState = 'idle' | 'syncing' | 'done' | 'error';
