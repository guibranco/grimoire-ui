import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Application, ConfigValueType, EffectiveConfiguration, Environment } from '@/types/api';
import { useNavigate } from 'react-router-dom';
import { globalPath } from '@/lib/routes';
import {
  Search,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
  FileJson,
  ChevronDown,
  Globe,
  ExternalLink,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { ConfigValueCell, ConfigValueField, useConfigValue } from '@/components/shared/ConfigValueEditor';
import { exportValue, importEntry, saveErrorMessage, valueTypeOf } from '@/lib/configValue';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface ConfigTabProps {
  appSlug: string;
  /** Environment shown, usually taken from the URL. Falls back to the first environment. */
  environmentSlug?: string | null;
  /** Called when the user picks (or deletes) an environment. Uncontrolled when omitted. */
  onEnvironmentChange?: (slug: string | null) => void;
  onAddEnv?: () => void;
}

export const ConfigTab: React.FC<ConfigTabProps> = ({ appSlug, environmentSlug, onEnvironmentChange, onAddEnv }) => {
  const navigate = useNavigate();
  const [localEnvironmentSlug, setLocalEnvironmentSlug] = useState<string | null>(null);
  const selectedEnvironmentSlug = onEnvironmentChange ? environmentSlug ?? null : localEnvironmentSlug;
  const setSelectedEnvironmentSlug = onEnvironmentChange ?? setLocalEnvironmentSlug;
  const [search, setSearch] = useState('');
  const [showInherited, setShowInherited] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [overridePrefill, setOverridePrefill] = useState<{
    key: string;
    value: string;
    description: string;
    valueType: ConfigValueType;
  } | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<EffectiveConfiguration | null>(null);
  const [deletingEnv, setDeletingEnv] = useState<Environment | null>(null);
  const [enablingInheritance, setEnablingInheritance] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const { data: app } = useQuery({
    queryKey: ['application', appSlug],
    queryFn: async () => {
      const res = await api.get<Application>(`/applications/${appSlug}`);
      return res.data;
    },
    enabled: !!appSlug,
  });

  const { data: envs } = useQuery({
    queryKey: ['environments', appSlug],
    queryFn: async () => {
      const res = await api.get<Environment[]>(`/applications/${appSlug}/environments`);
      return res.data;
    },
    enabled: !!appSlug,
  });

  const safeEnvs = Array.isArray(envs) ? envs : [];
  const selectedEnv = safeEnvs.find(e => e.slug === selectedEnvironmentSlug) || safeEnvs[0];
  const activeEnvironmentSlug = selectedEnv?.slug || null;

  const { data: effectiveConfigs, isLoading: configsLoading } = useQuery({
    queryKey: ['effective-configurations', appSlug, activeEnvironmentSlug],
    queryFn: async () => {
      const res = await api.get<EffectiveConfiguration[]>(
        `/applications/${appSlug}/configurations/effective?environment=${encodeURIComponent(activeEnvironmentSlug!)}`
      );
      return res.data;
    },
    enabled: !!appSlug && !!activeEnvironmentSlug,
  });

  const safeConfigs = Array.isArray(effectiveConfigs) ? effectiveConfigs : [];
  const visibleConfigs = showInherited
    ? safeConfigs
    : safeConfigs.filter(c => c.source !== 'global');

  const searchLower = search.toLowerCase();
  const filteredConfigs = visibleConfigs.filter(c =>
    (c.key || '').toLowerCase().includes(searchLower) ||
    String(c.value ?? '').toLowerCase().includes(searchLower) ||
    (c.description || '').toLowerCase().includes(searchLower)
  );

  const handleEnableInheritance = async () => {
    if (!app) return;
    setEnablingInheritance(true);
    try {
      await api.put(`/applications/${appSlug}`, {
        name: app.name,
        description: app.description ?? '',
        inheritGlobals: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['application', appSlug] });
      await queryClient.invalidateQueries({ queryKey: ['applications'] });
      await queryClient.invalidateQueries({ queryKey: ['effective-configurations', appSlug] });
      await queryClient.invalidateQueries({ queryKey: ['effective-secrets', appSlug] });
      toast.success('Global inheritance enabled');
    } catch {
      toast.error('Failed to enable global inheritance');
    } finally {
      setEnablingInheritance(false);
    }
  };

  const handleExport = () => {
    if (!activeEnvironmentSlug) return;
    // Export app-level entries only
    const appEntries = safeConfigs.filter(c => c.source === 'application');
    const exportData = appEntries.reduce(
      (acc, curr) => ({ ...acc, [curr.key]: exportValue(valueTypeOf(curr), curr.value) }),
      {}
    );
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appSlug}-${activeEnvironmentSlug}-config.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Configuration exported');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeEnvironmentSlug) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        const promises = Object.entries(data).map(([key, raw]) =>
          api.post(`/applications/${appSlug}/configurations`, {
            environmentSlug: activeEnvironmentSlug,
            key,
            ...importEntry(raw),
            description: 'Imported configuration'
          })
        );

        await Promise.all(promises);
        await queryClient.invalidateQueries({ queryKey: ['effective-configurations', appSlug] });
        await queryClient.invalidateQueries({ queryKey: ['configurations', appSlug] });
        toast.success(`Imported ${promises.length} configurations`);
      } catch {
        toast.error('Failed to import JSON. Ensure it is a flat key-value object.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    if (!deletingConfig || !activeEnvironmentSlug) return;
    const wasOverride = deletingConfig.overridesGlobal;
    try {
      await api.delete(
        `/applications/${appSlug}/configurations/${encodeURIComponent(activeEnvironmentSlug)}/${encodeURIComponent(deletingConfig.key)}`
      );
      await queryClient.invalidateQueries({ queryKey: ['effective-configurations', appSlug] });
      await queryClient.invalidateQueries({ queryKey: ['configurations', appSlug] });
      toast.success(wasOverride ? 'Global value is active again' : 'Configuration deleted');
    } catch {
      toast.error('Failed to delete configuration');
    }
  };

  const handleDeleteEnv = async () => {
    if (!deletingEnv) return;
    try {
      await api.delete(`/applications/${appSlug}/environments/${encodeURIComponent(deletingEnv.slug)}`);
      await queryClient.invalidateQueries({ queryKey: ['environments', appSlug] });
      await queryClient.invalidateQueries({ queryKey: ['effective-configurations', appSlug] });
      await queryClient.invalidateQueries({ queryKey: ['configurations', appSlug] });
      await queryClient.invalidateQueries({ queryKey: ['global-environments'] });
      if (activeEnvironmentSlug === deletingEnv.slug) {
        const remaining = safeEnvs.filter(e => e.slug !== deletingEnv.slug);
        setSelectedEnvironmentSlug(remaining[0]?.slug || null);
      }
      toast.success(`Environment "${deletingEnv.name}" deleted`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete environment');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="min-h-[48px] border-b border-border bg-[#121214] flex flex-wrap items-center justify-between px-4 md:px-6 py-2 shrink-0 gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 w-full md:w-auto md:flex-1">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 px-3 h-[28px] text-[10px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">
            <span>ENV:</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 text-config ml-2 font-bold cursor-pointer hover:text-config/80 transition-colors uppercase">
                {selectedEnv?.name || 'SELECT'}
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[210px] bg-[#0A0A0B] border-border shadow-2xl p-0">
                {safeEnvs.map((env) => (
                  <DropdownMenuItem
                    key={env.slug}
                    onClick={() => setSelectedEnvironmentSlug(env.slug)}
                    className="font-mono text-[11px] uppercase p-2 border-b border-zinc-900 last:border-0 hover:bg-zinc-900 cursor-pointer flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{env.name}</span>
                    <button
                      type="button"
                      title={`Delete ${env.name}`}
                      className="text-zinc-600 hover:text-destructive p-0.5 transition-colors shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingEnv(env);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
                {onAddEnv && (
                  <>
                    <DropdownMenuSeparator className="bg-zinc-800 m-0" />
                    <DropdownMenuItem
                      onClick={onAddEnv}
                      className="text-[11px] font-bold uppercase p-2 text-config hover:bg-config/5 cursor-pointer"
                    >
                      + Add Environment
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-zinc-600" />
            <input
              placeholder="Filter configs..."
              className="w-full h-[28px] pl-8 pr-3 bg-zinc-900 border border-border text-xs focus:border-config transition-colors font-sans"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              id="config-show-inherited"
              checked={showInherited}
              onCheckedChange={setShowInherited}
              className="data-[state=checked]:bg-global"
            />
            <Label
              htmlFor="config-show-inherited"
              className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 cursor-pointer"
            >
              Show inherited
            </Label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".json"
            onChange={handleImport}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-[28px] px-3 border border-border text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            Import
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="h-[28px] px-3 border border-border text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => {
              setOverridePrefill(null);
              setIsAdding(true);
            }}
            className="h-[28px] px-3 bg-config text-black hover:bg-config/90 font-bold uppercase tracking-tight text-[10px] transition-colors"
          >
            + Add Config
          </button>
        </div>
      </div>

      {app?.inheritGlobals === false && (
        <div className="px-4 md:px-6 py-2 bg-zinc-900/70 border-b border-border flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 shrink-0">
          <span>This application does not inherit global values</span>
          <button
            type="button"
            disabled={enablingInheritance}
            onClick={handleEnableInheritance}
            className="text-[11px] font-bold uppercase tracking-widest text-global hover:text-global/80 transition-colors disabled:opacity-50"
          >
            {enablingInheritance ? 'Enabling...' : 'Turn it on'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto scroll-area">
        {!activeEnvironmentSlug ? (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full opacity-50">
            <h3 className="text-lg font-bold tracking-tight uppercase">No Env Selected</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1 font-sans">Select or create an environment above</p>
          </div>
        ) : configsLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-[10px] uppercase font-bold tracking-widest font-mono">Syncing Registry...</span>
          </div>
        ) : (
          <div className="p-0">
            <Table>
              <TableHeader className="bg-zinc-900/50">
                <TableRow className="hover:bg-transparent border-zinc-800 h-10">
                  <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 pl-6">Key Mapping</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Literal Value</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 hidden lg:table-cell">Context</TableHead>
                  <TableHead className="text-right text-[10px] uppercase font-bold tracking-widest text-zinc-500 pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAdding && (
                  <ConfigRow
                    appSlug={appSlug}
                    envSlug={activeEnvironmentSlug}
                    prefillData={overridePrefill || undefined}
                    onCancel={() => {
                      setIsAdding(false);
                      setOverridePrefill(null);
                    }}
                    onSave={() => {
                      setIsAdding(false);
                      setOverridePrefill(null);
                    }}
                  />
                )}
                {filteredConfigs.length === 0 && !isAdding ? (
                  <TableRow className="border-border hover:bg-transparent">
                    <TableCell colSpan={4} className="p-12 text-center text-muted-foreground">
                      <FileJson className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-700">Empty Environment Configuration</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredConfigs.map((config) => {
                    const isGlobal = config.source === 'global';
                    if (!isGlobal && editingKey === config.key) {
                      return (
                        <ConfigRow
                          key={`${config.source}:::${config.key}`}
                          appSlug={appSlug}
                          envSlug={activeEnvironmentSlug}
                          initialData={{
                            key: config.key,
                            value: config.value,
                            description: config.description,
                            valueType: valueTypeOf(config),
                          }}
                          onCancel={() => setEditingKey(null)}
                          onSave={() => setEditingKey(null)}
                        />
                      );
                    }

                    return (
                      <TableRow
                        key={`${config.source}:::${config.key}`}
                        className={cn(
                          "group border-zinc-900/50 h-12 transition-colors",
                          isGlobal ? "bg-global/[0.03] hover:bg-global/[0.06]" : "hover:bg-zinc-900/20"
                        )}
                      >
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={cn(
                                "font-mono text-[13px] font-bold tracking-tight",
                                isGlobal ? "text-zinc-400" : "text-config"
                              )}
                            >
                              {config.key}
                            </span>
                            {isGlobal && (
                              <>
                                <Badge
                                  variant="outline"
                                  className="border-global/40 bg-global/10 text-global text-[9px] font-bold uppercase tracking-widest gap-1"
                                >
                                  <Globe className="w-2.5 h-2.5" />
                                  Global
                                </Badge>
                                {config.globalEnvironmentSlug && config.globalEnvironmentSlug !== '*' && (
                                  <Badge
                                    variant="outline"
                                    className="border-zinc-700 bg-zinc-900 text-zinc-400 text-[9px] font-mono"
                                  >
                                    {config.globalEnvironmentSlug}
                                  </Badge>
                                )}
                              </>
                            )}
                            {!isGlobal && config.overridesGlobal && (
                              <Badge
                                variant="outline"
                                title="Application value takes precedence over the inherited global value"
                                className="border-global/30 bg-global/5 text-global text-[9px] font-mono cursor-help"
                              >
                                overrides global
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={cn("font-mono text-xs", isGlobal ? "text-zinc-400" : "text-zinc-300")}>
                          <ConfigValueCell type={valueTypeOf(config)} value={config.value} />
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500 hidden lg:table-cell font-sans">
                          {config.description || '—'}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {isGlobal ? (
                            <div className="flex justify-end items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingKey(null);
                                  setOverridePrefill({
                                    key: config.key,
                                    value: config.value,
                                    description: config.description || '',
                                    valueType: valueTypeOf(config),
                                  });
                                  setIsAdding(true);
                                }}
                                className="px-2 py-0.5 border border-config/30 text-[10px] font-bold uppercase tracking-widest text-config hover:bg-config/10 transition-colors inline-flex items-center gap-1"
                              >
                                <ArrowUpRight className="w-3 h-3" />
                                Override
                              </button>
                              <button
                                type="button"
                                onClick={() => navigate(globalPath('config', config.key))}
                                className="px-2 py-0.5 border border-global/30 text-[10px] font-bold uppercase tracking-widest text-global hover:bg-global/10 transition-colors inline-flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View in Global
                              </button>
                            </div>
                          ) : (
                            <div
                              // Hide-until-hover only on devices that can hover; touch screens always show the actions.
                              className="flex justify-end gap-2 pr-1 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                            >
                              <button
                                type="button"
                                aria-label={`Edit ${config.key}`}
                                className="text-zinc-500 hover:text-config transition-colors"
                                onClick={() => setEditingKey(config.key)}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${config.key}`}
                                className="text-zinc-700 hover:text-destructive transition-colors"
                                onClick={() => setDeletingConfig(config)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ConfirmationModal
        open={!!deletingConfig}
        onOpenChange={(open) => !open && setDeletingConfig(null)}
        onConfirm={handleDelete}
        title="Delete Configuration"
        description={
          deletingConfig?.overridesGlobal
            ? `Are you sure you want to delete the override "${deletingConfig?.key}" from ${activeEnvironmentSlug}? The inherited global value will become active again.`
            : `Are you sure you want to delete the configuration key "${deletingConfig?.key}" from ${activeEnvironmentSlug}?`
        }
        confirmText="Remove Entry"
        variant="destructive"
      />

      <ConfirmationModal
        open={!!deletingEnv}
        onOpenChange={(open) => !open && setDeletingEnv(null)}
        onConfirm={handleDeleteEnv}
        title="Delete Environment"
        description={`Are you sure you want to delete the environment "${deletingEnv?.name}" (${deletingEnv?.slug})? This will remove all configurations in this environment.`}
        confirmText="Delete Environment"
        variant="destructive"
      />
    </div>
  );
};

interface RowSeed {
  key: string;
  value: string;
  description?: string | null;
  valueType?: ConfigValueType;
}

interface ConfigRowProps {
  appSlug: string;
  envSlug: string;
  initialData?: RowSeed;
  prefillData?: RowSeed;
  onCancel: () => void;
  onSave: () => void;
}

const ConfigRow: React.FC<ConfigRowProps> = ({
  appSlug,
  envSlug,
  initialData,
  prefillData,
  onCancel,
  onSave,
}) => {
  const seed = initialData || prefillData;
  const [key, setKey] = useState(seed?.key || '');
  const valueState = useConfigValue(seed?.valueType ?? 'string', seed?.value || '');
  const { valueType, reset: resetValue } = valueState;
  const [description, setDescription] = useState(seed?.description || '');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const nextSeed = initialData || prefillData;
    setKey(nextSeed?.key || '');
    resetValue(nextSeed?.valueType ?? 'string', nextSeed?.value || '');
    setDescription(nextSeed?.description || '');
  }, [initialData, prefillData, resetValue]);

  const handleSave = async () => {
    const prepared = valueState.prepare(key);
    if (!prepared.ok) {
      toast.error(prepared.error);
      return;
    }
    const submitValue = prepared.value;

    setLoading(true);
    try {
      if (initialData) {
        await api.put(
          `/applications/${appSlug}/configurations/${encodeURIComponent(envSlug)}/${encodeURIComponent(key)}`,
          { value: submitValue, description, valueType }
        );
      } else {
        await api.post(`/applications/${appSlug}/configurations`, {
          environmentSlug: envSlug,
          key,
          value: submitValue,
          description,
          valueType,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['effective-configurations', appSlug] });
      await queryClient.invalidateQueries({ queryKey: ['configurations', appSlug] });
      toast.success(initialData ? 'Configuration updated' : 'Configuration added');
      onSave();
    } catch (err) {
      toast.error(saveErrorMessage(err, 'Failed to save configuration'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <TableRow className="bg-config/5 border-config/20 border-x-2 border-x-config/30 align-top">
      <TableCell className="py-2 pl-6">
        <Input
          placeholder="CONFIG_KEY"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="h-8 font-mono text-xs border-border bg-card focus-visible:ring-config"
          readOnly={!!initialData}
          autoFocus={!initialData && !prefillData}
        />
      </TableCell>
      <TableCell className="py-2 min-w-[280px]">
        <ConfigValueField state={valueState} autoFocus={!!initialData || !!prefillData} />
      </TableCell>
      <TableCell className="py-2 hidden lg:table-cell">
        <Input
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 text-[11px] border-border bg-card focus-visible:ring-config"
        />
      </TableCell>
      <TableCell className="py-2 text-right pr-6">
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel"
            disabled={loading}
            className="h-8 w-8 hover:bg-red-500/10 text-destructive"
            onClick={onCancel}
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Save"
            disabled={loading}
            className="h-8 w-8 hover:bg-green-500/10 text-green-500"
            onClick={handleSave}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};
