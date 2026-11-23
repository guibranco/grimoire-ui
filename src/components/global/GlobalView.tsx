import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Application } from '@/types/api';
import { DEFAULT_GLOBAL_TAB, globalPath, isGlobalTab } from '@/lib/routes';
import { NotFoundView } from '@/components/shared/NotFoundView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Flag, Globe, Lock, Settings } from 'lucide-react';
import { GlobalConfigTab } from './GlobalConfigTab';
import { GlobalFlagsTab } from './GlobalFlagsTab';
import { GlobalSecretsTab } from './GlobalSecretsTab';

/**
 * Route element for `/global/:tab?`. `?key=` highlights (and, for secrets,
 * expands) a configuration key or secret name.
 */
export const GlobalView: React.FC = () => {
  const { tab } = useParams();
  if (tab !== undefined && !isGlobalTab(tab)) return <NotFoundView />;
  return <GlobalViewContent />;
};

const GlobalViewContent: React.FC = () => {
  const { tab } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = isGlobalTab(tab) ? tab : DEFAULT_GLOBAL_TAB;
  const highlightedKey = searchParams.get('key');
  const startCreating = searchParams.get('new') === '1';
  const [customSlugs, setCustomSlugs] = useState<string[]>([]);

  // `?new=1` opens the create form once; drop it so a refresh or Back doesn't reopen it.
  useEffect(() => {
    if (startCreating && activeTab !== 'flags') navigate(globalPath(activeTab, highlightedKey), { replace: true });
  }, [startCreating, activeTab, highlightedKey, navigate]);

  const { data: apps } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await api.get<Application[]>('/applications');
      return res.data;
    },
  });

  const safeApps = Array.isArray(apps) ? apps : [];
  const inheritingCount = safeApps.filter((a) => a.inheritGlobals !== false).length;

  const handleAddCustomSlug = (slug: string) => {
    setCustomSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="min-h-[64px] flex items-center justify-between px-4 py-3 md:px-6 md:py-0 border-b border-border bg-background">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <div className="w-8 h-8 bg-global/10 border border-global/40 text-global flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Global</h2>
              <Badge
                variant="outline"
                className="border-global/30 bg-global/10 text-global text-[10px] font-mono"
              >
                {inheritingCount} of {safeApps.length} applications inherit
              </Badge>
            </div>
            <p className="text-xs text-zinc-500">
              Inherited by every application unless it opts out
            </p>
          </div>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          // Switching tabs drops the ?key= highlight.
          if (isGlobalTab(val)) navigate(globalPath(val));
        }}
        className="flex-1 flex flex-col"
      >
        <div className="h-[44px] border-b border-border flex bg-[#121214] sticky top-0 z-10 shrink-0">
          <TabsList className="bg-transparent h-full p-0 flex gap-0 rounded-none w-full justify-start overflow-x-auto overflow-y-hidden">
            <TabsTrigger
              value="config"
              className="px-4 md:px-6 shrink-0 h-full bg-transparent border-r border-border data-[state=active]:bg-global/5 data-[state=active]:border-b-2 data-[state=active]:border-b-global data-[state=active]:text-global rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <Settings className="w-3.5 h-3.5" />
              Configuration
            </TabsTrigger>
            <TabsTrigger
              value="flags"
              className="px-4 md:px-6 shrink-0 h-full bg-transparent border-r border-border data-[state=active]:bg-global/5 data-[state=active]:border-b-2 data-[state=active]:border-b-global data-[state=active]:text-global rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <Flag className="w-3.5 h-3.5" />
              Feature Flags
            </TabsTrigger>
            <TabsTrigger
              value="secrets"
              className="px-4 md:px-6 shrink-0 h-full bg-transparent border-r border-border data-[state=active]:bg-global/5 data-[state=active]:border-b-2 data-[state=active]:border-b-global data-[state=active]:text-global rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <Lock className="w-3.5 h-3.5" />
              Secrets
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto bg-[#0A0A0B]">
          <TabsContent value="config" className="m-0 min-h-full">
            <GlobalConfigTab
              highlightedKey={activeTab === 'config' ? highlightedKey : null}
              startCreating={startCreating && activeTab === 'config'}
              customSlugs={customSlugs}
              onAddCustomSlug={handleAddCustomSlug}
            />
          </TabsContent>
          <TabsContent value="flags" className="m-0 min-h-full">
            {activeTab === 'flags' && <GlobalFlagsTab />}
          </TabsContent>
          <TabsContent value="secrets" className="m-0 min-h-full">
            <GlobalSecretsTab
              highlightedName={activeTab === 'secrets' ? highlightedKey : null}
              startCreating={startCreating && activeTab === 'secrets'}
              customSlugs={customSlugs}
              onAddCustomSlug={handleAddCustomSlug}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
