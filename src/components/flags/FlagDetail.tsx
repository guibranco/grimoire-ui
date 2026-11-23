import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertOctagon, ArrowLeft, FlaskConical, Loader2, Pencil, Trash2 } from 'lucide-react';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { cn } from '@/lib/utils';
import { flagsPath, type FlagView } from '@/lib/routes';
import {
  attributeSuggestions,
  flagTypeLabel,
  isProductionEnvironment,
  savedTargetingBody,
  stateFor,
  targetingBody,
  targetingDraft,
  targetingText,
  validateTargeting,
  type TargetingDraft,
} from '@/lib/flags';
import type { Environment, FeatureFlag } from '@/types/api';
import { FlagFormModal } from './FlagFormModal';
import { FlagHistoryPanel } from './FlagHistoryPanel';
import { ReviewChangesDialog } from './ReviewChangesDialog';
import { TargetingEditor } from './TargetingEditor';
import { TestPanel } from './TestPanel';
import { useDeleteFlag, useFlag, useFlags, useSaveTargeting } from './useFlags';

/** Targeting of one environment, with an unsaved-changes bar and a review step before saving. */
const TargetingSection: React.FC<{ appSlug: string; flag: FeatureFlag; env: Environment; attributes: string[]; onDirtyChange: (dirty: boolean) => void }> = ({
  appSlug,
  flag,
  env,
  attributes,
  onDirtyChange,
}) => {
  const state = stateFor(flag, env.slug);
  const [draft, setDraft] = useState<TargetingDraft>(() => targetingDraft(flag, state));
  const [showErrors, setShowErrors] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const save = useSaveTargeting(appSlug, flag.key);

  // A saved change (here or elsewhere), an edited flag or another environment starts a fresh draft.
  const baseline = `${env.slug}:${state.version}:${flag.updatedAt}`;
  useEffect(() => {
    setDraft(targetingDraft(flag, stateFor(flag, env.slug)));
    setShowErrors(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline]);

  const saved = useMemo(() => targetingText(savedTargetingBody(flag, state)), [flag, state]);
  const current = useMemo(() => targetingText(targetingBody(flag, draft)), [flag, draft]);
  const errors = useMemo(() => validateTargeting(flag, draft), [flag, draft]);
  const dirty = saved !== current;
  const valid = Object.keys(errors).length === 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const review = () => {
    setShowErrors(true);
    if (valid) setReviewing(true);
  };

  const confirm = () =>
    save.mutate(
      { env: env.slug, body: targetingBody(flag, draft) },
      { onSuccess: () => setReviewing(false) }
    );

  return (
    <div className="space-y-4 pb-16">
      <TargetingEditor
        flag={flag}
        environment={env.slug}
        draft={draft}
        onChange={setDraft}
        errors={showErrors ? errors : {}}
        attributes={attributes}
      />
      {dirty && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-0 flex items-center justify-between gap-3 border border-flags/40 bg-[#0A0A0B]/95 backdrop-blur px-3 py-2"
        >
          <span className="flex items-center gap-2 text-xs text-flags">
            <span className="w-2 h-2 rounded-full bg-flags" aria-hidden="true" />
            Unsaved changes
            {showErrors && !valid && <span className="text-red-400">· fix the highlighted fields</span>}
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(targetingDraft(flag, state));
                setShowErrors(false);
              }}
              className="h-7 px-3 border border-zinc-700 text-xs text-zinc-300 hover:text-zinc-100"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={review}
              disabled={showErrors && !valid}
              className="h-7 px-3 bg-flags text-xs font-bold text-black hover:bg-flags/90 disabled:opacity-50"
            >
              Review &amp; save
            </button>
          </span>
        </div>
      )}
      <ReviewChangesDialog
        open={reviewing}
        onOpenChange={setReviewing}
        flagKey={flag.key}
        environment={env.slug}
        production={isProductionEnvironment(env)}
        before={saved}
        after={current}
        saving={save.isPending}
        onConfirm={confirm}
      />
    </div>
  );
};

