import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, toApiDateTime } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Loader2, 
  Lock,
  Eye,
  EyeOff,
  ChevronRight,
  Globe
} from 'lucide-react';
import toast from 'react-hot-toast';

const schema = z.object({
  value: z.string().min(1, 'Value is required'),
  isEnabled: z.boolean().default(true),
  expiresAt: z.string().nullable().default(null),
  notBefore: z.string().nullable().default(null),
});

export type SecretModalScope = 'global' | { appSlug: string };

interface EditSecretValueModalProps {
  appSlug?: string;
  scope?: SecretModalScope;
  secretName: string;
  envSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditSecretValueModal: React.FC<EditSecretValueModalProps> = ({ 
  appSlug,
  scope,
  secretName, 
  envSlug,
  open, 
  onOpenChange 
}) => {
  const [loading, setLoading] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const queryClient = useQueryClient();

  const resolvedScope: SecretModalScope = scope ?? { appSlug: appSlug || '' };
  const isGlobal = resolvedScope === 'global';
  const targetAppSlug = isGlobal ? '' : resolvedScope.appSlug;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: {
      value: '',
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
    }
  });

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const endpoint = isGlobal
        ? `/global/secrets/${encodeURIComponent(secretName)}/values`
        : `/applications/${targetAppSlug}/secrets/${encodeURIComponent(secretName)}/values`;

      await api.post(endpoint, [{
        environmentSlug: envSlug,
        value: data.value,
        isEnabled: data.isEnabled,
        expiresAt: toApiDateTime(data.expiresAt),
        notBefore: toApiDateTime(data.notBefore),
      }]);

      if (isGlobal) {
        queryClient.invalidateQueries({ queryKey: ['global-secrets'] });
        queryClient.invalidateQueries({ queryKey: ['global-secret', secretName] });
        queryClient.invalidateQueries({ queryKey: ['global-secret-versions', secretName, envSlug] });
        queryClient.invalidateQueries({ queryKey: ['effective-secrets'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['secrets', targetAppSlug] });
        queryClient.invalidateQueries({ queryKey: ['effective-secrets', targetAppSlug] });
        queryClient.invalidateQueries({ queryKey: ['secret', targetAppSlug, secretName] });
        queryClient.invalidateQueries({ queryKey: ['secret-versions', targetAppSlug, secretName, envSlug] });
      }
      reset();
      onOpenChange(false);
      toast.success('Secret value updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update value');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <DialogContent className="max-w-md bg-card border-2 border-border p-0 gap-0 shadow-2xl">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6">
            <DialogHeader className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 flex items-center justify-center border ${isGlobal ? 'bg-global/10 border-global text-global' : 'bg-grimoire/10 border-grimoire text-grimoire'}`}>
                  {isGlobal ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold tracking-tight uppercase">
                    {isGlobal ? 'Update Global Secret Value' : 'Update Secret Value'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground flex items-center gap-1 font-mono uppercase">
                    {secretName} <ChevronRight className="w-3 h-3" />{' '}
                    {envSlug === '*' ? 'All environments' : envSlug}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">New Value</Label>
                  <button 
                    type="button"
                    onClick={() => setShowValue(!showValue)}
                    className={`text-[10px] uppercase font-bold flex items-center gap-1 ${isGlobal ? 'text-global' : 'text-grimoire'}`}
                  >
                    {showValue ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Reveal</>}
                  </button>
                </div>
                <Input
                  type={showValue ? "text" : "password"}
                  placeholder="Enter new secret value..."
                  className="font-mono border-border focus-visible:ring-grimoire"
                  {...register('value')}
                  autoFocus
                />
                {errors.value && <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">{(errors.value.message as string)}</p>}
                <p className="text-[10px] text-muted-foreground bg-muted/20 p-2 border border-border">
                  Note: Existing values are never revealed for security. You must provide a new value to update.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/10 border border-border">
                <div className="space-y-0.5">
                  <Label className="text-[10px] uppercase font-bold tracking-widest leading-none">Enable Value</Label>
                  <p className="text-[10px] text-muted-foreground uppercase opacity-60">Whether this value is active</p>
                </div>
                <Switch 
                  checked={watch('isEnabled')}
                  onCheckedChange={(checked) => setValue('isEnabled', checked)}
                  className={isGlobal ? 'data-[state=checked]:bg-global' : 'data-[state=checked]:bg-grimoire'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Not Before</Label>
                  <Input
                    type="date"
                    className="border-border bg-muted/20 text-xs font-mono h-9"
                    {...register('notBefore')}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Expires At</Label>
                  <Input
                    type="date"
                    className="border-border bg-muted/20 text-xs font-mono h-9"
                    {...register('expiresAt')}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 bg-muted/30 p-4 border-t border-border mt-0 sm:justify-end gap-2">
            <Button 
                type="button"
                variant="ghost" 
                onClick={() => onOpenChange(false)}
                className="uppercase font-bold tracking-widest text-[10px] h-9"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                className={`${isGlobal ? 'bg-global text-black hover:bg-global/90' : 'bg-grimoire text-background hover:bg-grimoire/90'} uppercase font-bold tracking-widest text-[10px] h-9 min-w-[140px]`}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Update Value'}
              </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
