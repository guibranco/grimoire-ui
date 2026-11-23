import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/errors';
import type { Application } from '@/types/api';

/** Shown on an application's secrets and configuration tabs when it doesn't inherit global values. */
export const InheritGlobalsBanner: React.FC<{ appSlug: string }> = ({ appSlug }) => {
  const queryClient = useQueryClient();
  const [enabling, setEnabling] = useState(false);

  const { data: app } = useQuery({
    queryKey: ['application', appSlug],
    queryFn: async () => (await api.get<Application>(`/applications/${appSlug}`)).data,
    enabled: !!appSlug,
  });

  if (app?.inheritGlobals !== false) return null;

  const enable = async () => {
    setEnabling(true);
    try {
      await api.put(`/applications/${appSlug}`, {
        name: app.name,
        description: app.description ?? '',
        inheritGlobals: true,
      });
      await Promise.all(
        [['application', appSlug], ['applications'], ['effective-configurations', appSlug], ['effective-secrets', appSlug]].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey })
        )
      );
      toast.success('Global inheritance enabled');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to enable global inheritance'));
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="px-4 md:px-6 py-2 bg-zinc-900/70 border-b border-border flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 shrink-0">
      <span>This application does not inherit global values</span>
      <button
        type="button"
        disabled={enabling}
        onClick={enable}
        className="text-[11px] font-bold uppercase tracking-widest text-global hover:text-global/80 transition-colors disabled:opacity-50"
      >
        {enabling ? 'Enabling...' : 'Turn it on'}
      </button>
    </div>
  );
};
