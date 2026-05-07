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
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/src/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { APIKeyRevealModal } from './APIKeyRevealModal';
import { Loader2, Box } from 'lucide-react';
import toast from 'react-hot-toast';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
});

type FormData = z.infer<typeof schema>;

interface CreateAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateAppModal: React.FC<CreateAppModalProps> = ({ open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res = await api.post('/applications', data);
      setRevealKey(res.data.apiKey);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      reset();
      onOpenChange(false);
      toast.success('Application created');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create application');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
        <DialogContent className="max-w-md bg-card border-2 border-border p-0 gap-0 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="p-6">
              <DialogHeader className="mb-6">
                <div className="w-12 h-12 bg-muted/30 border-2 border-border flex items-center justify-center mb-4">
                  <Box className="w-6 h-6" />
                </div>
                <DialogTitle className="text-xl font-bold tracking-tight uppercase">Create New Application</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Define a new workspace for your secrets and configurations.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Application Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Payments Gateway"
                    className="border-border focus-visible:ring-grimoire"
                    {...register('name')}
                  />
                  {errors.name && <p className="text-[10px] text-destructive uppercase font-bold tracking-widest">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Briefly describe the purpose of this application..."
                    className="border-border focus-visible:ring-grimoire min-h-[100px] resize-none"
                    {...register('description')}
                  />
                  {errors.description && <p className="text-[10px] text-destructive uppercase font-bold tracking-widest">{errors.description.message}</p>}
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
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Application'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <APIKeyRevealModal apiKey={revealKey} onClose={() => setRevealKey(null)} />
    </>
  );
};

// Also need to create Textarea in UI
