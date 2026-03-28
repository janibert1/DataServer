import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api-client';
import type { Notification } from '@/lib/types';

export function getNotifications() {
  return apiGet<{ notifications: Notification[]; unreadCount: number }>('/api/notifications');
}

export function markNotificationRead(id: string) {
  return apiPatch(`/api/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return apiPost('/api/notifications/read-all');
}

export function deleteNotification(id: string) {
  return apiDelete(`/api/notifications/${id}`);
}
