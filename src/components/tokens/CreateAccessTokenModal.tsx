import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/errors';
import {
  EXPIRY_PRESETS,
  emptyTokenDraft,
  expiresAtFor,
  validateTokenDraft,
  type TokenDraft,
} from '@/lib/accessTokens';
import type { CreateAccessTokenResponse, Environment } from '@/types/api';
import { FieldError, FieldLabel, inputClass } from '@/components/flags/parts';
import { useCreateAccessToken } from './useAccessTokens';
import { EnvironmentsField, ScopesField, checkboxClass, legendClass, optionClass } from './parts';

interface Props {
  appSlug: string;
  envs: Environment[];
  /** Names already used by the application's tokens. */
  takenNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: CreateAccessTokenResponse) => void;
}


/** New access token: name, environments, scopes and expiry (guibranco/grimoire-ui#444). */
export const CreateAccessTokenModal: React.FC<Props> = ({ appSlug, envs, takenNames, open, onOpenChange, onCreated }) => {
  const [draft, setDraft] = useState<TokenDraft>(emptyTokenDraft);
  const [submitted, setSubmitted] = useState(false);
  const create = useCreateAccessToken(appSlug);
  const errors = submitted ? validateTokenDraft(draft, takenNames) : {};

  useEffect(() => {
    if (open) {
      setDraft(emptyTokenDraft());
      setSubmitted(false);
    }
  }, [open]);

  const set = (patch: Partial<TokenDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateTokenDraft(draft, takenNames)).length) return;
    try {
      const created = await create.mutateAsync({
        name: draft.name.trim(),
        environments: draft.allEnvironments ? null : draft.environments,
        scopes: draft.scopes,
        expiresAt: expiresAtFor(draft.expiry),
      });
      onOpenChange(false);
      onCreated(created);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create the access token'));
    }
  };

  const fieldErrors = errors as Record<string, string>;

  return (
    <Dialog open={open} onOpenChange={(v) => !create.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg bg-card border-2 border-border p-0 gap-0 shadow-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} noValidate>
          <div className="p-6 space-y-5">
            <DialogHeader>
              <div className="w-10 h-10 bg-grimoire/10 border-2 border-grimoire/40 flex items-center justify-center mb-3">
                <KeyRound className="w-5 h-5 text-grimoire" aria-hidden="true" />
              </div>
              <DialogTitle className="text-lg font-bold tracking-tight uppercase">New access token</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                Give each consumer (a CI job, a server) its own token, limited to what it reads.
              </DialogDescription>
            </DialogHeader>

            <div>
              <FieldLabel htmlFor="token-name">Name</FieldLabel>
              <input
                id="token-name"
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="github-actions"
                maxLength={100}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'token-name-error' : undefined}
                className={inputClass}
              />
              <FieldError errors={fieldErrors} path="name" id="token-name-error" />
            </div>

            <EnvironmentsField
              envs={envs}
              all={draft.allEnvironments}
              selected={draft.environments}
              onChange={set}
              errors={fieldErrors}
            />
            <ScopesField selected={draft.scopes} onChange={(scopes) => set({ scopes })} errors={fieldErrors} />

            <fieldset>
              <legend className={legendClass}>Expires after</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {EXPIRY_PRESETS.map((preset) => (
                  <label key={preset.value} className={optionClass}>
                    <input
                      type="radio"
                      name="token-expiry"
                      className={checkboxClass}
                      checked={draft.expiry === preset.value}
                      onChange={() => set({ expiry: preset.value })}
                    />
                    <span>{preset.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <DialogFooter className="mx-0 mb-0 bg-muted/30 p-4 border-t border-border sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending} className="bg-grimoire text-black hover:bg-grimoire/90">
              {create.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Create token
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
