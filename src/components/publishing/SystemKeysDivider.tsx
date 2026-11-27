import React from 'react';
import { RefreshCw } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';

interface SystemKeysDividerProps {
  /** Number of columns in the table, so the divider spans the full width. */
  colSpan: number;
  /** Whether the section lists the global sentinel (changes the explanation). */
  global?: boolean;
}

/**
 * Header row that opens the "System keys" section of a configuration table: the sentinel keys
 * Grimoire manages (`Sentinel`, `Global:Sentinel`), kept apart from the user's own entries.
 */
export const SystemKeysDivider: React.FC<SystemKeysDividerProps> = ({ colSpan, global = false }) => (
  <TableRow
    data-testid="system-keys-divider"
    className="bg-zinc-900/60 hover:bg-zinc-900/60 border-y border-zinc-800 h-9"
  >
    <TableCell colSpan={colSpan} className="pl-6 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          <RefreshCw className="w-3 h-3" />
          System keys
        </span>
        <span className="text-[11px] text-zinc-500 font-sans">
          {global
            ? 'Managed by Grimoire. Changes when global configuration is published, so clients know to reload.'
            : 'Managed by Grimoire. Changes when configuration is published, so clients know to reload.'}
        </span>
      </div>
    </TableCell>
  </TableRow>
);
