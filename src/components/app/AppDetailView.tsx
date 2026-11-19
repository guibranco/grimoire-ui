import React, { useState } from 'react';
import { useStore } from '@/store/useStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, extractPlainApiKey } from '@/lib/api';
import { Application, RotateKeyResponse } from '@/types/api';
import { ApplicationHeader } from '@/components/layout/ApplicationHeader';
import { GrimoireTab } from '@/components/grimoire/GrimoireTab';
import { ConfigTab } from '@/components/config/ConfigTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flag, Lock, Settings, Loader2 } from 'lucide-react';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { AddEnvModal } from '@/components/modals/AddEnvModal';
import { EditAppModal } from '@/components/modals/EditAppModal';
import { APIKeyRevealModal } from '@/components/modals/APIKeyRevealModal';
import toast from 'react-hot-toast';

export const AppDetailView: React.FC = () => {
  const { selectedAppSlug, setSelectedAppSlug } = useStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('config');
  const [isEditAppOpen, setIsEditAppOpen] = useState(false);
  const [isAddEnvOpen, setIsAddEnvOpen] = useState(false);
  const [isRotateKeyOpen, setIsRotateKeyOpen] = useState(false);
  const [isDeleteAppOpen, setIsDeleteAppOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const { data: app, isLoading, error } = useQuery({
    queryKey: ['application', selectedAppSlug],
    queryFn: async () => {
      const res = await api.get<Application>(`/applications/${selectedAppSlug}`);
      return res.data;
    },
    enabled: !!selectedAppSlug,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-grimoire" />
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground animate-pulse">
            Fetching Secure Assets...
          </p>
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <h3 className="text-lg font-bold">Error Loading Application</h3>
        <p className="text-muted-foreground text-sm">Could not find or load application metadata.</p>
        <button 
          onClick={() => setSelectedAppSlug(null)}
          className="mt-4 px-4 py-2 border border-border text-xs uppercase font-bold tracking-widest hover:bg-muted"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const handleRotateKey = async () => {
    try {
      const res = await api.post<RotateKeyResponse>(`/applications/${app.slug}/rotate-key`);
      const rotatedKey = extractPlainApiKey(res.data);
      if (!rotatedKey) {
        toast.error('Rotated API key was not returned by the server');
        return;
      }
      setRevealKey(rotatedKey);
      toast.success('API Key Rotated');
    } catch (err) {
      toast.error('Failed to rotate API key');
    }
  };

  const handleDeleteApp = async () => {
    try {
      await api.delete(`/applications/${app.slug}`);
      await queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Application deleted');
      setSelectedAppSlug(null);
    } catch (err) {
      toast.error('Failed to delete application');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ApplicationHeader 
        app={app} 
        onEditApp={() => setIsEditAppOpen(true)}
        onAddEnv={() => setIsAddEnvOpen(true)}
        onRotateKey={() => setIsRotateKeyOpen(true)}
        onDeleteApp={() => setIsDeleteAppOpen(true)}
      />

      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <div className="h-[44px] border-b border-border flex bg-[#121214] sticky top-0 z-10 shrink-0">
          <TabsList className="bg-transparent h-full p-0 flex gap-0 rounded-none w-full">
            <TabsTrigger 
              value="config" 
              className="px-6 h-full bg-transparent border-r border-border data-[state=active]:bg-config/5 data-[state=active]:border-b-2 data-[state=active]:border-b-config data-[state=active]:text-config rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <Settings className="w-3.5 h-3.5" />
              ⚙️ Configuration
            </TabsTrigger>
            <TabsTrigger
              value="feature-flags"
              disabled
              aria-disabled="true"
              title="Feature flags are coming soon"
              className="px-6 h-full bg-transparent border-r border-border rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 shadow-none cursor-not-allowed opacity-50"
            >
              <Flag className="w-3.5 h-3.5" />
              🚩 Feature Flags
              <span className="ml-1 px-1.5 py-0.5 border border-border text-[9px] font-mono tracking-widest text-zinc-500">SOON</span>
            </TabsTrigger>
            <TabsTrigger 
              value="secrets" 
              className="px-6 h-full bg-transparent border-r border-border data-[state=active]:bg-grimoire/5 data-[state=active]:border-b-2 data-[state=active]:border-b-grimoire data-[state=active]:text-grimoire rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <Lock className="w-3.5 h-3.5" />
              🔐 Secrets
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto bg-[#0A0A0B]">
          <TabsContent value="config" className="m-0 min-h-full">
            <ConfigTab appSlug={app.slug} onAddEnv={() => setIsAddEnvOpen(true)} />
          </TabsContent>
          <TabsContent value="secrets" className="m-0 min-h-full">
            <GrimoireTab appSlug={app.slug} />
          </TabsContent>
        </div>
      </Tabs>

      <EditAppModal
        app={app}
        open={isEditAppOpen}
        onOpenChange={setIsEditAppOpen}
      />

      <AddEnvModal 
        appSlug={app.slug} 
        open={isAddEnvOpen} 
        onOpenChange={setIsAddEnvOpen} 
      />

      <ConfirmationModal 
        open={isRotateKeyOpen} 
        onOpenChange={setIsRotateKeyOpen}
        title="Rotate API Key"
        description={`Are you sure you want to rotate the API key for ${app.name}? The current key will immediately stop working for any services using it.`}
        onConfirm={handleRotateKey}
        confirmText="Rotate Key"
      />

      <ConfirmationModal 
        open={isDeleteAppOpen} 
        onOpenChange={setIsDeleteAppOpen}
        title="Delete Application"
        description={`Are you sure you want to delete ${app.name}? This action is irreversible and will delete all secrets and configurations associated with this application.`}
        onConfirm={handleDeleteApp}
        confirmText="Delete Application"
        variant="destructive"
      />

      <APIKeyRevealModal 
        apiKey={revealKey} 
        onClose={() => setRevealKey(null)}
        title="Application API Key Rotated"
      />
    </div>
  );
};
