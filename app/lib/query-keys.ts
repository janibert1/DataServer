export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  files: {
    all: ['files'] as const,
    list: (params?: Record<string, unknown>) => ['files', 'list', params] as const,
    detail: (id: string) => ['files', 'detail', id] as const,
    recent: ['files', 'recent'] as const,
    starred: ['files', 'starred'] as const,
    trash: ['files', 'trash'] as const,
    versions: (id: string) => ['files', 'versions', id] as const,
  },
  folders: {
    all: ['folders'] as const,
    list: (parentId?: string | null) => ['folders', 'list', parentId] as const,
    detail: (id: string) => ['folders', 'detail', id] as const,
    contents: (id: string) => ['folders', 'contents', id] as const,
    shareInfo: (id: string) => ['folders', 'shareInfo', id] as const,
  },
  shared: {
    withMe: ['shared', 'withMe'] as const,
    byMe: ['shared', 'byMe'] as const,
  },
  account: {
    profile: ['account', 'profile'] as const,
    storage: ['account', 'storage'] as const,
    sessions: ['account', 'sessions'] as const,
    securityEvents: ['account', 'securityEvents'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
  },
  invitations: {
    all: ['invitations'] as const,
  },
};
