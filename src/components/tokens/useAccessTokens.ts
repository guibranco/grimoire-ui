import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { accessTokensQueryKey, accessTokensUrl, revokeAccessTokenUrl } from '@/lib/accessTokens';
import type { AccessToken, CreateAccessTokenRequest, CreateAccessTokenResponse } from '@/types/api';

export const useAccessTokens = (appSlug: string) =>
  useQuery({
    queryKey: accessTokensQueryKey(appSlug),
    queryFn: async () => (await api.get<AccessToken[]>(accessTokensUrl(appSlug))).data,
  });

export const useCreateAccessToken = (appSlug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateAccessTokenRequest) =>
      (await api.post<CreateAccessTokenResponse>(accessTokensUrl(appSlug), body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessTokensQueryKey(appSlug) }),
  });
};

export const useRevokeAccessToken = (appSlug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<AccessToken>(revokeAccessTokenUrl(appSlug, id))).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessTokensQueryKey(appSlug) }),
  });
};
