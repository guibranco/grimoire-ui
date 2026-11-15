import React, { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
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
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Environment, GlobalEnvironment } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Lock, 
  Eye,
  EyeOff,
  Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { SecretModalScope } from './EditSecretValueModal';

const schema = z.object({
  name: z.string().min(1, 'Name is required').regex(/^[a-zA-Z0-9_\-]+$/, 'Only alphanumeric, underscores, and hyphens allowed'),
  description: z.string().min(1, 'Description is required'),
  values: z.array(z.object({
    environmentSlug: z.string(),
    value: z.string().optional(),
    isEnabled: z.boolean().default(true),
    expiresAt: z.string().nullable().default(null),
    notBefore: z.string().nullable().default(null),
  })).default([]),
});

interface AddSecretModalProps {
  appSlug?: string;
  scope?: SecretModalScope;
  initialName?: string;
  initialDescription?: string;
  customSlugs?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddSecretModal: React.FC<AddSecretModalProps> = ({
  appSlug,
  scope,
  initialName,
  initialDescription,
  customSlugs = [],
  open,
  onOpenChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const resolvedScope: SecretModalScope = scope ?? { appSlug: appSlug || '' };
  const isGlobal = resolvedScope === 'global';
  const targetAppSlug = isGlobal ? '' : resolvedScope.appSlug;

  const { data: appEnvs } = useQuery({
    queryKey: ['environments', targetAppSlug],
    queryFn: async () => {
      const res = await api.get<Environment[]>(`/applications/${targetAppSlug}/environments`);
      return res.data;
    },
    enabled: open && !isGlobal && !!targetAppSlug,
  });

  const { data: globalEnvs } = useQuery({
    queryKey: ['global-environments'],
    queryFn: async () => {
      const res = await api.get<GlobalEnvironment[]>('/global/environments');
      return res.data;
    },
    enabled: open && isGlobal,
  });

  const envs: Environment[] = useMemo(() => {
    if (!isGlobal) {
      return Array.isArray(appEnvs) ? appEnvs : [];
    }
    const known = Array.isArray(globalEnvs) ? globalEnvs : [];
    const seen = new Set<string>(['*']);
    const list: Environment[] = [{ name: 'All environments', slug: '*' }];
    known.forEach((e) => {
      if (e.slug && !seen.has(e.slug)) {
        seen.add(e.slug);
        list.push({ name: e.name || e.slug, slug: e.slug });
      }
    });
    customSlugs.forEach((slug) => {
      if (slug && !seen.has(slug)) {
        seen.add(slug);
        list.push({ name: slug, slug });
      }
    });
    return list;
  }, [isGlobal, appEnvs, globalEnvs, customSlugs]);

  const { 
    register, 
    handleSubmit, 
    reset, 
    control, 
    setValue,
    watch,
    formState: { errors } 
  } = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialName || '',
      description: initialDescription || '',
      values: [],
    }
  });

  const { fields } = useFieldArray({
    control,
    name: "values"
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: initialName || '',
      description: initialDescription || '',
      values: envs.map((env) => ({
        environmentSlug: env.slug,
        value: '',
        isEnabled: true,
        expiresAt: null,
        notBefore: null,
      })),
    });
  }, [open, initialName, initialDescription, envs, reset]);

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const createEndpoint = isGlobal
        ? '/global/secrets'
        : `/applications/${targetAppSlug}/secrets`;

      const createRes = await api.post(createEndpoint, {
        name: data.name,
        description: data.description
      });

      const createdName = createRes.data?.name || data.name;

      const valuesToCreate = (data.values || [])
        .filter((v: any) => v.value && v.value.trim().length > 0)
        .map((v: any) => ({
          environmentSlug: v.environmentSlug,
          value: v.value,
          isEnabled: v.isEnabled ?? true,
          expiresAt: toApiDateTime(v.expiresAt),
          notBefore: toApiDateTime(v.notBefore),
        }));
      
      if (valuesToCreate.length > 0) {
        const valuesEndpoint = isGlobal
          ? `/global/secrets/${encodeURIComponent(createdName)}/values`
          : `/applications/${targetAppSlug}/secrets/${encodeURIComponent(createdName)}/values`;
        await api.post(valuesEndpoint, valuesToCreate);
      }

      if (isGlobal) {
        queryClient.invalidateQueries({ queryKey: ['global-secrets'] });
        queryClient.invalidateQueries({ queryKey: ['global-secret'] });
        queryClient.invalidateQueries({ queryKey: ['global-secret-versions'] });
        queryClient.invalidateQueries({ queryKey: ['effective-secrets'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['secrets', targetAppSlug] });
        queryClient.invalidateQueries({ queryKey: ['effective-secrets', targetAppSlug] });
        queryClient.invalidateQueries({ queryKey: ['secret', targetAppSlug] });
        queryClient.invalidateQueries({ queryKey: ['secret-versions', targetAppSlug] });
      }
      reset();
      onOpenChange(false);
      toast.success(isGlobal ? 'Global secret created' : 'Secret and values created');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create secret');
    } finally {
      setLoading(false);
    }
  };

  const toggleShowValue = (envSlug: string) => {
    setShowValues(prev => ({ ...prev, [envSlug]: !prev[envSlug] }));
  };

  const formValues = watch('values');

  return (
    <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <DialogContent className="sm:max-w-4xl bg-card border-2 border-border p-0 gap-0 shadow-2xl flex flex-col max-h-[90vh]">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full overflow-hidden">
          <div className="p-6 border-b border-border">
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-4 mb-2">
                <div className={`w-10 h-10 flex items-center justify-center border ${isGlobal ? 'bg-global/10 border-global text-global' : 'bg-grimoire/10 border-grimoire text-grimoire'}`}>
                  {isGlobal ? <Globe className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold tracking-tight uppercase">
                    {isGlobal ? 'Define Global Secret' : initialName ? 'Override Global Secret' : 'Define New Secret'}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    {isGlobal
                      ? 'Create a shared secret inherited by all participating applications.'
                      : 'Create a secure entry and optionally set initial values across environments.'}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="s-name" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Secret Key / Name</Label>
                <Input
                  id="s-name"
                  placeholder="DATABASE_PASSWORD"
                  className="font-mono border-border focus-visible:ring-grimoire"
                  {...register('name')}
                />
                {errors.name && <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">{(errors.name.message as string)}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-desc" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Description</Label>
                <Input
                  id="s-desc"
                  placeholder="The main production database password"
                  className="border-border focus-visible:ring-grimoire"
                  {...register('description')}
                />
                {errors.description && <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">{(errors.description.message as string)}</p>}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6 bg-muted/10">
            <h4 className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground mb-4">Initial Values Per Environment</h4>
            {envs.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-muted/20 p-4 border border-border">
                No environments defined. You can create the secret now and add values later.
              </p>
            ) : (
              <div className="space-y-4">
                {fields.map((field: any, index) => {
                  const env = envs.find(e => e.slug === field.environmentSlug);
                  const isEnabled = formValues?.[index]?.isEnabled;
                  const isWildcard = field.environmentSlug === '*';
                  
                  return (
                    <div key={field.id} className="bg-background border border-border p-4 space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={
                              isWildcard
                                ? 'font-mono text-[10px] border-global/40 bg-global/10 text-global gap-1'
                                : 'font-mono text-[10px] border-border bg-muted/30'
                            }
                          >
                            {isWildcard && <Globe className="w-3 h-3" />}
                            {isWildcard ? 'All environments' : (env?.name || field.environmentSlug)}
                          </Badge>
                          {!isEnabled && <Badge variant="outline" className="text-[8px] bg-red-500/10 text-red-500 border-red-500/20 uppercase font-bold tracking-widest">Disabled</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Enabled</span>
                          <Switch 
                            checked={isEnabled}
                            onCheckedChange={(checked) => setValue(`values.${index}.isEnabled`, checked)}
                            className={isGlobal ? 'data-[state=checked]:bg-global' : 'data-[state=checked]:bg-grimoire'}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1 relative">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground">Value</Label>
                          <div className="relative">
                            <Input
                              type={showValues[field.environmentSlug] ? "text" : "password"}
                              placeholder="••••••••••••"
                              className="font-mono pr-12 border-border focus-visible:ring-grimoire h-8 text-xs"
                              {...register(`values.${index}.value`)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1 h-6 w-6"
                              onClick={() => toggleShowValue(field.environmentSlug)}
                            >
                              {showValues[field.environmentSlug] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[9px] uppercase font-bold text-muted-foreground">Not Before</Label>
                            <Input
                              type="date"
                              className="h-8 text-[10px] border-border bg-muted/20"
                              {...register(`values.${index}.notBefore`)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[9px] uppercase font-bold text-muted-foreground">Expires At</Label>
                            <Input
                              type="date"
                              className="h-8 text-[10px] border-border bg-muted/20"
                              {...register(`values.${index}.expiresAt`)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                className={`${isGlobal ? 'bg-global text-black hover:bg-global/90' : 'bg-foreground text-background hover:bg-foreground/90'} uppercase font-bold tracking-widest text-[10px] h-9 min-w-[140px]`}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isGlobal ? 'Create Global Secret' : 'Create Secret')}
              </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
