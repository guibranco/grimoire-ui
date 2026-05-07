import React, { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { api } from '@/lib/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Environment } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Lock, 
  Plus,
  Eye,
  EyeOff,
  Calendar as CalendarIcon,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

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

type FormData = {
  name: string;
  description: string;
  values: {
    environmentSlug: string;
    value?: string;
    isEnabled: boolean;
    expiresAt: string | null;
    notBefore: string | null;
  }[];
};

interface AddSecretModalProps {
  appSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddSecretModal: React.FC<AddSecretModalProps> = ({ appSlug, open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const { data: envs } = useQuery({
    queryKey: ['environments', appSlug],
    queryFn: async () => {
      const res = await api.get<Environment[]>(`/applications/${appSlug}/environments`);
      return res.data;
    },
    enabled: open,
  });

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
      name: '',
      description: '',
      values: [],
    }
  });

  const { fields, append } = useFieldArray({
    control,
    name: "values"
  });

  React.useEffect(() => {
    if (envs?.length && fields.length === 0) {
      const initialValues = envs.map(env => ({
        environmentSlug: env.slug,
        value: '',
        isEnabled: true,
        expiresAt: null,
        notBefore: null,
      }));
      setValue('values', initialValues);
    }
  }, [envs, fields.length, setValue]);

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      // 1. Create Secret
      await api.post(`/applications/${appSlug}/secrets`, {
        name: data.name,
        description: data.description
      });

      // 2. Add Values for each environment that has a value
      const valuesToCreate = (data.values || [])
        .filter((v: any) => v.value && v.value.trim().length > 0);
      
      if (valuesToCreate.length > 0) {
        await api.post(`/applications/${appSlug}/secrets/${data.name}/values`, valuesToCreate);
      }

      queryClient.invalidateQueries({ queryKey: ['secrets', appSlug] });
      reset();
      onOpenChange(false);
      toast.success('Secret and values created');
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
      <DialogContent className="max-w-3xl bg-card border-2 border-border p-0 gap-0 shadow-2xl flex flex-col max-h-[90vh]">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full overflow-hidden">
          <div className="p-6 border-b border-border">
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-10 h-10 bg-grimoire/10 border border-grimoire text-grimoire flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold tracking-tight uppercase">Define New Secret</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Create a secure entry and optionally set initial values across environments.
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
                  className="font-mono border-border focus-visible:ring-grimoire uppercase"
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
            {envs?.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-muted/20 p-4 border border-border">
                No environments defined. You can create the secret now and add values later.
              </p>
            ) : (
              <div className="space-y-4">
                {fields.map((field: any, index) => {
                  const env = envs?.find(e => e.slug === field.environmentSlug);
                  const isEnabled = formValues?.[index]?.isEnabled;
                  
                  return (
                    <div key={field.id} className="bg-background border border-border p-4 space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px] border-border bg-muted/30">
                            {env?.name || field.environmentSlug}
                          </Badge>
                          {!isEnabled && <Badge variant="outline" className="text-[8px] bg-red-500/10 text-red-500 border-red-500/20 uppercase font-bold tracking-widest">Disabled</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Enabled</span>
                          <Switch 
                            checked={isEnabled}
                            onCheckedChange={(checked) => setValue(`values.${index}.isEnabled`, checked)}
                            className="data-[state=checked]:bg-grimoire"
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

          <DialogFooter className="bg-muted/30 p-4 border-t border-border mt-0 sm:justify-end gap-2">
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
                className="bg-foreground text-background hover:bg-foreground/90 uppercase font-bold tracking-widest text-[10px] h-9 min-w-[140px]"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Secret'}
              </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
