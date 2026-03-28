import { apiFetch, apiPost } from '@/lib/api-client';
import type { User } from '@/lib/types';

export function getMe() {
  return apiFetch<{ user: User }>('/api/auth/me', { skipAuth: true });
}

export function login(email: string, password: string, totpCode?: string) {
  return apiPost<{ user: User } | { requiresTwoFactor: true }>('/api/auth/login', {
    email,
    password,
    ...(totpCode ? { totpCode } : {}),
  });
}

export function logout() {
  return apiPost('/api/auth/logout');
}

export function register(data: { invitationCode: string; email: string; password: string; displayName: string }) {
  return apiPost<{ user: User }>('/api/auth/register', data);
}

export function validateInvitation(code: string) {
  return apiPost<{ invitation: { type: string; folder?: { name: string }; permission?: string } }>(
    '/api/invitations/validate',
    { code },
  );
}

export function forgotPassword(email: string) {
  return apiPost('/api/auth/forgot-password', { email });
}

export function resetPassword(token: string, newPassword: string) {
  return apiPost('/api/auth/reset-password', { token, newPassword });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiPost('/api/auth/change-password', { currentPassword, newPassword });
}

export function setup2FA() {
  return apiFetch<{ secret: string; qrCodeUrl: string }>('/api/auth/2fa/setup');
}

export function verify2FA(token: string) {
  return apiPost<{ backupCodes: string[] }>('/api/auth/2fa/verify', { token });
}

export function disable2FA(password: string) {
  return apiPost('/api/auth/2fa/disable', { password });
}
