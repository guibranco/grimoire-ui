import React from 'react';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The version an environment serves, opening its history; `—` when there is none. */
export const VersionHistoryButton: React.FC<{ version?: number; global?: boolean; onClick: () => void }> = ({
  version,
  global = false,
  onClick,
}) => {
  if (version === undefined) return <>—</>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-zinc-400 transition-colors',
        global ? 'hover:text-global' : 'hover:text-grimoire'
      )}
      title="View version history"
    >
      <span>v{version}</span>
      <History className="w-3 h-3" />
    </button>
  );
};
