import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, extractPlainApiKey } from '@/lib/api';
import { appPath, AppTab, DEFAULT_APP_TAB, dashboardPath, isAppTab } from '@/lib/routes';
import { Application, Environment, RotateKeyResponse } from '@/types/api';
import { ApplicationHeader } from '@/components/layout/ApplicationHeader';
import { GrimoireTab } from '@/components/grimoire/GrimoireTab';
import { ConfigTab } from '@/components/config/ConfigTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flag, History, Lock, Settings, Loader2 } from 'lucide-react';
import { AuditLogPanel } from '@/components/audit/AuditLogPanel';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { NotFoundView } from '@/components/shared/NotFoundView';
import { AddEnvModal } from '@/components/modals/AddEnvModal';
import { EditAppModal } from '@/components/modals/EditAppModal';
import { APIKeyRevealModal } from '@/components/modals/APIKeyRevealModal';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '@/lib/errors';

const isNotFound = (err: unknown) =>
  (err as { response?: { status?: number } } | null)?.response?.status === 404;

/**
 * Route element for `/apps/:appSlug/:envSlug?/:tab?`. Keyed by slug so local
 * state (open modals, expanded rows) resets when switching applications.
 */
export const AppDetailView: React.FC = () => {
  const { appSlug, tab } = useParams();
  if (!appSlug) return <NotFoundView />;
  if (tab !== undefined && !isAppTab(tab)) return <NotFoundView />;
  return <AppDetail key={appSlug} appSlug={appSlug} />;
};

