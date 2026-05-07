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
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = 'default'
}) => {
  const [loading, setLoading] = React.useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-2 border-border p-0 gap-0 shadow-2xl">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-12 h-12 flex items-center justify-center border-2 ${variant === 'destructive' ? 'border-destructive text-destructive bg-destructive/10' : 'border-grimoire text-grimoire bg-grimoire/10'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-tight">{title}</DialogTitle>
              <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
            </DialogHeader>
          </div>
        </div>
        <DialogFooter className="bg-muted/30 p-4 border-t border-border mt-0 sm:justify-end gap-2">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="uppercase font-bold tracking-widest text-[10px] h-9"
          >
            {cancelText}
          </Button>
          <Button 
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={loading}
            className="uppercase font-bold tracking-widest text-[10px] h-9"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
