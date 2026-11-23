import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { isRotationIntervalInput, rotationIntervalValue, ROTATION_INTERVAL_MESSAGE } from '@/lib/rotation';
import type { Secret, UpdateSecretRequest } from '@/types/api';
import type { SecretModalScope } from './EditSecretValueModal';
import { apiErrorMessage } from '@/lib/errors';

const schema = z.object({
  description: z.string().max(1000, 'Up to 1000 characters'),
  rotationIntervalDays: z
    .string()
    .nullable()
    .default(null)
    .refine((v) => isRotationIntervalInput(v), { message: ROTATION_INTERVAL_MESSAGE }),
});
type FormValues = z.infer<typeof schema>;

/** The PATCH body for what changed; `null` when nothing did. */
export function secretUpdateBody(secret: Pick<Secret, 'description' | 'rotationIntervalDays'>, values: FormValues): UpdateSecretRequest | null {
  const body: UpdateSecretRequest = {};
  const description = values.description.trim();
  if (description !== (secret.description ?? '')) {
    if (description) body.description = description;
    else body.clearDescription = true;
  }
  const interval = rotationIntervalValue(values.rotationIntervalDays);
  if (interval !== (secret.rotationIntervalDays ?? null)) {
    if (interval !== null) body.rotationIntervalDays = interval;
    else body.clearRotationInterval = true;
  }
  return Object.keys(body).length > 0 ? body : null;
}

interface EditSecretModalProps {
  scope: SecretModalScope;
  secretName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Edits a secret's description and rotation interval (`PATCH …/secrets/{name}`, guibranco/grimoire-api#78). */
export const EditSecretModal: React.FC<EditSecretModalProps> = ({ scope, secretName, open, onOpenChange }) => {
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const isGlobal = scope === 'global';
  const url = isGlobal
    ? `/global/secrets/${encodeURIComponent(secretName)}`
    : `/applications/${scope.appSlug}/secrets/${encodeURIComponent(secretName)}`;

  // Same keys as the secret detail panels, so a save refreshes both.
  const { data: secret, isPending } = useQuery({
    queryKey: isGlobal ? ['global-secret', secretName] : ['secret', scope.appSlug, secretName],
    queryFn: async () => {
      const res = await api.get<Secret>(url);
      if (res.status >= 400) throw new Error(`Request failed with status ${res.status}`);
      return res.data;
    },
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: { description: '', rotationIntervalDays: null },
  });

  useEffect(() => {
    if (!open || !secret) return;
    reset({
      description: secret.description ?? '',
      rotationIntervalDays: secret.rotationIntervalDays ? String(secret.rotationIntervalDays) : '',
    });
  }, [open, secret, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!secret) return;
    const body = secretUpdateBody(secret, values);
    if (!body) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch<Secret>(url, body);
      if (res.status >= 400) throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      if (isGlobal) {
        void queryClient.invalidateQueries({ queryKey: ['global-secrets'] });
        void queryClient.invalidateQueries({ queryKey: ['global-secret', secretName] });
        void queryClient.invalidateQueries({ queryKey: ['effective-secrets'] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['secrets', scope.appSlug] });
        void queryClient.invalidateQueries({ queryKey: ['secret', scope.appSlug, secretName] });
        void queryClient.invalidateQueries({ queryKey: ['effective-secrets', scope.appSlug] });
      }
      toast.success('Secret updated');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(apiErrorMessage(err, 'Failed to update secret'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg bg-card border-2 border-border">
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight uppercase">
              <Pencil className="w-4 h-4" aria-hidden="true" />
              Edit secret
            </DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">{secretName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="edit-secret-description" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
              Description
            </Label>
            <Input id="edit-secret-description" className="border-border" {...register('description')} />
            {errors.description && <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">{errors.description.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-secret-rotation" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
              Rotate every (days)
            </Label>
            <Input
              id="edit-secret-rotation"
              type="number"
              min={1}
              max={3650}
              inputMode="numeric"
              placeholder="No schedule"
              aria-describedby="edit-secret-rotation-help"
              className="font-mono border-border"
              {...register('rotationIntervalDays')}
            />
            <p id="edit-secret-rotation-help" className="text-[10px] text-zinc-500">
              The current value is due this many days after it took effect. Empty removes the schedule.
            </p>
            {errors.rotationIntervalDays && (
              <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">{errors.rotationIntervalDays.message}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="uppercase font-bold tracking-widest text-[10px] h-9">
              Cancel
            </Button>
            <Button type="submit" disabled={saving || isPending || !secret} className="bg-foreground text-background hover:bg-foreground/90 uppercase font-bold tracking-widest text-[10px] h-9 min-w-[100px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
