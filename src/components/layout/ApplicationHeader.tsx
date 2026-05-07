import React from 'react';
import { useStore } from '@/src/store/useStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/lib/api';
import { Application, Environment } from '@/src/types/api';
import { 
  ChevronDown, 
  Plus, 
  RefreshCcw, 
  Trash2,
  Settings,
  Globe,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import toast from 'react-hot-toast';

interface ApplicationHeaderProps {
  app: Application;
  onAddEnv: () => void;
  onRotateKey: () => void;
  onDeleteApp: () => void;
}

export const ApplicationHeader: React.FC<ApplicationHeaderProps> = ({ 
  app, 
  onAddEnv, 
  onRotateKey, 
  onDeleteApp 
}) => {
  const { selectedEnvironmentSlug, setSelectedEnvironmentSlug } = useStore();
  
  const { data: envs, isLoading: envsLoading } = useQuery({
    queryKey: ['environments', app.slug],
    queryFn: async () => {
      const res = await api.get<Environment[]>(`/applications/${app.slug}/environments`);
      return res.data;
    },
    enabled: !!app.slug,
  });

  const selectedEnv = envs?.find(e => e.slug === selectedEnvironmentSlug) || envs?.[0];

  React.useEffect(() => {
    if (envs?.length && !selectedEnvironmentSlug) {
      setSelectedEnvironmentSlug(envs[0].slug);
    }
  }, [envs, selectedEnvironmentSlug, setSelectedEnvironmentSlug]);

  return (
    <header className="h-[64px] flex items-center justify-between px-6 border-b border-border bg-background">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{app.name}</h2>
        <span className="px-2 py-0.5 bg-zinc-900 text-zinc-500 font-mono text-[11px] border border-zinc-800 uppercase tracking-tight">
          slug: {app.slug}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center bg-zinc-900 border border-zinc-800 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
          <span>ENV:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 text-vault ml-2 font-bold cursor-pointer hover:text-vault/80 transition-colors">
                {selectedEnv?.name || 'SELECT'}
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px] bg-[#0A0A0B] border-border shadow-2xl p-0">
              {envs?.map((env) => (
                <DropdownMenuItem 
                  key={env.slug}
                  onClick={() => setSelectedEnvironmentSlug(env.slug)}
                  className="font-mono text-[11px] uppercase p-2 border-b border-zinc-900 last:border-0 hover:bg-zinc-900 cursor-pointer"
                >
                  {env.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-zinc-800 m-0" />
              <DropdownMenuItem onClick={onAddEnv} className="text-[11px] font-bold uppercase p-2 text-vault hover:bg-vault/5 cursor-pointer">
                + Add Environment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <button 
          onClick={onRotateKey}
          className="h-[32px] px-3 border border-border text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-zinc-800 transition-colors"
        >
          Rotate Key
        </button>

        <button 
          onClick={onDeleteApp}
          className="h-[32px] px-3 border border-destructive/30 text-[11px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 transition-colors"
        >
          Delete App
        </button>
      </div>
    </header>
  );
};
