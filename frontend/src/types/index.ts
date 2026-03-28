// ─── Enums ───────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'USER';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type AuthProvider = 'LOCAL' | 'GOOGLE';
export type FileStatus = 'UPLOADING' | 'PROCESSING' | 'ACTIVE' | 'TRASHED' | 'DELETED';
export type InvitationType = 'PLATFORM' | 'FOLDER_SHARE';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
export type SharePermission = 'VIEWER' | 'DOWNLOADER' | 'CONTRIBUTOR' | 'EDITOR' | 'OWNER';
export type NotificationType =
  | 'FOLDER_SHARED'
  | 'INVITATION_ACCEPTED'
  | 'ACCESS_REVOKED'
  | 'STORAGE_NEARLY_FULL'
  | 'SUSPICIOUS_LOGIN'
  | 'SECURITY_CHANGE'
  | 'FILE_FLAGGED';

export type AuditAction =
  | 'USER_REGISTERED' | 'USER_LOGIN' | 'USER_LOGIN_FAILED' | 'USER_LOGOUT'
  | 'USER_DELETED' | 'USER_SUSPENDED' | 'USER_RESTORED'
  | 'PASSWORD_CHANGED' | 'PASSWORD_RESET_REQUESTED' | 'EMAIL_VERIFIED'
  | 'TWO_FACTOR_ENABLED' | 'TWO_FACTOR_DISABLED'
  | 'INVITATION_CREATED' | 'INVITATION_ACCEPTED' | 'INVITATION_REVOKED'
  | 'FILE_UPLOADED' | 'FILE_DOWNLOADED' | 'FILE_DELETED' | 'FILE_RESTORED'
  | 'FILE_PERMANENTLY_DELETED' | 'FILE_MOVED' | 'FILE_RENAMED' | 'FILE_SHARED' | 'FILE_UNSHARED'
  | 'FOLDER_CREATED' | 'FOLDER_DELETED' | 'FOLDER_RENAMED' | 'FOLDER_MOVED'
  | 'FOLDER_SHARED' | 'FOLDER_UNSHARED'
  | 'PERMISSION_CHANGED' | 'QUOTA_CHANGED' | 'ADMIN_ACTION' | 'VIRUS_DETECTED' | 'FILE_FLAGGED';

// ─── Core Models ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  authProvider: AuthProvider;
  storageQuotaBytes: string;
  storageUsedBytes: string;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  thumbnailKey: string | null;
  previewKey: string | null;
  status: FileStatus;
  folderId: string | null;
  path: string;
  downloadCount: number;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt: string | null;
  isVirusScanned: boolean;
  isFlagged: boolean;
  description: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  path: string;
  depth: number;
  isShared: boolean;
  color: string | null;
  description: string | null;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt: string | null;
  fileCount: number;
  folderCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  storageKey: string;
  size: string;
  checksum: string;
  mimeType: string;
  createdById: string;
  createdAt: string;
}

export interface Invitation {
  id: string;
  code: string;
  type: InvitationType;
  status: InvitationStatus;
  creatorId: string;
  creator?: { id: string; displayName: string; email: string };
  maxUses: number;
  useCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  targetFolderId: string | null;
  targetFolder: { id: string; name: string } | null;
  targetPermission: SharePermission | null;
  email: string | null;
  note: string | null;
  usedByUsers: { id: string; displayName: string; email: string }[];
  createdAt: string;
}

export interface FolderShare {
  id: string;
  folderId: string;
  folder?: DriveFolder;
  ownerId: string;
  owner?: { id: string; displayName: string; avatarUrl: string | null };
  recipientId: string | null;
  recipient?: { id: string; displayName: string; email: string; avatarUrl: string | null };
  recipientEmail: string | null;
  permission: SharePermission;
  canReshare: boolean;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  senderId: string | null;
  sender?: { id: string; displayName: string; avatarUrl: string | null };
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  user?: { id: string; displayName: string; email: string } | null;
  action: AuditAction;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface StoragePolicy {
  id: string;
  defaultQuotaBytes: string;
  maxFileSizeBytes: string;
  allowedMimeTypes: string[];
  blockedExtensions: string[];
  trashRetentionDays: number;
  versionRetentionCount: number;
  totalDriveCapacityBytes: string | null;
}

// ─── API Response types ──────────────────────────────────────

export interface ApiResponse<T = void> {
  data?: T;
  message?: string;
  error?: string;
  errors?: { msg: string; field: string }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// ─── Upload ──────────────────────────────────────────────────

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  result?: DriveFile;
}

// ─── UI ──────────────────────────────────────────────────────

export type ViewMode = 'grid' | 'list';
export type SortField = 'name' | 'updatedAt' | 'createdAt' | 'size' | 'mimeType';
export type SortDir = 'asc' | 'desc';

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}
