import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '@/lib/query-keys';
import * as authApi from '@/lib/api/auth';

export function useAuthInit() {
  const { serverUrl, setUser, setLoading } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      try {
        const data = await authApi.getMe();
        setUser(data.user);
        return data.user;
      } catch {
        setUser(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    enabled: !!serverUrl,
    retry: false,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const { setUser } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, password, totpCode }: { email: string; password: string; totpCode?: string }) =>
      authApi.login(email, password, totpCode),
    onSuccess: (data) => {
      if ('user' in data) {
        setUser(data.user);
        queryClient.setQueryData(queryKeys.auth.me, data.user);
      }
    },
  });
}

export function useRegister() {
  const { setUser } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.setQueryData(queryKeys.auth.me, data.user);
    },
  });
}

export function useLogout() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      logout();
      queryClient.clear();
    },
  });
}

export function useValidateInvitation() {
  return useMutation({
    mutationFn: (code: string) => authApi.validateInvitation(code),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, newPassword }: { token: string; newPassword: string }) =>
      authApi.resetPassword(token, newPassword),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
  });
}

export function useSetup2FA() {
  return useMutation({
    mutationFn: () => authApi.setup2FA(),
  });
}

export function useVerify2FA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => authApi.verify2FA(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });
}

export function useDisable2FA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => authApi.disable2FA(password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });
}
