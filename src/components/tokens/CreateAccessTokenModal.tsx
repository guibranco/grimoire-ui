import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/errors';
import {
  ACCESS_TOKEN_SCOPES,
  EXPIRY_PRESETS,
  emptyTokenDraft,
  expiresAtFor,
  validateTokenDraft,
  type TokenDraft,
} from '@/lib/accessTokens';
import type { AccessTokenScope, CreateAccessTokenResponse, Environment } from '@/types/api';
import { FieldError, FieldLabel, inputClass } from '@/components/flags/parts';
import { useCreateAccessToken } from './useAccessTokens';

interface Props {
  appSlug: string;
  envs: Environment[];
  /** Names already used by the application's tokens. */
  takenNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: CreateAccessTokenResponse) => void;
}

const checkboxClass = 'h-3.5 w-3.5 accent-grimoire';
const optionClass = 'inline-flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer';

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
  const toggle = <T extends string>(list: T[], value: T, on: boolean) =>
    on ? [...list, value] : list.filter((v) => v !== value);

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

            <fieldset>
              <legend className="block text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">
                Environments
              </legend>
              <label className={optionClass}>
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={draft.allEnvironments}
                  onChange={(e) => set({ allEnvironments: e.target.checked })}
                />
                <span>All environments, including ones added later</span>
              </label>
              {!draft.allEnvironments && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                  {envs.map((env) => (
                    <label key={env.slug} className={optionClass}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={draft.environments.includes(env.slug)}
                        onChange={(e) => set({ environments: toggle(draft.environments, env.slug, e.target.checked) })}
                      />
                      <span className="font-mono">{env.slug}</span>
                    </label>
                  ))}
                </div>
              )}
              <FieldError errors={fieldErrors} path="environments" />
            </fieldset>

            <fieldset>
              <legend className="block text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">
                Can read
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ACCESS_TOKEN_SCOPES.map((scope) => (
                  <label key={scope.value} className={optionClass}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={draft.scopes.includes(scope.value)}
                      onChange={(e) =>
                        set({ scopes: toggle<AccessTokenScope>(draft.scopes, scope.value, e.target.checked) })
                      }
                    />
                    <span>{scope.label}</span>
                  </label>
                ))}
              </div>
              <FieldError errors={fieldErrors} path="scopes" />
            </fieldset>

            <fieldset>
              <legend className="block text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">
                Expires after
              </legend>
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
