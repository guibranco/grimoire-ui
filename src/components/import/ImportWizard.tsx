import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FieldLabel, selectClass } from '@/components/flags/parts';
import { apiErrorMessage } from '@/lib/errors';
import { DEFAULT_SECRET_KEYS, IMPORT_FORMATS, detectFormat, parsePatterns, type ImportScope } from '@/lib/importer';
import type { ImportFormat, ImportKind, ImportPlan, ImportRequest } from '@/types/api';
import { ImportReview } from './ImportReview';
import { useApplyImport, useImportPlan } from './useImportPlan';

export interface ImportEnvironment {
  slug: string;
  label: string;
}

interface Props {
  scope: ImportScope;
  environments: ImportEnvironment[];
  /** The environment selected when the wizard opens. */
  defaultEnvironment: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'source' | 'options' | 'review' | 'done';

const STEPS: { id: Step; label: string }[] = [
  { id: 'source', label: 'File' },
  { id: 'options', label: 'Environment' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

interface Draft {
  fileName: string | null;
  content: string;
  format: ImportFormat;
  /** Whether the user picked the format, so typing no longer re-detects it. */
  formatChosen: boolean;
  environment: string;
  patterns: string;
  overwrite: boolean;
  kinds: Record<string, ImportKind>;
  exclude: string[];
}

const emptyDraft = (environment: string): Draft => ({
  fileName: null,
  content: '',
  format: 'env',
  formatChosen: false,
  environment,
  patterns: DEFAULT_SECRET_KEYS.join('\n'),
  overwrite: false,
  kinds: {},
  exclude: [],
});

const textareaClass =
  'w-full bg-zinc-950 border border-zinc-800 p-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600';

const requestOf = (d: Draft): ImportRequest => ({
  format: d.format,
  content: d.content,
  secretKeys: parsePatterns(d.patterns),
  onConflict: d.overwrite ? 'overwrite' : 'skip',
  kinds: d.kinds,
  exclude: d.exclude,
});

/**
 * Import a .env, appsettings.json, PHP config or JSON file (guibranco/grimoire-ui#449): pick the
 * file, the environment and which keys are secrets, review the dry-run plan, then apply it.
 */
export const ImportWizard: React.FC<Props> = ({ scope, environments, defaultEnvironment, open, onOpenChange }) => {
  const [step, setStep] = useState<Step>('source');
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultEnvironment ?? ''));
  const [result, setResult] = useState<ImportPlan | null>(null);
  const request = requestOf(draft);
  const plan = useImportPlan(scope, draft.environment, request, open && step === 'review');
  const apply = useApplyImport(scope, draft.environment);

  // Start over each time the wizard opens (only then: the environment list is rebuilt on every render).
  const firstEnvironment = defaultEnvironment ?? environments[0]?.slug ?? '';
  useEffect(() => {
    if (open) {
      setStep('source');
      setDraft(emptyDraft(firstEnvironment));
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setContent = (content: string, fileName = draft.fileName) =>
    set({ content, fileName, format: draft.formatChosen ? draft.format : detectFormat(fileName, content) });

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    setDraft((d) => ({ ...d, content, fileName: file.name, format: detectFormat(file.name, content), formatChosen: false }));
  };

  const commit = async () => {
    try {
      setResult(await apply.mutateAsync(request));
      setStep('done');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Import failed; nothing was written'));
    }
  };

  const canContinue: Record<Step, boolean> = {
    source: draft.content.trim().length > 0,
    options: draft.environment.length > 0,
    review: !!plan.data && plan.data.summary.create + plan.data.summary.update > 0 && !plan.isFetching,
    done: true,
  };
  const index = STEPS.findIndex((s) => s.id === step);
  const canGoBack = index > 0 && step !== 'done';
  let secondaryLabel = 'Cancel';
  if (step === 'done') secondaryLabel = 'Done';
  else if (canGoBack) secondaryLabel = 'Back';

  const stepBody = () => {
    switch (step) {
      case 'source':
        return <SourceStep draft={draft} set={set} setContent={setContent} readFile={readFile} />;
      case 'options':
        return <OptionsStep draft={draft} set={set} environments={environments} />;
      case 'review':
        return (
          <ImportReview
            plan={plan.data}
            loading={plan.isFetching}
            error={plan.error ? apiErrorMessage(plan.error, 'Could not read the file') : null}
            overwrite={draft.overwrite}
            onOverwrite={(overwrite) => set({ overwrite })}
            onKind={(key, kind) => set({ kinds: { ...draft.kinds, [key]: kind } })}
            onInclude={(key, include) =>
              set({ exclude: include ? draft.exclude.filter((k) => k !== key) : [...draft.exclude, key] })
            }
          />
        );
      default:
        return result && <DoneStep result={result} />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !apply.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-3xl bg-card border-2 border-border p-0 gap-0 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 space-y-5 overflow-y-auto">
          <DialogHeader>
            <div className="w-10 h-10 bg-grimoire/10 border-2 border-grimoire/40 flex items-center justify-center mb-3">
              <FileUp className="w-5 h-5 text-grimoire" aria-hidden="true" />
            </div>
            <DialogTitle className="text-lg font-bold tracking-tight uppercase">
              Import {scope === 'global' ? 'global values' : 'values'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Bring an existing .env, appsettings.json or PHP config into Grimoire. Nothing is written until you apply the plan.
            </DialogDescription>
          </DialogHeader>

          <ol aria-label="Import steps" className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-bold">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                aria-current={s.id === step ? 'step' : undefined}
                className={i <= index ? 'text-grimoire' : 'text-zinc-600'}
              >
                {i + 1}. {s.label}
              </li>
            ))}
          </ol>

          {stepBody()}
        </div>

        <DialogFooter className="mx-0 mb-0 bg-muted/30 p-4 border-t border-border sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (canGoBack ? setStep(STEPS[index - 1].id) : onOpenChange(false))}
            disabled={apply.isPending}
          >
            {secondaryLabel}
          </Button>
          {step !== 'done' && (
            <Button
              type="button"
              disabled={!canContinue[step] || apply.isPending}
              onClick={() => (step === 'review' ? commit() : setStep(STEPS[index + 1].id))}
              className="bg-grimoire text-black hover:bg-grimoire/90"
            >
              {apply.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {step === 'review' ? 'Apply import' : 'Next'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SourceStep: React.FC<{
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  setContent: (content: string) => void;
  readFile: (file: File | undefined) => void;
}> = ({ draft, set, setContent, readFile }) => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <FieldLabel htmlFor="import-file">File</FieldLabel>
        <input
          id="import-file"
          type="file"
          accept=".env,.json,.php,.txt,text/plain,application/json"
          onChange={(e) => void readFile(e.target.files?.[0])}
          className="text-xs text-zinc-400 file:mr-3 file:h-8 file:px-3 file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 file:text-[11px] file:uppercase file:font-bold"
        />
      </div>
      <div>
        <FieldLabel htmlFor="import-format">Format</FieldLabel>
        <select
          id="import-format"
          value={draft.format}
          onChange={(e) => set({ format: e.target.value as ImportFormat, formatChosen: true })}
          className={selectClass}
        >
          {IMPORT_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
    </div>
    <div>
      <FieldLabel htmlFor="import-content">Or paste the contents</FieldLabel>
      <textarea
        id="import-content"
        rows={10}
        value={draft.content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={'DB_HOST=localhost\nLOG_LEVEL=info'}
        className={textareaClass}
      />
      {draft.format === 'php' && (
        <p className="mt-1 text-[11px] text-zinc-500">
          PHP files are read as data and never run: values built from function calls or constants are skipped.
        </p>
      )}
    </div>
  </div>
);

const OptionsStep: React.FC<{
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  environments: ImportEnvironment[];
}> = ({ draft, set, environments }) => (
  <div className="space-y-4">
    <div>
      <FieldLabel htmlFor="import-environment">Environment</FieldLabel>
      <select
        id="import-environment"
        value={draft.environment}
        onChange={(e) => set({ environment: e.target.value })}
        className={selectClass}
      >
        {environments.map((env) => (
          <option key={env.slug} value={env.slug}>
            {env.label}
          </option>
        ))}
      </select>
    </div>
    <div>
      <FieldLabel htmlFor="import-patterns">Import as secrets</FieldLabel>
      <textarea
        id="import-patterns"
        rows={4}
        value={draft.patterns}
        onChange={(e) => set({ patterns: e.target.value, kinds: {} })}
        aria-describedby="import-patterns-hint"
        className={textareaClass}
      />
      <p id="import-patterns-hint" className="mt-1 text-[11px] text-zinc-500">
        One pattern per line; <code>*</code> matches anything, case doesn't matter. Other keys become configuration. You can
        change any key on the next step.
      </p>
    </div>
  </div>
);

const DoneStep: React.FC<{ result: ImportPlan }> = ({ result }) => (
  <output className="flex items-start gap-3 border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-zinc-300">
    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
    <span>
      Imported into <span className="font-mono">{result.environment === '*' ? 'all environments' : result.environment}</span>:{' '}
      {result.summary.create} created, {result.summary.update} overwritten, {result.summary.unchanged} unchanged,{' '}
      {result.summary.skipped} left alone.
    </span>
  </output>
);
