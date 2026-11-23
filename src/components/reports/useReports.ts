import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DEPENDENCIES_QUERY_KEY, UNUSED_QUERY_KEY, parseGraph, parseUnused } from '@/lib/reports';
import type { DependencyGraph, Environment, UnusedSecretsResponse } from '@/types/api';

/** GET that throws on error statuses (the demo mock adapter resolves them instead of rejecting). */
async function getOrThrow(url: string, params?: Record<string, unknown>) {
  const res = await api.get(url, { params });
  if (res.status >= 400) {
    throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
  }
  return res.data;
}

/** `GET /reports/unused-secrets?days=N`. Errors (e.g. an API without #84) surface as `error`. */
export const useUnusedSecrets = (days: number) =>
  useQuery({
    queryKey: [...UNUSED_QUERY_KEY, days],
    queryFn: async (): Promise<UnusedSecretsResponse> => parseUnused(await getOrThrow('/reports/unused-secrets', { days })),
    retry: false,
    refetchOnWindowFocus: true,
  });

/** `GET /reports/dependencies`. */
export const useDependencyGraph = () =>
  useQuery({
    queryKey: DEPENDENCIES_QUERY_KEY,
    queryFn: async (): Promise<DependencyGraph> => parseGraph(await getOrThrow('/reports/dependencies')),
    retry: false,
  });

/**
 * First environment of each application, so links can open an entry's tab. Shares the
 * `['environments', slug]` cache with the application view.
 */
export function useFirstEnvironments(slugs: readonly string[]): Record<string, string | undefined> {
  const unique = [...new Set(slugs)].sort((a, b) => a.localeCompare(b));
  const results = useQueries({
    queries: unique.map((slug) => ({
      queryKey: ['environments', slug],
      queryFn: async () => (await api.get<Environment[]>(`/applications/${slug}/environments`)).data,
      staleTime: 60_000,
    })),
  });
  return Object.fromEntries(
    unique.map((slug, i) => {
      const envs = results[i]?.data;
      return [slug, Array.isArray(envs) ? envs[0]?.slug : undefined];
    })
  );
}
