import React, { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { Application } from '@/types/api';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Box } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '@/lib/errors';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(1, 'Description is required'),
  inheritGlobals: z.boolean().default(true),
});

type FormData = {
  name: string;
  description: string;
  inheritGlobals: boolean;
};

interface EditAppModalProps {
  app: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditAppModal: React.FC<EditAppModalProps> = ({ app, open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: app.name,
      description: app.description ?? '',
      inheritGlobals: app.inheritGlobals ?? true,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: app.name,
        description: app.description ?? '',
        inheritGlobals: app.inheritGlobals ?? true,
      });
    }
  }, [app, open, reset]);

  const onSubmit = async (data: any) => {
    const formData = data as FormData;
    setLoading(true);
    try {
      await api.put(`/applications/${app.slug}`, {
        name: formData.name,
        description: formData.description,
        inheritGlobals: formData.inheritGlobals ?? true,
      });
      await queryClient.invalidateQueries({ queryKey: ['application', app.slug] });
      await queryClient.invalidateQueries({ queryKey: ['applications'] });
      await queryClient.invalidateQueries({ queryKey: ['effective-configurations', app.slug] });
      await queryClient.invalidateQueries({ queryKey: ['effective-secrets', app.slug] });
      onOpenChange(false);
      toast.success('Application updated');
    } catch (err: any) {
      toast.error(apiErrorMessage(err, 'Failed to update application'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <DialogContent className="sm:max-w-md bg-card border-2 border-border p-0 gap-0 shadow-2xl">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6">
            <DialogHeader className="mb-6">
              <div className="w-12 h-12 bg-muted/30 border-2 border-border flex items-center justify-center mb-4">
                <Box className="w-6 h-6" />
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight uppercase">Edit Application</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Update metadata for <span className="font-mono text-foreground">{app.slug}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="edit-app-name" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Application Name</Label>
                <Input
                  id="edit-app-name"
                  placeholder="e.g. Payments Gateway"
                  className="border-border focus-visible:ring-grimoire"
                  {...register('name')}
                />
                {errors.name && <p className="text-[10px] text-destructive uppercase font-bold tracking-widest">{errors.name.message as string}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-app-desc" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Description</Label>
                <Textarea
                  id="edit-app-desc"
                  placeholder="Briefly describe the purpose of this application..."
                  className="border-border focus-visible:ring-grimoire min-h-[100px] resize-none"
                  {...register('description')}
                />
                {errors.description && <p className="text-[10px] text-destructive uppercase font-bold tracking-widest">{errors.description.message as string}</p>}
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/10 border border-border">
                <div className="space-y-0.5 pr-3">
                  <Label htmlFor="edit-inherit-globals" className="text-[10px] uppercase font-bold tracking-widest leading-none">
                    Inherit global configuration
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Receive shared global configs and secrets across environments
                  </p>
                </div>
                <Switch
                  id="edit-inherit-globals"
                  checked={watch('inheritGlobals')}
                  onCheckedChange={(checked) => setValue('inheritGlobals', checked)}
                  className="data-[state=checked]:bg-global"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 bg-muted/30 p-4 border-t border-border mt-0 sm:justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
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
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
