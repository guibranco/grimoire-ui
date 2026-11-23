import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EXPIRING_QUERY_KEY, parseExpiring } from '@/lib/rotation';
import type { ExpiringSecretsResponse } from '@/types/api';

/** `GET /secrets/expiring?withinDays=N`. Errors (e.g. an API without #78) surface as `error`. */
export const useExpiringSecrets = (withinDays: number, enabled = true) =>
  useQuery({
    queryKey: [...EXPIRING_QUERY_KEY, withinDays],
    queryFn: async (): Promise<ExpiringSecretsResponse> => {
      const res = await api.get('/secrets/expiring', { params: { withinDays } });
      // The demo mock adapter resolves error statuses instead of rejecting like axios does.
      if (res.status >= 400) {
        throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      }
      return parseExpiring(res.data);
    },
    enabled,
    retry: false,
    refetchOnWindowFocus: true,
  });
