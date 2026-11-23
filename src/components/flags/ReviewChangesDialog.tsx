import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { lineDiff } from '@/lib/history';
import { cn } from '@/lib/utils';

/** Line diff of two JSON texts, shared by the review dialog and the history panel. */
export const JsonDiff: React.FC<{ before: string | null; after: string | null; label: string }> = ({ before, after, label }) => (
  <pre
    aria-label={label}
    className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all bg-black/40 border border-zinc-900 p-2 max-h-[50vh] overflow-auto"
  >
    {lineDiff(before, after).map((line, i) => (
      <span
        key={i}
        className={cn(
          'block',
          line.kind === 'added' && 'bg-emerald-500/10 text-emerald-300',
          line.kind === 'removed' && 'bg-red-500/10 text-red-300 line-through decoration-red-500/50',
          line.kind === 'same' && 'text-zinc-500'
        )}
      >
        {line.kind === 'added' && '+ '}
        {line.kind === 'removed' && '− '}
        {line.text || ' '}
      </span>
    ))}
  </pre>
);

/** Before/after of the environment's targeting; production asks for an explicit confirmation. */
export const ReviewChangesDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flagKey: string;
  environment: string;
  production: boolean;
  before: string;
  after: string;
  saving: boolean;
  onConfirm: () => void;
}> = ({ open, onOpenChange, flagKey, environment, production, before, after, saving, onConfirm }) => {
  const [acknowledged, setAcknowledged] = React.useState(false);
  React.useEffect(() => {
    if (open) setAcknowledged(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-2xl bg-card border-2 border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-bold uppercase tracking-tight">Review changes</DialogTitle>
          <DialogDescription className="text-xs">
            <span className="font-mono">{flagKey}</span> in <span className="font-mono">{environment}</span>. Consumers pick
            the change up on their next refresh.
          </DialogDescription>
        </DialogHeader>
        <JsonDiff before={before} after={after} label="Targeting changes" />
        {production && (
          <label className="flex items-start gap-2 p-2 border border-amber-500/40 bg-amber-500/5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
            <span>
              This changes what <strong>production</strong> users get.
            </span>
          </label>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Back to editing
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={saving || (production && !acknowledged)}
            className="bg-flags text-black hover:bg-flags/90"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" aria-hidden="true" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
