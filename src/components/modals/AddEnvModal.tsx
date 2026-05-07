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
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Globe } from 'lucide-react';
import toast from 'react-hot-toast';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

type FormData = z.infer<typeof schema>;

interface AddEnvModalProps {
  appSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddEnvModal: React.FC<AddEnvModalProps> = ({ appSlug, open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const name = watch('name') || '';
  const slugPreview = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await api.post(`/applications/${appSlug}/environments`, data);
      queryClient.invalidateQueries({ queryKey: ['environments', appSlug] });
      reset();
      onOpenChange(false);
      toast.success('Environment added');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add environment');
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
              <div className="w-12 h-12 bg-muted/30 border-2 border-border flex items-center justify-center mb-4">
                <Globe className="w-6 h-6" />
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight uppercase">Add New Environment</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Define a new environment (e.g. Staging, Production) for this application.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="env-name" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Environment Name</Label>
                <Input
                  id="env-name"
                  placeholder="e.g. Production"
                  className="border-border focus-visible:ring-grimoire"
                  {...register('name')}
                />
                {errors.name && <p className="text-[10px] text-destructive uppercase font-bold tracking-widest">{errors.name.message}</p>}
                
                {name && (
                  <div className="mt-2 p-2 bg-muted/30 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Slug Preview:</p>
                    <p className="text-xs font-mono text-grimoire">{slugPreview || '???'}</p>
                  </div>
                )}
              </div>
            </div>
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
                className="bg-foreground text-background hover:bg-foreground/90 uppercase font-bold tracking-widest text-[10px] h-9"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add Environment'}
              </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
