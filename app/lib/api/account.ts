import { apiGet, apiPatch, apiDelete } from '@/lib/api-client';
import type { User, StorageInfo, Session, SecurityEvent } from '@/lib/types';

export function getProfile() {
  return apiGet<{ user: User }>('/api/account/profile');
}

export function updateProfile(data: { displayName?: string; avatarUrl?: string }) {
  return apiPatch<{ user: User }>('/api/account/profile', data);
}

export function getStorage() {
  return apiGet<StorageInfo>('/api/account/storage');
}

export function getSessions() {
  return apiGet<{ sessions: Session[] }>('/api/account/sessions');
}

export function revokeSession(id: string) {
  return apiDelete(`/api/account/sessions/${id}`);
}

export function revokeAllOtherSessions() {
  return apiDelete('/api/account/sessions');
}

export function getSecurityEvents() {
  return apiGet<{ events: SecurityEvent[] }>('/api/account/security-events');
}

export function deleteAccount() {
  return apiDelete('/api/account');
}
