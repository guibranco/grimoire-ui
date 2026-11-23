import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { importUrl, type ImportScope } from '@/lib/importer';
import { ensureOk } from '@/components/flags/useFlags';
import type { ImportPlan, ImportRequest } from '@/types/api';

/** The dry-run plan for `request`; re-fetched whenever the request changes. */
export function useImportPlan(scope: ImportScope, environment: string, request: ImportRequest, enabled: boolean) {
  return useQuery({
    queryKey: ['import-plan', scope, environment, request],
    queryFn: async () => ensureOk(await api.post<ImportPlan>(importUrl(scope, environment, true), request)),
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Applies the import, then refreshes everything it may have changed. */
export function useApplyImport(scope: ImportScope, environment: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: ImportRequest) =>
      ensureOk(await api.post<ImportPlan>(importUrl(scope, environment, false), request)),
    onSuccess: () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'import-plan' }),
  });
}
