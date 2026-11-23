import React, { useEffect, useState } from 'react';
import { Flag, Loader2, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/errors';
import {
  BOOLEAN_VARIANTS,
  MAX_VARIANTS,
  emptyFlagForm,
  flagFormBody,
  flagFormFrom,
  newVariantId,
  validateFlagForm,
  type FieldErrors,
  type FlagFormDraft,
} from '@/lib/flags';
import type { FeatureFlag, FlagType } from '@/types/api';
import { ChipsInput, FieldError, FieldLabel, inputClass, selectClass } from './parts';
import { useCreateFlag, useUpdateFlag } from './useFlags';

/** Field errors from a 400 validation problem, keyed like the client-side ones where possible. */
function serverErrors(err: any): FieldErrors {
  const errors = err?.response?.data?.errors;
  if (!errors || typeof errors !== 'object') return {};
  const out: FieldErrors = {};
  for (const [k, v] of Object.entries(errors)) {
    const field = k.charAt(0).toLowerCase() + k.slice(1);
    out[field] = Array.isArray(v) ? String(v[0]) : String(v);
  }
  return out;
}

interface Props {
  appSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this flag; create a new one when omitted. */
  flag?: FeatureFlag;
  onCreated?: (flag: FeatureFlag) => void;
}

/** Create or edit a flag: key, description, tags, type and variants (guibranco/grimoire-ui#453). */
export const FlagFormModal: React.FC<Props> = ({ appSlug, open, onOpenChange, flag, onCreated }) => {
  const mode = flag ? 'edit' : 'create';
  const [form, setForm] = useState<FlagFormDraft>(() => (flag ? flagFormFrom(flag) : emptyFlagForm()));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const create = useCreateFlag(appSlug);
  const update = useUpdateFlag(appSlug, flag?.key ?? '');
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open) {
      setForm(flag ? flagFormFrom(flag) : emptyFlagForm());
      setErrors({});
      setSubmitted(false);
    }
  }, [open, flag]);

  const set = (patch: Partial<FlagFormDraft>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (submitted) setErrors(validateFlagForm(next, mode));
  };

  const setType = (type: FlagType) =>
    set({
      type,
      defaultVariant: type === 'boolean' ? 'off' : form.variants[0]?.key ?? '',
    });

  const variants = form.type === 'boolean' ? BOOLEAN_VARIANTS : form.variants;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const found = validateFlagForm(form, mode);
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      const body = flagFormBody(form, mode);
      if (mode === 'create') {
        const created = await create.mutateAsync(body);
        onOpenChange(false);
        onCreated?.(created);
      } else {
        await update.mutateAsync(body);
        onOpenChange(false);
      }
    } catch (err: any) {
      const fromServer = serverErrors(err);
      if (Object.keys(fromServer).length) setErrors(fromServer);
      toast.error(apiErrorMessage(err, mode === 'create' ? 'Failed to create the flag' : 'Failed to update the flag'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-xl bg-card border-2 border-border p-0 gap-0 shadow-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} noValidate>
          <div className="p-6 space-y-5">
            <DialogHeader>
              <div className="w-10 h-10 bg-flags/10 border-2 border-flags/40 flex items-center justify-center mb-3">
                <Flag className="w-5 h-5 text-flags" aria-hidden="true" />
              </div>
              <DialogTitle className="text-lg font-bold tracking-tight uppercase">
                {mode === 'create' ? 'New feature flag' : `Edit ${flag!.key}`}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                {mode === 'create'
                  ? 'Starts off in every environment. Targeting is set per environment afterwards.'
                  : 'The key and type cannot change. Variants used by targeting cannot be removed.'}
              </DialogDescription>
            </DialogHeader>

            {mode === 'create' && (
              <div>
                <FieldLabel htmlFor="flag-key">Key *</FieldLabel>
                <input
                  id="flag-key"
                  value={form.key}
                  onChange={(e) => set({ key: e.target.value })}
                  placeholder="checkout-redesign"
                  aria-invalid={!!errors.key || undefined}
                  className={cn(inputClass, 'font-mono')}
                />
                <FieldError errors={errors} path="key" />
              </div>
            )}

            <div>
              <FieldLabel htmlFor="flag-description">Description</FieldLabel>
              <input
                id="flag-description"
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="New checkout page layout"
                className={inputClass}
              />
              <FieldError errors={errors} path="description" />
            </div>

            <div>
              <FieldLabel>Tags</FieldLabel>
              <ChipsInput label="Add tag" values={form.tags} onChange={(tags) => set({ tags })} placeholder="checkout, q4…" />
              <FieldError errors={errors} path="tags" />
            </div>

            {mode === 'create' && (
              <fieldset>
                <legend className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Type</legend>
                <div className="flex gap-4 text-xs text-zinc-300">
                  {(
                    [
                      ['boolean', 'Boolean'],
                      ['multivariate', 'Multivariate (A/B/n)'],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="flag-type" checked={form.type === value} onChange={() => setType(value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className="border border-zinc-800 p-3">
              <legend className="px-1 text-[10px] uppercase font-bold tracking-widest text-zinc-500">Variants</legend>
              {form.type === 'boolean' ? (
                <p className="text-xs text-zinc-500">
                  Boolean flags serve <code className="font-mono text-zinc-300">on</code> (true) or{' '}
                  <code className="font-mono text-zinc-300">off</code> (false).
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1.5fr_auto] gap-2 text-[10px] uppercase tracking-widest text-zinc-600">
                    <span>Key</span>
                    <span>Value (JSON)</span>
                    <span className="sr-only">Remove</span>
                  </div>
                  {form.variants.map((v, i) => (
                    <div key={v.id} className="grid grid-cols-[1fr_1.5fr_auto] gap-2 items-start">
                      <div>
                        <input
                          aria-label={`Variant ${i + 1} key`}
                          value={v.key}
                          onChange={(e) => {
                            const variantsNext = form.variants.map((x, j) => (j === i ? { ...x, key: e.target.value } : x));
                            set({
                              variants: variantsNext,
                              defaultVariant: form.defaultVariant === v.key ? e.target.value : form.defaultVariant,
                            });
                          }}
                          aria-invalid={!!errors[`variants.${i}.key`] || undefined}
                          className={cn(inputClass, 'font-mono')}
                        />
                        <FieldError errors={errors} path={`variants.${i}.key`} />
                      </div>
                      <div>
                        <input
                          aria-label={`Variant ${i + 1} value`}
                          value={v.value}
                          onChange={(e) => set({ variants: form.variants.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                          aria-invalid={!!errors[`variants.${i}.value`] || undefined}
                          className={cn(inputClass, 'font-mono')}
                        />
                        <FieldError errors={errors} path={`variants.${i}.value`} />
                      </div>
                      <button
                        type="button"
                        onClick={() => set({ variants: form.variants.filter((_, j) => j !== i) })}
                        disabled={form.variants.length <= 2}
                        aria-label={`Remove variant ${v.key || i + 1}`}
                        className="h-8 w-8 inline-flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => set({ variants: [...form.variants, { id: newVariantId(), key: `variant-${form.variants.length + 1}`, value: 'null' }] })}
                    disabled={form.variants.length >= MAX_VARIANTS}
                    className="inline-flex items-center gap-1 text-xs text-flags hover:underline disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" /> Add variant
                  </button>
                  <FieldError errors={errors} path="variants" />
                </div>
              )}
            </fieldset>

            <div>
              <FieldLabel htmlFor="flag-default">Default variant</FieldLabel>
              <select
                id="flag-default"
                value={form.defaultVariant}
                onChange={(e) => set({ defaultVariant: e.target.value })}
                aria-invalid={!!errors.defaultVariant || undefined}
                className={selectClass}
              >
                {variants.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.key}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-zinc-600">
                Served when the flag is off (without an off variant), when nothing else applies, and when a rollout can't
                bucket the user.
              </p>
              <FieldError errors={errors} path="defaultVariant" />
            </div>
          </div>
          <DialogFooter className="p-4 bg-muted/20 border-t border-border flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="bg-flags text-black hover:bg-flags/90">
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" aria-hidden="true" />}
              {mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
