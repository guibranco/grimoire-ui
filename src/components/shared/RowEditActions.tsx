import React from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';

/** The cancel and save buttons that end an inline-edit table row. */
export const RowEditActions: React.FC<{ loading: boolean; onCancel: () => void; onSave: () => void }> = ({
  loading,
  onCancel,
  onSave,
}) => (
  <TableCell className="py-2 text-right pr-6">
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Cancel"
        disabled={loading}
        className="h-8 w-8 hover:bg-red-500/10 text-destructive"
        onClick={onCancel}
      >
        <X className="w-4 h-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Save"
        disabled={loading}
        className="h-8 w-8 hover:bg-green-500/10 text-green-500"
        onClick={onSave}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </Button>
    </div>
  </TableCell>
);
