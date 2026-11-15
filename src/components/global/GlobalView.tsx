import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Application } from '@/types/api';
import { useStore } from '@/store/useStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Globe, Lock, Settings } from 'lucide-react';
import { GlobalConfigTab } from './GlobalConfigTab';
import { GlobalSecretsTab } from './GlobalSecretsTab';

export const GlobalView: React.FC = () => {
  const { globalTargetTab, globalHighlightedKey, clearGlobalHighlight } = useStore();
  const [activeTab, setActiveTab] = useState<'config' | 'secrets'>(globalTargetTab || 'config');
  const [customSlugs, setCustomSlugs] = useState<string[]>([]);

  useEffect(() => {
    if (globalTargetTab) {
      setActiveTab(globalTargetTab);
    }
  }, [globalTargetTab]);

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
      <header className="h-[64px] flex items-center justify-between px-6 border-b border-border bg-background">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-global/10 border border-global/40 text-global flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
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
          setActiveTab(val as 'config' | 'secrets');
          if (globalHighlightedKey) {
            clearGlobalHighlight();
          }
        }}
        className="flex-1 flex flex-col"
      >
        <div className="h-[44px] border-b border-border flex bg-[#121214] sticky top-0 z-10 shrink-0">
          <TabsList className="bg-transparent h-full p-0 flex gap-0 rounded-none w-full">
            <TabsTrigger
              value="config"
              className="px-6 h-full bg-transparent border-r border-border data-[state=active]:bg-global/5 data-[state=active]:border-b-2 data-[state=active]:border-b-global data-[state=active]:text-global rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <Settings className="w-3.5 h-3.5" />
              Configuration
            </TabsTrigger>
            <TabsTrigger
              value="secrets"
              className="px-6 h-full bg-transparent border-r border-border data-[state=active]:bg-global/5 data-[state=active]:border-b-2 data-[state=active]:border-b-global data-[state=active]:text-global rounded-none font-bold uppercase tracking-tight text-[11px] gap-2 transition-all shadow-none"
            >
              <Lock className="w-3.5 h-3.5" />
              Secrets
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto bg-[#0A0A0B]">
          <TabsContent value="config" className="m-0 min-h-full">
            <GlobalConfigTab
              highlightedKey={globalHighlightedKey}
              customSlugs={customSlugs}
              onAddCustomSlug={handleAddCustomSlug}
            />
          </TabsContent>
          <TabsContent value="secrets" className="m-0 min-h-full">
            <GlobalSecretsTab
              highlightedName={globalHighlightedKey}
              customSlugs={customSlugs}
              onAddCustomSlug={handleAddCustomSlug}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
