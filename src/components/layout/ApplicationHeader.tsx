import React from 'react';
import { Application } from '@/types/api';
import { Plus } from 'lucide-react';

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
  return (
    <header className="h-[64px] flex items-center justify-between px-6 border-b border-border bg-background">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{app.name}</h2>
        <span className="px-2 py-0.5 bg-zinc-900 text-zinc-500 font-mono text-[11px] border border-zinc-800 uppercase tracking-tight">
          slug: {app.slug}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button 
          onClick={onAddEnv}
          className="h-[32px] px-3 border border-border text-[11px] font-bold uppercase tracking-widest text-grimoire hover:bg-grimoire/10 transition-colors inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Env
        </button>

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