/** Flag detail: header, environment selector, targeting or history, and the test panel. */
export const FlagDetail: React.FC<{ appSlug: string; flagKey: string; envs: Environment[]; envSlug: string; view: FlagView }> = ({
  appSlug,
  flagKey,
  envs,
  envSlug,
  view,
}) => {
  const navigate = useNavigate();
  const { data: flag, isPending, error } = useFlag(appSlug, flagKey);
  const { data: allFlags } = useFlags(appSlug);
  const remove = useDeleteFlag(appSlug);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const attributes = useMemo(() => attributeSuggestions(allFlags ?? (flag ? [flag] : [])), [allFlags, flag]);
  const env = envs.find((e) => e.slug === envSlug) ?? envs[0];
  const back = flagsPath(appSlug, envSlug);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16" aria-busy="true" aria-label="Loading flag">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }
  if (error || !flag) {
    return (
      <div role="alert" className="m-4 md:m-6 flex flex-col items-center gap-3 py-12 border border-red-500/30 bg-red-500/5 text-center">
        <AlertOctagon className="w-6 h-6 text-red-400" aria-hidden="true" />
        <h3 className="text-sm font-bold text-zinc-100">Flag not found</h3>
        <Link to={back} className="text-xs text-flags hover:underline">
          Back to flags
        </Link>
      </div>
    );
  }

  const tab = (v: FlagView, label: string) => (
    <Link
      to={flagsPath(appSlug, envSlug, flag.key, v)}
      aria-current={view === v ? 'page' : undefined}
      className={cn(
        'px-3 h-8 inline-flex items-center text-xs font-semibold border-b-2 -mb-px',
        view === v ? 'border-flags text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-200'
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <Link to={back} className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-200">
            <ArrowLeft className="w-3 h-3" aria-hidden="true" /> Flags
          </Link>
          <h2 className="flex flex-wrap items-center gap-2 font-mono text-lg text-zinc-100 break-all">
            {flag.key}
            <span className="px-1.5 py-0.5 border border-flags/40 bg-flags/10 font-sans text-[10px] font-bold uppercase tracking-widest text-flags">
              {flagTypeLabel(flag)}
            </span>
            {flag.tags.map((t) => (
              <span key={t} className="font-sans text-[11px] text-zinc-500">
                #{t}
              </span>
            ))}
          </h2>
          {flag.description && <p className="text-xs text-zinc-400">{flag.description}</p>}
          <p className="text-[11px] text-zinc-600">
            Variants:{' '}
            {flag.variants.map((v, i) => (
              <span key={v.key} className="font-mono text-zinc-400">
                {i > 0 && ', '}
                {v.key}
                {v.key === flag.defaultVariant && <span className="text-zinc-600"> (default)</span>}
              </span>
            ))}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTesting((t) => !t)}
            aria-pressed={testing}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 border border-zinc-800 text-xs text-zinc-300 hover:text-zinc-100 aria-pressed:border-flags aria-pressed:text-flags"
          >
            <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" /> Test
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 border border-zinc-800 text-xs text-zinc-300 hover:text-zinc-100"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Edit
          </button>
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 border border-zinc-800 text-xs text-zinc-300 hover:border-red-500/50 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete
          </button>
        </div>
      </header>

      <nav aria-label="Flag view" className="flex items-center border-b border-border">
        {tab('targeting', 'Targeting')}
        {tab('history', 'History')}
      </nav>

      <div className="flex flex-col xl:flex-row gap-4 items-stretch">
        <div className="flex-1 min-w-0 space-y-4">
          {view === 'history' && <FlagHistoryPanel appSlug={appSlug} flagKey={flag.key} />}
          {view !== 'history' && !env && <p className="text-xs text-zinc-500">Add an environment to configure targeting.</p>}
          {view !== 'history' && env && (
            <>
              <nav aria-label="Environment" className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[10px] uppercase font-bold tracking-widest text-zinc-500">Environment</span>
                {envs.map((e) => {
                  const active = e.slug === env.slug;
                  const pill = cn(
                    'h-7 px-3 inline-flex items-center gap-1.5 border text-xs font-mono',
                    active ? 'border-flags bg-flags/10 text-flags' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  );
                  const on = stateFor(flag, e.slug).enabled;
                  const dot = <span className={cn('w-1.5 h-1.5 rounded-full', on ? 'bg-flags' : 'bg-zinc-700')} aria-hidden="true" />;
                  return active || dirty ? (
                    <span
                      key={e.slug}
                      aria-current={active ? 'true' : undefined}
                      title={active ? undefined : 'Save or discard your changes first'}
                      className={cn(pill, !active && 'opacity-50 cursor-not-allowed')}
                    >
                      {dot}
                      {e.slug}
                    </span>
                  ) : (
                    <Link key={e.slug} to={flagsPath(appSlug, e.slug, flag.key)} className={pill}>
                      {dot}
                      {e.slug}
                    </Link>
                  );
                })}
              </nav>
              <TargetingSection appSlug={appSlug} flag={flag} env={env} attributes={attributes} onDirtyChange={setDirty} />
            </>
          )}
        </div>
        {testing && env && (
          <TestPanel appSlug={appSlug} flagKey={flag.key} environments={envs} initialEnvironment={env.slug} onClose={() => setTesting(false)} />
        )}
      </div>

      <FlagFormModal appSlug={appSlug} open={editing} onOpenChange={setEditing} flag={flag} />
      <ConfirmationModal
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${flag.key}?`}
        description="Deletes the flag in every environment. Consumers stop receiving it; its history is kept."
        confirmText="Delete"
        variant="destructive"
        onConfirm={async () => {
          try {
            await remove.mutateAsync(flag.key);
            navigate(back);
          } catch {
            // The mutation's onError already showed the problem.
          }
        }}
      />
    </div>
  );
};
