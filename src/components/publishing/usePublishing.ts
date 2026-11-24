import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  asPublishingStatus,
  publishUrl,
  publishingQueryKey,
  publishingUrl,
  type PublishingScope,
} from '@/lib/publishing';

/** Publishing status; `null` when the API doesn't support publishing yet. */
export const usePublishing = (scope: PublishingScope, enabled = true) =>
  useQuery({
    queryKey: publishingQueryKey(scope),
    queryFn: async () => {
      try {
        return asPublishingStatus((await api.get(publishingUrl(scope)))?.data);
      } catch {
        return null;
      }
    },
    enabled,
  });

const useStatusMutation = <T,>(scope: PublishingScope, send: (arg: T) => Promise<unknown>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (arg: T) => {
      const response = (await send(arg)) as { data?: unknown } | undefined;
      return asPublishingStatus(response?.data);
    },
    onSuccess: (status) => {
      if (status) queryClient.setQueryData(publishingQueryKey(scope), status);
      return queryClient.invalidateQueries({ queryKey: publishingQueryKey(scope) });
    },
  });
};

export const usePublish = (scope: PublishingScope) =>
  useStatusMutation<void>(scope, () => api.post(publishUrl(scope)));

export const useSetAutoPublish = (scope: PublishingScope) =>
  useStatusMutation<boolean>(scope, (autoPublish) => api.put(publishingUrl(scope), { autoPublish }));
