import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { trustPoliciesQueryKey, trustPoliciesUrl, trustPolicyUrl } from '@/lib/trustPolicies';
import type { TrustPolicy, TrustPolicyRequest } from '@/types/api';

export const useTrustPolicies = (appSlug: string) =>
  useQuery({
    queryKey: trustPoliciesQueryKey(appSlug),
    queryFn: async () => (await api.get<TrustPolicy[]>(trustPoliciesUrl(appSlug))).data,
  });

/** Creates a policy, or updates the one with `id`. */
export const useSaveTrustPolicy = (appSlug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: TrustPolicyRequest }) =>
      id
        ? (await api.put<TrustPolicy>(trustPolicyUrl(appSlug, id), body)).data
        : (await api.post<TrustPolicy>(trustPoliciesUrl(appSlug), body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trustPoliciesQueryKey(appSlug) }),
  });
};

export const useDeleteTrustPolicy = (appSlug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(trustPolicyUrl(appSlug, id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trustPoliciesQueryKey(appSlug) }),
  });
};
