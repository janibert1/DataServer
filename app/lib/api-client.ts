import { useAuthStore } from '@/stores/auth-store';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(typeof data === 'object' && data && 'message' in data ? (data as { message: string }).message : `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit & { skipAuth?: boolean },
): Promise<T> {
  const { serverUrl } = useAuthStore.getState();
  if (!serverUrl) throw new Error('Server URL not configured');

  const { skipAuth, ...fetchOptions } = options ?? {};

  const res = await fetch(`${serverUrl}${path}`, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    },
  });

  if (res.status === 401 && !skipAuth) {
    useAuthStore.getState().logout();
  }

  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = { message: res.statusText };
    }
    throw new ApiError(res.status, data);
  }

  if (res.status === 204) return undefined as T;

  return res.json();
}

export function apiGet<T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined | null>) {
  let url = path;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== '') searchParams.set(key, String(value));
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }
  return apiFetch<T>(url);
}

export function apiPost<T = unknown>(path: string, body?: unknown, options?: RequestInit) {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });
}

export function apiPatch<T = unknown>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T = unknown>(path: string) {
  return apiFetch<T>(path, { method: 'DELETE' });
}
