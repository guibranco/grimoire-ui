import React, { useEffect, useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/errors';
import {
  MAX_LIFETIME_MINUTES,
  emptyTrustPolicyDraft,
  trustPolicyBody,
  trustPolicyDraftFrom,
  validateTrustPolicyDraft,
  type TrustPolicyDraft,
} from '@/lib/trustPolicies';
import type { Environment, TrustPolicy } from '@/types/api';
import { FieldError, FieldLabel, inputClass } from '@/components/flags/parts';
import { EnvironmentsField, ScopesField } from './parts';
import { useSaveTrustPolicy } from './useTrustPolicies';

interface Props {
  appSlug: string;
  envs: Environment[];
  /** The policy to edit; `null` creates one. */
  policy: TrustPolicy | null;
  takenNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TextFieldProps {
  id: keyof TrustPolicyDraft;
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  errors: Record<string, string>;
  onChange: (value: string) => void;
}

const TextField: React.FC<TextFieldProps> = ({ id, label, value, placeholder, hint, errors, onChange }) => {
  const inputId = `policy-${id}`;
  const errorId = `${inputId}-error`;
  return (
    <div>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!errors[id]}
        aria-describedby={errors[id] ? errorId : undefined}
        className={inputClass}
      />
      {hint && !errors[id] && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
      <FieldError errors={errors} path={id} id={errorId} />
    </div>
  );
};

/** Create or edit a GitHub OIDC trust policy (guibranco/grimoire-ui#444). */
export const TrustPolicyFormModal: React.FC<Props> = ({ appSlug, envs, policy, takenNames, open, onOpenChange }) => {
  const [draft, setDraft] = useState<TrustPolicyDraft>(emptyTrustPolicyDraft);
  const [submitted, setSubmitted] = useState(false);
  const save = useSaveTrustPolicy(appSlug);
  const otherNames = takenNames.filter((n) => n !== policy?.name);
  const errors = (submitted ? validateTrustPolicyDraft(draft, otherNames) : {}) as Record<string, string>;

  useEffect(() => {
    if (open) {
      setDraft(policy ? trustPolicyDraftFrom(policy) : emptyTrustPolicyDraft());
      setSubmitted(false);
    }
  }, [open, policy]);

  const set = (patch: Partial<TrustPolicyDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateTrustPolicyDraft(draft, otherNames)).length) return;
    try {
      await save.mutateAsync({ id: policy?.id, body: trustPolicyBody(draft) });
      toast.success(policy ? `Updated ${draft.name.trim()}` : `Created ${draft.name.trim()}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save the trust policy'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg bg-card border-2 border-border p-0 gap-0 shadow-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} noValidate>
          <div className="p-6 space-y-5">
            <DialogHeader>
              <div className="w-10 h-10 bg-grimoire/10 border-2 border-grimoire/40 flex items-center justify-center mb-3">
                <GitBranch className="w-5 h-5 text-grimoire" aria-hidden="true" />
              </div>
              <DialogTitle className="text-lg font-bold tracking-tight uppercase">
                {policy ? 'Edit trust policy' : 'New trust policy'}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                GitHub Actions runs that match get a short-lived token, with no Grimoire secret stored in GitHub.
              </DialogDescription>
            </DialogHeader>

            <TextField id="name" label="Name" value={draft.name} placeholder="deploy main" errors={errors} onChange={(name) => set({ name })} />
            <TextField
              id="repository"
              label="Repository"
              value={draft.repository}
              placeholder="owner/repo"
              errors={errors}
              onChange={(repository) => set({ repository })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField
                id="refPattern"
                label="Ref"
                value={draft.refPattern}
                placeholder="any ref"
                hint="e.g. refs/heads/main, refs/tags/v*"
                errors={errors}
                onChange={(refPattern) => set({ refPattern })}
              />
              <TextField
                id="gitHubEnvironment"
                label="GitHub environment"
                value={draft.gitHubEnvironment}
                placeholder="any"
                hint="The job's environment, if it must have one"
                errors={errors}
                onChange={(gitHubEnvironment) => set({ gitHubEnvironment })}
              />
            </div>

            <EnvironmentsField envs={envs} all={draft.allEnvironments} selected={draft.environments} onChange={set} errors={errors} />
            <ScopesField selected={draft.scopes} onChange={(scopes) => set({ scopes })} errors={errors} />

            <div className="max-w-[12rem]">
              <FieldLabel htmlFor="policy-lifetime">Token lifetime (minutes)</FieldLabel>
              <input
                id="policy-lifetime"
                type="number"
                min={1}
                max={MAX_LIFETIME_MINUTES}
                value={draft.lifetime}
                onChange={(e) => set({ lifetime: e.target.value })}
                aria-invalid={!!errors.lifetime}
                aria-describedby={errors.lifetime ? 'policy-lifetime-error' : undefined}
                className={inputClass}
              />
              <FieldError errors={errors} path="lifetime" id="policy-lifetime-error" />
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 bg-muted/30 p-4 border-t border-border sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="bg-grimoire text-black hover:bg-grimoire/90">
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {policy ? 'Save policy' : 'Create policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
