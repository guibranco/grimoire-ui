import React from 'react';
import { useStore } from '@/store/useStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Application } from '@/types/api';
import { 
  Shield, 
  Plus, 
  LogOut, 
  Activity,
  Box,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export const Sidebar: React.FC<{ onCreateApp: () => void }> = ({ onCreateApp }) => {
  const { selectedAppSlug, setSelectedAppSlug, disconnect } = useStore();
  
  const { data: apps, isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await api.get<Application[]>('/applications');
      return res.data;
    },
  });

  return (
    <aside className="w-[220px] border-r border-border bg-sidebar flex flex-col h-screen fixed left-0 top-0 z-20">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-grimoire shrink-0" />
          <h1 className="text-base font-bold tracking-tight text-foreground uppercase">Grimoire</h1>
        </div>
        <div className="text-[10px] text-zinc-600 font-mono mt-1 uppercase tracking-widest">v2.4.0-STABLE</div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col pt-4">
        <div className="px-5 py-2 flex items-center justify-between">
          <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Applications</h2>
        </div>

        <ScrollArea className="flex-1 px-2 mt-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {apps?.map((app) => (
                <button
                  key={app.slug}
                  onClick={() => setSelectedAppSlug(app.slug)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-1.5 text-[13px] font-medium transition-all group relative",
                    selectedAppSlug === app.slug 
                      ? "bg-zinc-900 border-l-2 border-grimoire text-grimoire" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <span className="truncate flex-1 text-left font-sans">{app.name}</span>
                </button>
              ))}
              <button 
                onClick={onCreateApp}
                className="w-[calc(100%-16px)] mx-2 mt-4 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-zinc-700 text-zinc-500 text-[10px] font-bold tracking-widest uppercase hover:border-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
                New Application
              </button>
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="p-4 border-t border-zinc-800 bg-black/40">
        <div className="flex items-center gap-2 text-[9px] font-mono mb-3 text-zinc-500">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" />
          CONNECTED: LOCAL_API
        </div>
        <Button 
          variant="ghost" 
          className="w-full h-8 bg-zinc-800 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-700 text-zinc-400"
          onClick={disconnect}
        >
          Disconnect
        </Button>
      </div>
    </aside>
  );
};
