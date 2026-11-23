import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/errors';
import {
  FLAGS_QUERY_KEY,
  flagEnvironmentUrl,
  flagHistoryQueryKey,
  flagQueryKey,
  flagUrl,
  flagsQueryKey,
  flagsUrl,
} from '@/lib/flags';
import type { FeatureFlag, FlagEvaluation, FlagHistoryEntry } from '@/types/api';

/** Throws on error statuses (the demo mock adapter resolves them instead of rejecting). */
export function ensureOk<T>(res: { status: number; data: T }): T {
  if (res.status >= 400) {
    throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
  }
  return res.data;
}

export const useFlags = (appSlug: string) =>
  useQuery({
    queryKey: flagsQueryKey(appSlug),
    queryFn: async () => ensureOk(await api.get<FeatureFlag[]>(flagsUrl(appSlug))),
    retry: false,
  });

export const useFlag = (appSlug: string, key: string) =>
  useQuery({
    queryKey: flagQueryKey(appSlug, key),
    queryFn: async () => ensureOk(await api.get<FeatureFlag>(flagUrl(appSlug, key))),
    retry: false,
  });

export const useFlagHistory = (appSlug: string, key: string, enabled = true) =>
  useQuery({
    queryKey: flagHistoryQueryKey(appSlug, key),
    queryFn: async () => ensureOk(await api.get<FlagHistoryEntry[]>(`${flagUrl(appSlug, key)}/history`)),
    retry: false,
    enabled,
  });

/** Stores a flag returned by a mutation and refreshes what depends on it. */
function useStoreFlag(appSlug: string) {
  const queryClient = useQueryClient();
  return (flag: FeatureFlag) => {
    queryClient.setQueryData(flagQueryKey(appSlug, flag.key), flag);
    queryClient.setQueryData<FeatureFlag[]>(flagsQueryKey(appSlug), (list) =>
      list ? list.map((f) => (f.key === flag.key ? flag : f)) : list
    );
    void queryClient.invalidateQueries({ queryKey: flagHistoryQueryKey(appSlug, flag.key) });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

/**
 * Kill switch with an optimistic update: the switch moves at once and rolls back if the API
 * refuses.
 */
export function useToggleFlag(appSlug: string) {
  const queryClient = useQueryClient();
  const store = useStoreFlag(appSlug);
  return useMutation({
    mutationFn: async ({ key, env, enabled }: { key: string; env: string; enabled: boolean }) =>
      ensureOk(await api.post<FeatureFlag>(`${flagEnvironmentUrl(appSlug, key, env)}/toggle`, { enabled })),
    onMutate: async ({ key, env, enabled }) => {
      await queryClient.cancelQueries({ queryKey: [FLAGS_QUERY_KEY, appSlug] });
      const previousList = queryClient.getQueryData<FeatureFlag[]>(flagsQueryKey(appSlug));
      const previousFlag = queryClient.getQueryData<FeatureFlag>(flagQueryKey(appSlug, key));
      const apply = (f: FeatureFlag): FeatureFlag => ({
        ...f,
        environments: f.environments.map((e) => (e.environment === env ? { ...e, enabled } : e)),
      });
      if (previousList) queryClient.setQueryData(flagsQueryKey(appSlug), previousList.map((f) => (f.key === key ? apply(f) : f)));
      if (previousFlag) queryClient.setQueryData(flagQueryKey(appSlug, key), apply(previousFlag));
      return { previousList, previousFlag };
    },
    onError: (err, { key, env }, context) => {
      if (context?.previousList) queryClient.setQueryData(flagsQueryKey(appSlug), context.previousList);
      if (context?.previousFlag) queryClient.setQueryData(flagQueryKey(appSlug, key), context.previousFlag);
      toast.error(apiErrorMessage(err, `Failed to toggle ${key} in ${env}`));
    },
    onSuccess: (flag, { env, enabled }) => {
      store(flag);
      toast.success(`${flag.key} ${enabled ? 'on' : 'off'} in ${env}`);
    },
  });
}

export function useSaveTargeting(appSlug: string, key: string) {
  const store = useStoreFlag(appSlug);
  return useMutation({
    mutationFn: async ({ env, body }: { env: string; body: unknown }) =>
      ensureOk(await api.put<FeatureFlag>(flagEnvironmentUrl(appSlug, key, env), body)),
    onSuccess: (flag, { env }) => {
      store(flag);
      toast.success(`Saved targeting for ${env}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save targeting')),
  });
}

export function useEvaluateFlag(appSlug: string, key: string) {
  return useMutation({
    mutationFn: async (body: { environment: string; context: Record<string, unknown> }) =>
      ensureOk(await api.post<FlagEvaluation>(`${flagUrl(appSlug, key)}/evaluate`, body)),
  });
}

export function useCreateFlag(appSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => ensureOk(await api.post<FeatureFlag>(flagsUrl(appSlug), body)),
    onSuccess: (flag) => {
      queryClient.setQueryData<FeatureFlag[]>(flagsQueryKey(appSlug), (list) =>
        list ? [...list, flag].sort((a, b) => a.key.localeCompare(b.key)) : list
      );
      void queryClient.invalidateQueries({ queryKey: flagsQueryKey(appSlug) });
      toast.success(`Created ${flag.key}`);
    },
  });
}

export function useUpdateFlag(appSlug: string, key: string) {
  const store = useStoreFlag(appSlug);
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => ensureOk(await api.put<FeatureFlag>(flagUrl(appSlug, key), body)),
    onSuccess: (flag) => {
      store(flag);
      toast.success(`Updated ${flag.key}`);
    },
  });
}

export function useDeleteFlag(appSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      ensureOk(await api.delete(flagUrl(appSlug, key)));
      return key;
    },
    onSuccess: (key) => {
      queryClient.setQueryData<FeatureFlag[]>(flagsQueryKey(appSlug), (list) => list?.filter((f) => f.key !== key));
      queryClient.removeQueries({ queryKey: flagQueryKey(appSlug, key), exact: true });
      void queryClient.invalidateQueries({ queryKey: flagsQueryKey(appSlug) });
      toast.success(`Deleted ${key}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete the flag')),
  });
}
