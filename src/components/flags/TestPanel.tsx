import React, { useState } from 'react';
import { Loader2, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/errors';
import { variantValueText } from '@/lib/flags';
import type { Environment, FlagEvaluation } from '@/types/api';
import { selectClass } from './parts';
import { useEvaluateFlag } from './useFlags';

const REASONS: Record<string, string> = {
  OFF: 'The flag is off in this environment.',
  RULE_MATCH: 'A targeting rule matched.',
  FALLTHROUGH: 'No rule matched: the default rule applied.',
  MISSING_BUCKET_BY: 'A rollout needed the bucket-by attribute, which the context lacks: the default variant.',
};

const SAMPLE = '{\n  "userId": "u-789",\n  "email": "gui@straccini.com",\n  "country": "IE"\n}';

/** Side sheet: dry-run the saved targeting against a JSON context. The context is not stored. */
export const TestPanel: React.FC<{
  appSlug: string;
  flagKey: string;
  environments: Environment[];
  initialEnvironment: string;
  onClose: () => void;
}> = ({ appSlug, flagKey, environments, initialEnvironment, onClose }) => {
  const [environment, setEnvironment] = useState(initialEnvironment);
  const [context, setContext] = useState(SAMPLE);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<FlagEvaluation | null>(null);
  const evaluate = useEvaluateFlag(appSlug, flagKey);

  const run = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(context || '{}');
    } catch {
      setParseError('Context must be a JSON object.');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setParseError('Context must be a JSON object.');
      return;
    }
    setParseError(null);
    try {
      setResult(await evaluate.mutateAsync({ environment, context: parsed as Record<string, unknown> }));
    } catch (err) {
      setResult(null);
      setParseError(apiErrorMessage(err, 'Evaluation failed'));
    }
  };

  return (
    <aside aria-label="Test evaluation" className="w-full xl:w-[320px] shrink-0 border border-zinc-800 bg-card/80 p-3 space-y-3 self-start">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-300">Test evaluation</h3>
        <button type="button" onClick={onClose} aria-label="Close test panel" className="text-zinc-500 hover:text-zinc-200">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </header>
      <label className="block text-xs text-zinc-400">
        Environment
        <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className={cn(selectClass, 'w-full mt-1')}>
          {environments.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.name || e.slug}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-zinc-400">
        Context (JSON)
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={7}
          spellCheck={false}
          aria-invalid={!!parseError || undefined}
          className="mt-1 w-full bg-zinc-950 border border-zinc-800 p-2 font-mono text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-600"
        />
      </label>
      {parseError && (
        <p role="alert" className="text-[11px] text-red-400">
          {parseError}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void run()}
          disabled={evaluate.isPending}
          className="inline-flex items-center gap-1.5 h-7 px-3 border border-flags/50 bg-flags/10 text-xs font-bold text-flags hover:bg-flags/20 disabled:opacity-60"
        >
          {evaluate.isPending ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Play className="w-3 h-3" aria-hidden="true" />}
          Evaluate
        </button>
      </div>
      {result && (
        <dl aria-label="Evaluation result" className="border-t border-zinc-800 pt-2 grid grid-cols-[70px_1fr] gap-y-1 text-xs">
          <dt className="text-zinc-500">Result</dt>
          <dd className="font-mono font-bold text-flags">{result.variant}</dd>
          <dt className="text-zinc-500">Value</dt>
          <dd className="font-mono text-zinc-300 break-all">{variantValueText(result.value)}</dd>
          <dt className="text-zinc-500">Reason</dt>
          <dd className="font-mono text-zinc-300">
            {result.reason}
            {result.matchedRuleIndex !== null && ` (rule ${result.matchedRuleIndex + 1})`}
            <span className="block font-sans text-[10px] text-zinc-500">{REASONS[result.reason] ?? ''}</span>
          </dd>
          {result.bucket !== null && (
            <>
              <dt className="text-zinc-500">Bucket</dt>
              <dd className="font-mono text-zinc-300">{result.bucket} / 10000</dd>
            </>
          )}
        </dl>
      )}
      <p className="text-[10px] text-zinc-600">Evaluates the saved targeting. The context is not stored.</p>
    </aside>
  );
};
