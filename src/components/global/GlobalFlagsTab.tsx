import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ALL_ENVIRONMENTS, GLOBAL_SCOPE } from '@/lib/flags';
import type { Environment, GlobalEnvironment } from '@/types/api';
import { FeatureFlagsTab } from '@/components/flags/FeatureFlagsTab';
import { useFlags } from '@/components/flags/useFlags';

/**
 * Global feature flags (guibranco/grimoire-ui#453): `*` applies to every environment, and an
 * environment slug overrides it there, in every application that inherits globals.
 */
export const GlobalFlagsTab: React.FC<{ startCreating?: boolean }> = ({ startCreating = false }) => {
  const [searchParams] = useSearchParams();
  const { data: globalEnvs } = useQuery({
    queryKey: ['global-environments'],
    queryFn: async () => (await api.get<GlobalEnvironment[]>('/global/environments')).data,
  });
  const { data: flags } = useFlags(GLOBAL_SCOPE);

  // `*` first, then every environment slug an application uses or a flag overrides.
  const envs = useMemo<Environment[]>(() => {
    const slugs = new Set<string>();
    (Array.isArray(globalEnvs) ? globalEnvs : []).forEach((e) => slugs.add(e.slug));
    (flags ?? []).forEach((f) => f.environments.forEach((s) => slugs.add(s.environment)));
    slugs.delete(ALL_ENVIRONMENTS);
    return [
      { slug: ALL_ENVIRONMENTS, name: 'All environments' },
      ...[...slugs].sort((a, b) => a.localeCompare(b)).map((slug) => ({ slug, name: slug })),
    ];
  }, [globalEnvs, flags]);

  const requested = searchParams.get('env');
  const envSlug = requested && envs.some((e) => e.slug === requested) ? requested : ALL_ENVIRONMENTS;
  return <FeatureFlagsTab scope={GLOBAL_SCOPE} envs={envs} envSlug={envSlug} startCreating={startCreating} />;
};
