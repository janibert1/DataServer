export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DELETED';
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  authProvider: 'LOCAL' | 'GOOGLE';
  storageUsed: number;
  storageQuota: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  storageKey: string;
  thumbnailKey: string | null;
  previewKey: string | null;
  folderId: string | null;
  ownerId: string;
  status: 'UPLOADING' | 'ACTIVE' | 'TRASHED' | 'DELETED';
  isTrashed: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  isVirusScanned: boolean;
  downloadCount: number;
  description: string | null;
  checksum: string | null;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  path: string;
  color: string | null;
  isShared: boolean;
  isTrashed: boolean;
  isStarred: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    children: number;
    files: number;
  };
}

export type Permission = 'VIEWER' | 'DOWNLOADER' | 'CONTRIBUTOR' | 'EDITOR' | 'OWNER';

export interface FolderShare {
  id: string;
  folderId: string;
  ownerId: string;
  recipientId: string;
  permission: Permission;
  canReshare: boolean;
  expiresAt: string | null;
  createdAt: string;
  folder?: DriveFolder;
  owner?: User;
  recipient?: User;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface Invitation {
  id: string;
  code: string;
  type: 'PLATFORM' | 'FOLDER_SHARE';
  status: 'ACTIVE' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  email: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: string | null;
  note: string | null;
  targetFolderId: string | null;
  targetPermission: Permission | null;
  createdAt: string;
  folder?: DriveFolder;
}

export interface StorageInfo {
  used: number;
  quota: number;
  available: number;
  percentage: number;
}

export interface Session {
  id: string;
  userAgent: string;
  ipAddress: string;
  lastActivity: string;
  isCurrent: boolean;
}

export interface SecurityEvent {
  id: string;
  action: string;
  ipAddress: string;
  userAgent: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  storageKey: string;
  size: number;
  checksum: string | null;
  createdAt: string;
}

export interface UploadItem {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  result?: DriveFile;
}
