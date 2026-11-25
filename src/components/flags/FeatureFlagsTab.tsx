import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertOctagon, Flag, Loader2, Plus, Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { RelativeTime } from '@/components/dashboard/parts';
import { cn } from '@/lib/utils';
import {
  ALL_ENVIRONMENTS,
  effectiveStateFor,
  flagPagePath,
  flagTypeLabel,
  followsAllEnvironments,
  isProductionEnvironment,
  targetingSummary,
  type FlagScopeRef,
} from '@/lib/flags';
import type { Environment, FeatureFlag } from '@/types/api';
import { FlagDetail } from './FlagDetail';
import { FlagFormModal } from './FlagFormModal';
import { selectClass } from './parts';
import { useFlags, useToggleFlag } from './useFlags';

interface PendingToggle {
  flag: FeatureFlag;
  env: Environment;
  enabled: boolean;
}

/** Flags list: search, tag filter, a switch per environment and the selected environment's targeting. */
const FlagList: React.FC<{ scope: FlagScopeRef; envs: Environment[]; envSlug: string; startCreating?: boolean }> = ({
  scope,
  envs,
  envSlug,
  startCreating = false,
}) => {
  const navigate = useNavigate();
  const { data, isPending, error } = useFlags(scope);
  const toggle = useToggleFlag(scope);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [targetingEnv, setTargetingEnv] = useState(envSlug);
  const [creating, setCreating] = useState(startCreating);
  useEffect(() => {
    if (startCreating) setCreating(true);
  }, [startCreating]);
  const [confirming, setConfirming] = useState<PendingToggle | null>(null);

  const flags = data ?? [];
  const tags = useMemo(() => [...new Set(flags.flatMap((f) => f.tags))].sort((a, b) => a.localeCompare(b)), [flags]);
  const visible = flags.filter(
    (f) =>
      (!tag || f.tags.includes(tag)) &&
      (!query ||
        f.key.toLowerCase().includes(query.toLowerCase()) ||
        (f.description ?? '').toLowerCase().includes(query.toLowerCase()))
  );
  const open = (key: string) => navigate(flagPagePath(scope, envSlug, key));

  const requestToggle = (flag: FeatureFlag, env: Environment, enabled: boolean) => {
    if (isProductionEnvironment(env)) setConfirming({ flag, env, enabled });
    else toggle.mutate({ key: flag.key, env: env.slug, enabled });
  };

  let body: React.ReactNode;
  if (isPending) {
    body = (
      <div className="flex items-center justify-center py-16" aria-busy="true" aria-label="Loading feature flags">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  } else if (error) {
    body = (
      <div role="alert" className="flex flex-col items-center gap-3 py-12 border border-red-500/30 bg-red-500/5 text-center">
        <AlertOctagon className="w-6 h-6 text-red-400" aria-hidden="true" />
        <h3 className="text-sm font-bold text-zinc-100">Couldn't load feature flags</h3>
        <p className="text-xs text-zinc-500 max-w-sm">
          Check the connection, or that the API is recent enough to provide{' '}
          <code className="font-mono text-zinc-400">/feature-flags</code>.
        </p>
      </div>
    );
  } else if (flags.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-3 py-14 border border-dashed border-zinc-800 text-center">
        <Flag className="w-6 h-6 text-flags" aria-hidden="true" />
        <h3 className="text-sm font-bold text-zinc-100">No feature flags yet</h3>
        <p className="text-xs text-zinc-500 max-w-sm">
          Flags switch features on per environment and roll them out to a percentage of users, specific users or
          attribute values. Apps evaluate them locally.
        </p>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 h-8 px-3 bg-flags text-xs font-bold text-black">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New flag
        </button>
      </div>
    );
  } else {
    const selectedEnv = envs.find((e) => e.slug === targetingEnv) ?? envs[0];
    body = (
      <div className="border border-border overflow-x-auto">
        <table className="w-full text-left" aria-label="Feature flags">
          <thead className="bg-black/40">
            <tr className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
              <th scope="col" className="px-4 h-8">Key</th>
              <th scope="col" className="px-3 h-8">Type</th>
              {envs.map((e) => (
                <th key={e.slug} scope="col" className="px-3 h-8 text-center font-mono normal-case tracking-normal">
                  {e.slug}
                </th>
              ))}
              <th scope="col" className="px-3 h-8">Targeting</th>
              <th scope="col" className="px-3 h-8 hidden md:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((flag) => (
              <tr
                key={flag.key}
                onClick={() => open(flag.key)}
                className="border-t border-zinc-900 hover:bg-zinc-900/60 cursor-pointer"
              >
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      open(flag.key);
                    }}
                    className="font-mono text-sm text-zinc-200 hover:text-flags text-left break-all"
                  >
                    {flag.key}
                  </button>
                  {flag.description && <span className="block text-[11px] text-zinc-500 truncate max-w-xs">{flag.description}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-400 whitespace-nowrap">{flagTypeLabel(flag)}</td>
                {envs.map((e) => {
                  const on = effectiveStateFor(scope, flag, e.slug).enabled;
                  const follows = followsAllEnvironments(scope, flag, e.slug);
                  return (
                    <td
                      key={e.slug}
                      className="px-3 py-2 text-center"
                      title={follows ? 'Follows *; switching overrides it here' : undefined}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <Switch
                        size="sm"
                        checked={on}
                        onCheckedChange={(checked) => requestToggle(flag, e, checked)}
                        aria-label={follows ? `${flag.key} in ${e.slug} (follows *)` : `${flag.key} in ${e.slug}`}
                        className={cn('data-checked:bg-flags', follows && 'opacity-40')}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-2 font-mono text-xs text-zinc-400 whitespace-nowrap">
                  {selectedEnv ? targetingSummary(flag, effectiveStateFor(scope, flag, selectedEnv.slug)) : '—'}
                  {selectedEnv && followsAllEnvironments(scope, flag, selectedEnv.slug) && <span className="ml-1 text-zinc-600">(*)</span>}
                </td>
                <td className="px-3 py-2 hidden md:table-cell text-xs text-zinc-500 whitespace-nowrap">
                  <RelativeTime value={flag.updatedAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-900 text-[11px] text-zinc-500">
          <span>
            {visible.length === flags.length ? `${flags.length}` : `${visible.length} of ${flags.length}`} flag
            {flags.length === 1 ? '' : 's'}
          </span>
          <span>Click a switch to turn a flag on or off; production asks first.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
            <input
              aria-label="Search flags"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search flags…"
              className="h-8 w-56 pl-7 pr-2 bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Tag</span>
            <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} className={selectClass}>
              <option value="">all</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Targeting in</span>
            <select aria-label="Targeting environment" value={targetingEnv} onChange={(e) => setTargetingEnv(e.target.value)} className={selectClass}>
              {envs.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.slug}
                </option>
              ))}
            </select>
          </label>
        </div>
        {flags.length > 0 && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 h-8 px-3 bg-flags text-xs font-bold text-black hover:bg-flags/90 self-start"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New flag
          </button>
        )}
      </div>

      {body}

      <FlagFormModal scope={scope} open={creating} onOpenChange={setCreating} onCreated={(f) => open(f.key)} />
      <ConfirmationModal
        open={!!confirming}
        onOpenChange={(v) => !v && setConfirming(null)}
        title={`Turn ${confirming?.flag.key ?? ''} ${confirming?.enabled ? 'on' : 'off'} in ${confirming?.env.slug ?? ''}?`}
        description={
          confirming?.env.slug === ALL_ENVIRONMENTS
            ? 'This changes every environment that follows *, in every application that inherits global flags.'
            : 'This changes what production users get as soon as their apps refresh flags.'
        }
        confirmText={confirming?.enabled ? 'Turn on' : 'Turn off'}
        onConfirm={async () => {
          if (!confirming) return;
          await toggle.mutateAsync({ key: confirming.flag.key, env: confirming.env.slug, enabled: confirming.enabled }).catch(() => undefined);
        }}
      />
    </div>
  );
};

/**
 * Route content for `/apps/:app/:env/flags` (guibranco/grimoire-ui#453) and `/global/flags`: the flag list, or a
 * flag's detail with `?flag=key` (`&view=history` for its history). `startCreating` opens the create form.
 */
export const FeatureFlagsTab: React.FC<{
  scope: FlagScopeRef;
  envs: Environment[];
  envSlug: string | null;
  startCreating?: boolean;
}> = ({ scope, envs, envSlug, startCreating = false }) => {
  const [searchParams] = useSearchParams();
  const flagKey = searchParams.get('flag');
  const view = searchParams.get('view') === 'history' ? 'history' : 'targeting';

  if (!envSlug || envs.length === 0) {
    return <p className="p-6 text-xs text-zinc-500">Add an environment to use feature flags.</p>;
  }
  return flagKey ? (
    <FlagDetail scope={scope} flagKey={flagKey} envs={envs} envSlug={envSlug} view={view} />
  ) : (
    <FlagList scope={scope} envs={envs} envSlug={envSlug} startCreating={startCreating} />
  );
};
