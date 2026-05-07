import React, { useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Check, Loader2, Key } from 'lucide-react';
import toast from 'react-hot-toast';

interface APIKeyRevealModalProps {
  apiKey: string | null;
  onClose: () => void;
}

export const APIKeyRevealModal: React.FC<APIKeyRevealModalProps> = ({ apiKey, onClose }) => {
  const [hasCopied, setHasCopied] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const copyToClipboard = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
      toast.success('API Key copied to clipboard');
    }
  };

  return (
    <Dialog open={!!apiKey} onOpenChange={(open) => !open && hasCopied && onClose()}>
      <DialogContent 
        className="max-w-md bg-card border-2 border-border p-0 gap-0 shadow-2xl"
        onEscapeKeyDown={(e) => !hasCopied && e.preventDefault()}
        onPointerDownOutside={(e) => !hasCopied && e.preventDefault()}
      >
        <div className="p-6">
          <DialogHeader className="mb-6">
            <div className="w-12 h-12 bg-vault/10 border-2 border-vault text-vault flex items-center justify-center mb-4">
              <Key className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight">Application API Key Created</DialogTitle>
            <DialogDescription className="text-muted-foreground mr-2">
              This key is used by your application to fetch secrets and configurations.
              <span className="text-destructive font-bold block mt-2">
                This will not be shown again. Copy it now and store it securely.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative group">
              <Input
                readOnly
                value={apiKey || ''}
                className="font-mono text-sm pr-12 bg-muted/50 border-border focus-visible:ring-vault"
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1 h-8 w-8 hover:bg-muted"
                onClick={copyToClipboard}
              >
                {copiedToClipboard ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-muted/30 border border-border">
              <Checkbox 
                id="copied-check" 
                checked={hasCopied} 
                onCheckedChange={(checked) => setHasCopied(checked === true)}
                className="mt-1 border-border data-[state=checked]:bg-vault data-[state=checked]:border-vault"
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="copied-check"
                  className="text-[12px] font-bold uppercase tracking-tight cursor-pointer"
                >
                  I have copied the API Key
                </label>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  You must confirm before closing this window.
                </p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="bg-muted/30 p-4 border-t border-border mt-0 sm:justify-end">
          <Button 
            onClick={onClose}
            disabled={!hasCopied}
            className="w-full sm:w-auto px-8 uppercase font-bold tracking-widest text-[10px] h-9 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30"
          >
            I'm Ready, Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
