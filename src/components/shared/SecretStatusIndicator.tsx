import React from 'react';
import { SecretStatus } from '@/types/api';
import { cn } from '@/lib/utils';

const DOT: Record<SecretStatus, string> = {
  [SecretStatus.ENABLED]: 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]',
  [SecretStatus.DISABLED]: 'bg-zinc-700',
  [SecretStatus.EXPIRED]: 'bg-red-500',
  [SecretStatus.MISSING]: 'bg-zinc-800',
  [SecretStatus.PENDING]: 'bg-amber-500',
};

const LABEL: Partial<Record<SecretStatus, string>> = {
  [SecretStatus.ENABLED]: 'text-green-500',
  [SecretStatus.MISSING]: 'text-zinc-600',
};

/** A secret's status in one environment: a coloured dot and the status name. */
export const SecretStatusIndicator: React.FC<{ status: SecretStatus }> = ({ status }) => (
  <div className="flex items-center gap-2">
    <div className={cn('w-1.5 h-1.5 rounded-full', DOT[status])} />
    <span className={cn('text-[10px] font-bold uppercase tracking-widest', LABEL[status] ?? 'text-zinc-400')}>
      {status}
    </span>
  </div>
);