const AppDetail: React.FC<{ appSlug: string }> = ({ appSlug }) => {
  const { envSlug: envParam, tab: tabParam } = useParams();
  const [searchParams] = useSearchParams();
  // `?key=` highlights a configuration key or secret name (e.g. from the dashboard).
  const highlightedKey = searchParams.get('key');
  const navigate = useNavigate();
  const setLastVisited = useStore((s) => s.setLastVisited);
  const forgetLastVisited = useStore((s) => s.forgetLastVisited);
  const queryClient = useQueryClient();
  // Only used for apps without environments, where the tab can't be put in the URL.
  const [fallbackTab, setFallbackTab] = useState<AppTab>(DEFAULT_APP_TAB);
  const [isEditAppOpen, setIsEditAppOpen] = useState(false);
  const [isAddEnvOpen, setIsAddEnvOpen] = useState(false);
  const [isRotateKeyOpen, setIsRotateKeyOpen] = useState(false);
  const [isDeleteAppOpen, setIsDeleteAppOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const { data: app, isLoading, error } = useQuery({
    queryKey: ['application', appSlug],
    queryFn: async () => {
      const res = await api.get<Application>(`/applications/${appSlug}`);
      // The demo mock adapter resolves error statuses instead of rejecting like axios does.
      if (res.status >= 400) {
        throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      }
      return res.data;
    },
    retry: (failureCount, err) => !isNotFound(err) && failureCount < 1,
  });

  const { data: envs, isSuccess: envsLoaded } = useQuery({
    queryKey: ['environments', appSlug],
    queryFn: async () => {
      const res = await api.get<Environment[]>(`/applications/${appSlug}/environments`);
      return res.data;
    },
    enabled: !!app,
  });

  const safeEnvs = Array.isArray(envs) ? envs : [];
  const paramEnvExists = !!envParam && safeEnvs.some((e) => e.slug === envParam);
  // Until environments load, trust the URL so the config tab can start fetching.
  let activeEnvSlug: string | null = envParam ?? null;
  if (envsLoaded && !paramEnvExists) activeEnvSlug = safeEnvs[0]?.slug ?? null;

  // With an environment in the URL the tab lives there too; otherwise use local state.
  let activeTab: AppTab = envParam ? DEFAULT_APP_TAB : fallbackTab;
  if (isAppTab(tabParam)) activeTab = tabParam;

  useEffect(() => {
    if (app && envsLoaded) setLastVisited(app.slug, activeEnvSlug);
  }, [app, envsLoaded, activeEnvSlug, setLastVisited]);

  // A tab picked before environments loaded (or on /apps/:appSlug) moves into the URL
  // once there is an environment to hold it.
  const firstEnvSlug = safeEnvs[0]?.slug;
  useEffect(() => {
    if (!envParam && firstEnvSlug && fallbackTab !== DEFAULT_APP_TAB) {
      navigate(appPath(appSlug, firstEnvSlug, fallbackTab), { replace: true });
    }
  }, [envParam, firstEnvSlug, fallbackTab, appSlug, navigate]);

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

  if (isNotFound(error)) {
    return (
      <NotFoundView
        title="Application not found"
        description={<>There is no application with the slug <code className="font-mono text-zinc-300">{appSlug}</code>.</>}
      />
    );
  }

  if (error || !app) {
    return (
      <div role="alert" className="flex-1 flex flex-col items-center justify-center p-6">
        <h3 className="text-lg font-bold">Error Loading Application</h3>
        <p className="text-muted-foreground text-sm">Could not find or load application metadata.</p>
        <button
          type="button"
          onClick={() => navigate(dashboardPath())}
          className="mt-4 px-4 py-2 border border-border text-xs uppercase font-bold tracking-widest hover:bg-muted"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Unknown environment in the URL: fall back to the default environment.
  if (envParam && envsLoaded && !paramEnvExists) {
    return <Navigate to={appPath(app.slug, safeEnvs[0]?.slug, activeTab, highlightedKey)} replace />;
  }

  const handleTabChange = (value: string) => {
    if (!isAppTab(value)) return;
    if (activeEnvSlug) {
      navigate(appPath(app.slug, activeEnvSlug, value));
    } else {
      // No environment to put in the URL yet; the effect above moves it there once one exists.
      setFallbackTab(value);
    }
  };

  const handleEnvironmentChange = (slug: string | null) => {
    navigate(appPath(app.slug, slug, activeTab));
  };

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
      toast.error(apiErrorMessage(err, 'Failed to rotate API key'));
    }
  };

  const handleDeleteApp = async () => {
    try {
      await api.delete(`/applications/${app.slug}`);
      await queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Application deleted');
      forgetLastVisited(app.slug);
      navigate(dashboardPath(), { replace: true });
      queryClient.removeQueries({ queryKey: ['application', app.slug] });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to delete application'));
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
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col"
      >
        <div className="h-[44px] border-b border-border flex bg-[#121214] sticky top-0 z-10 shrink-0">
          <TabsList className="bg-transparent h-full p-0 flex gap-0 rounded-none w-full justify-start overflow-x-auto overflow-y-hidden">
            <TabsTrigger 
              value="config" 
              className="px-4 md:px-6 shrink-0 h-full bg-transparent border-r border-border data-[state=active]:bg-config/5 data-[state=active]:border-b-2 data-[state=active]:border-b-config data-[state=active]:text-config rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <Settings className="w-3.5 h-3.5" />
              ⚙️ Configuration
            </TabsTrigger>
            <TabsTrigger
              value="feature-flags"
              disabled
              aria-disabled="true"
              title="Feature flags are coming soon"
              className="px-4 md:px-6 shrink-0 h-full bg-transparent border-r border-border rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 shadow-none cursor-not-allowed opacity-50"
            >
              <Flag className="w-3.5 h-3.5" />
              🚩 Feature Flags
              <span className="ml-1 px-1.5 py-0.5 border border-border text-[9px] font-mono tracking-widest text-zinc-500">SOON</span>
            </TabsTrigger>
            <TabsTrigger 
              value="secrets" 
              className="px-4 md:px-6 shrink-0 h-full bg-transparent border-r border-border data-[state=active]:bg-grimoire/5 data-[state=active]:border-b-2 data-[state=active]:border-b-grimoire data-[state=active]:text-grimoire rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <Lock className="w-3.5 h-3.5" />
              🔐 Secrets
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="px-4 md:px-6 shrink-0 h-full bg-transparent border-r border-border data-[state=active]:bg-zinc-800/40 data-[state=active]:border-b-2 data-[state=active]:border-b-zinc-300 data-[state=active]:text-zinc-100 rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <History className="w-3.5 h-3.5" />
              Activity
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto bg-[#0A0A0B]">
          <TabsContent value="config" className="m-0 min-h-full">
            <ConfigTab
              appSlug={app.slug}
              environmentSlug={activeEnvSlug}
              onEnvironmentChange={handleEnvironmentChange}
              onAddEnv={() => setIsAddEnvOpen(true)}
              highlightedKey={activeTab === 'config' ? highlightedKey : null}
            />
          </TabsContent>
          <TabsContent value="secrets" className="m-0 min-h-full">
            <GrimoireTab
              appSlug={app.slug}
              highlightedName={activeTab === 'secrets' ? highlightedKey : null}
            />
          </TabsContent>
          <TabsContent value="activity" className="m-0 min-h-full p-4 md:p-6">
            {activeTab === 'activity' && <AuditLogPanel application={app.slug} />}
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
