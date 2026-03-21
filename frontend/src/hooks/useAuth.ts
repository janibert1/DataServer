import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, getErrorMessage } from '../lib/axios';
import { useAuthStore } from '../store/authStore';
import { User } from '../types';

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data.user as User;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!isLoading) {
      setUser(data ?? null);
    }
  }, [data, isLoading, setUser]);

  return { isLoading };
}

export function useLogin() {
  const { setUser } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string; totpCode?: string }) => {
      const res = await api.post('/auth/login', credentials);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.user) {
        setUser(data.user);
        queryClient.setQueryData(['auth', 'me'], data.user);
      }
    },
  });
}

export function useLogout() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      logout();
      queryClient.clear();
      navigate('/login');
    },
    onError: () => {
      logout();
      queryClient.clear();
      navigate('/login');
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (data: {
      invitationCode: string;
      displayName: string;
      email: string;
      password: string;
    }) => {
      const res = await api.post('/auth/register', data);
      return res.data;
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.post('/auth/forgot-password', { email }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: { token: string; password: string }) =>
      api.post('/auth/reset-password', data),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) => api.post('/auth/verify-email', { token }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => api.post('/auth/resend-verification'),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', data),
    onSuccess: () => toast.success('Password changed successfully.'),
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useSetup2FA() {
  return useQuery({
    queryKey: ['2fa', 'setup'],
    queryFn: async () => {
      const res = await api.get('/auth/2fa/setup');
      return res.data as { secret: string; qrCode: string };
    },
    enabled: false,
  });
}

export function useVerify2FA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post('/auth/2fa/verify', { code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('Two-factor authentication enabled.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useDisable2FA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.post('/auth/2fa/disable', { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('Two-factor authentication disabled.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}
