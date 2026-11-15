import React from 'react';
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
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  confirmationWord?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = 'default',
  confirmationWord,
}) => {
  const [loading, setLoading] = React.useState(false);
  const [confirmInput, setConfirmInput] = React.useState('');

  const requiredWord = confirmationWord ?? (variant === 'destructive' ? 'DELETE' : undefined);
  const isConfirmationValid = !requiredWord || confirmInput === requiredWord;

  React.useEffect(() => {
    if (!open) {
      setConfirmInput('');
    }
  }, [open]);

  const handleConfirm = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isConfirmationValid || loading) return;

    setLoading(true);
    try {
      await onConfirm();
      setConfirmInput('');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <DialogContent className="sm:max-w-md bg-card border-2 border-border p-0 gap-0 shadow-2xl">
        <form onSubmit={handleConfirm}>
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 shrink-0 flex items-center justify-center border-2 ${variant === 'destructive' ? 'border-destructive text-destructive bg-destructive/10' : 'border-grimoire text-grimoire bg-grimoire/10'}`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-tight">{title}</DialogTitle>
                <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
              </DialogHeader>
            </div>

            {requiredWord && (
              <div className="mt-5 space-y-2 border-t border-border pt-4">
                <Label
                  htmlFor="confirm-delete-input"
                  className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block"
                >
                  Type <span className="font-mono text-destructive">{requiredWord}</span> to confirm
                </Label>
                <Input
                  id="confirm-delete-input"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={requiredWord}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={loading}
                  className="font-mono text-sm border-border bg-background focus-visible:ring-destructive"
                />
              </div>
            )}
          </div>
          <DialogFooter className="mx-0 mb-0 bg-muted/30 p-4 border-t border-border mt-0 sm:justify-end gap-2">
            <Button 
              type="button"
              variant="ghost" 
              disabled={loading}
              onClick={() => onOpenChange(false)}
              className="uppercase font-bold tracking-widest text-[10px] h-9"
            >
              {cancelText}
            </Button>
            <Button 
              type="submit"
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              disabled={loading || !isConfirmationValid}
              className="uppercase font-bold tracking-widest text-[10px] h-9"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

