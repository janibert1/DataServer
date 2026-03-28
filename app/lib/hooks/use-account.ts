import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import * as accountApi from '@/lib/api/account';

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.account.profile,
    queryFn: accountApi.getProfile,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountApi.updateProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.account.profile });
      qc.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });
}

export function useStorage() {
  return useQuery({
    queryKey: queryKeys.account.storage,
    queryFn: accountApi.getStorage,
  });
}

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.account.sessions,
    queryFn: accountApi.getSessions,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountApi.revokeSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.account.sessions });
    },
  });
}

export function useSecurityEvents() {
  return useQuery({
    queryKey: queryKeys.account.securityEvents,
    queryFn: accountApi.getSecurityEvents,
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: accountApi.deleteAccount,
  });
}
