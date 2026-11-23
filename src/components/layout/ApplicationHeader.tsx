import React from 'react';
import { Application } from '@/types/api';
import { FileUp, Plus, Pencil } from 'lucide-react';

interface ApplicationHeaderProps {
  app: Application;
  onEditApp: () => void;
  onAddEnv: () => void;
  /** Opens the import wizard; hidden while the application has no environments. */
  onImport?: () => void;
  onRotateKey: () => void;
  onDeleteApp: () => void;
}

export const ApplicationHeader: React.FC<ApplicationHeaderProps> = ({ 
  app, 
  onEditApp,
  onAddEnv, 
  onImport,
  onRotateKey, 
  onDeleteApp 
}) => {
  return (
    <header className="min-h-[64px] flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 md:px-6 md:py-0 border-b border-border bg-background">
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        <h2 className="text-lg md:text-xl font-semibold tracking-tight text-foreground truncate">{app.name}</h2>
        <span className="hidden sm:inline px-2 py-0.5 bg-zinc-900 text-zinc-500 font-mono text-[11px] border border-zinc-800 uppercase tracking-tight">
          slug: {app.slug}
        </span>
        <button
          type="button"
          onClick={onEditApp}
          title="Edit application"
          className="h-8 w-8 md:h-7 md:w-7 shrink-0 inline-flex items-center justify-center border border-border text-zinc-400 hover:text-foreground hover:bg-zinc-800 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <button 
          onClick={onAddEnv}
          className="h-[32px] px-3 border border-border text-[11px] font-bold uppercase tracking-widest text-grimoire hover:bg-grimoire/10 transition-colors inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Env
        </button>

        {onImport && (
          <button
            type="button"
            onClick={onImport}
            title="Import a .env, appsettings.json or PHP config"
            className="h-[32px] px-3 border border-border text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-zinc-800 transition-colors inline-flex items-center gap-1.5"
          >
            <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
            Import file
          </button>
        )}

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

