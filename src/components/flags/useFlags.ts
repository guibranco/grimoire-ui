import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/errors';
import {
  flagEnvironmentUrl,
  flagHistoryQueryKey,
  flagQueryKey,
  flagUrl,
  flagsQueryKey,
  flagsUrl,
  type FlagScopeRef,
} from '@/lib/flags';
import type { FeatureFlag, FlagEvaluation, FlagHistoryEntry } from '@/types/api';

/** Throws on error statuses (the demo mock adapter resolves them instead of rejecting). */
export function ensureOk<T>(res: { status: number; data: T }): T {
  if (res.status >= 400) {
    throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
  }
  return res.data;
}

export const useFlags = (scope: FlagScopeRef) =>
  useQuery({
    queryKey: flagsQueryKey(scope),
    queryFn: async () => ensureOk(await api.get<FeatureFlag[]>(flagsUrl(scope))),
    retry: false,
  });

export const useFlag = (scope: FlagScopeRef, key: string) =>
  useQuery({
    queryKey: flagQueryKey(scope, key),
    queryFn: async () => ensureOk(await api.get<FeatureFlag>(flagUrl(scope, key))),
    retry: false,
  });

export const useFlagHistory = (scope: FlagScopeRef, key: string, enabled = true) =>
  useQuery({
    queryKey: flagHistoryQueryKey(scope, key),
    queryFn: async () => ensureOk(await api.get<FlagHistoryEntry[]>(`${flagUrl(scope, key)}/history`)),
    retry: false,
    enabled,
  });

/** Stores a flag returned by a mutation and refreshes what depends on it. */
function useStoreFlag(scope: FlagScopeRef) {
  const queryClient = useQueryClient();
  return (flag: FeatureFlag) => {
    queryClient.setQueryData(flagQueryKey(scope, flag.key), flag);
    queryClient.setQueryData<FeatureFlag[]>(flagsQueryKey(scope), (list) =>
      list ? list.map((f) => (f.key === flag.key ? flag : f)) : list
    );
    void queryClient.invalidateQueries({ queryKey: flagHistoryQueryKey(scope, flag.key) });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

/**
 * Kill switch with an optimistic update: the switch moves at once and rolls back if the API
 * refuses.
 */
export function useToggleFlag(scope: FlagScopeRef) {
  const queryClient = useQueryClient();
  const store = useStoreFlag(scope);
  return useMutation({
    mutationFn: async ({ key, env, enabled }: { key: string; env: string; enabled: boolean }) =>
      ensureOk(await api.post<FeatureFlag>(`${flagEnvironmentUrl(scope, key, env)}/toggle`, { enabled })),
    onMutate: async ({ key, env, enabled }) => {
      await queryClient.cancelQueries({ queryKey: flagsQueryKey(scope) });
      const previousList = queryClient.getQueryData<FeatureFlag[]>(flagsQueryKey(scope));
      const previousFlag = queryClient.getQueryData<FeatureFlag>(flagQueryKey(scope, key));
      const apply = (f: FeatureFlag): FeatureFlag => ({
        ...f,
        environments: f.environments.map((e) => (e.environment === env ? { ...e, enabled } : e)),
      });
      if (previousList) queryClient.setQueryData(flagsQueryKey(scope), previousList.map((f) => (f.key === key ? apply(f) : f)));
      if (previousFlag) queryClient.setQueryData(flagQueryKey(scope, key), apply(previousFlag));
      return { previousList, previousFlag };
    },
    onError: (err, { key, env }, context) => {
      if (context?.previousList) queryClient.setQueryData(flagsQueryKey(scope), context.previousList);
      if (context?.previousFlag) queryClient.setQueryData(flagQueryKey(scope, key), context.previousFlag);
      toast.error(apiErrorMessage(err, `Failed to toggle ${key} in ${env}`));
    },
    onSuccess: (flag, { env, enabled }) => {
      store(flag);
      toast.success(`${flag.key} ${enabled ? 'on' : 'off'} in ${env}`);
    },
  });
}

export function useSaveTargeting(scope: FlagScopeRef, key: string) {
  const store = useStoreFlag(scope);
  return useMutation({
    mutationFn: async ({ env, body }: { env: string; body: unknown }) =>
      ensureOk(await api.put<FeatureFlag>(flagEnvironmentUrl(scope, key, env), body)),
    onSuccess: (flag, { env }) => {
      store(flag);
      toast.success(`Saved targeting for ${env}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save targeting')),
  });
}

export function useEvaluateFlag(scope: FlagScopeRef, key: string) {
  return useMutation({
    mutationFn: async (body: { environment: string; context: Record<string, unknown> }) =>
      ensureOk(await api.post<FlagEvaluation>(`${flagUrl(scope, key)}/evaluate`, body)),
  });
}

export function useCreateFlag(scope: FlagScopeRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => ensureOk(await api.post<FeatureFlag>(flagsUrl(scope), body)),
    onSuccess: (flag) => {
      queryClient.setQueryData<FeatureFlag[]>(flagsQueryKey(scope), (list) =>
        list ? [...list, flag].sort((a, b) => a.key.localeCompare(b.key)) : list
      );
      void queryClient.invalidateQueries({ queryKey: flagsQueryKey(scope) });
      toast.success(`Created ${flag.key}`);
    },
  });
}

export function useUpdateFlag(scope: FlagScopeRef, key: string) {
  const store = useStoreFlag(scope);
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => ensureOk(await api.put<FeatureFlag>(flagUrl(scope, key), body)),
    onSuccess: (flag) => {
      store(flag);
      toast.success(`Updated ${flag.key}`);
    },
  });
}

export function useDeleteFlag(scope: FlagScopeRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      ensureOk(await api.delete(flagUrl(scope, key)));
      return key;
    },
    onSuccess: (key) => {
      queryClient.setQueryData<FeatureFlag[]>(flagsQueryKey(scope), (list) => list?.filter((f) => f.key !== key));
      queryClient.removeQueries({ queryKey: flagQueryKey(scope, key), exact: true });
      void queryClient.invalidateQueries({ queryKey: flagsQueryKey(scope) });
      toast.success(`Deleted ${key}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete the flag')),
  });
}
