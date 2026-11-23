import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useScrollToHighlighted } from '@/lib/useScrollToHighlighted';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { GlobalConfiguration, GlobalEnvironment } from '@/types/api';
import {
  Search,
  Globe,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
  FileJson,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfigValueCell, ConfigValueField, useConfigValue } from '@/components/shared/ConfigValueEditor';
import { exportValue, importEntry, valueTypeOf } from '@/lib/configValue';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '@/lib/errors';

interface GlobalConfigTabProps {
  highlightedKey?: string | null;
  customSlugs?: string[];
  onAddCustomSlug?: (slug: string) => void;
  /** Open the "add configuration" row (from `?new=1`, e.g. the dashboard's quick action). */
  startCreating?: boolean;
}

export const GlobalConfigTab: React.FC<GlobalConfigTabProps> = ({
  highlightedKey = null,
  startCreating = false,
  customSlugs: externalCustomSlugs,
  onAddCustomSlug,
}) => {
  const [selectedEnvFilter, setSelectedEnvFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(startCreating);
  useEffect(() => {
    if (startCreating) setIsAdding(true);
  }, [startCreating]);
  const [editingItem, setEditingItem] = useState<{ environmentSlug: string; key: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<GlobalConfiguration | null>(null);
  const [localCustomSlugs, setLocalCustomSlugs] = useState<string[]>([]);
  const [customSlugInput, setCustomSlugInput] = useState('');
  const [showCustomSlugInput, setShowCustomSlugInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const customSlugs = externalCustomSlugs ?? localCustomSlugs;
  const addCustomSlug = (slug: string) => {
    const clean = slug.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/(^-|-$)/g, '');
    if (!clean) return;
    if (onAddCustomSlug) {
      onAddCustomSlug(clean);
    } else if (!localCustomSlugs.includes(clean)) {
      setLocalCustomSlugs((prev) => [...prev, clean]);
    }
    setCustomSlugInput('');
    setShowCustomSlugInput(false);
    setSelectedEnvFilter(clean);
  };

  const { data: globalEnvs } = useQuery({
    queryKey: ['global-environments'],
    queryFn: async () => {
      const res = await api.get<GlobalEnvironment[]>('/global/environments');
      return res.data;
    },
  });

  const { data: configs, isLoading: configsLoading } = useQuery({
    queryKey: ['global-configurations', selectedEnvFilter ?? 'all'],
    queryFn: async () => {
      const url = selectedEnvFilter
        ? `/global/configurations?environment=${encodeURIComponent(selectedEnvFilter)}`
        : '/global/configurations';
      const res = await api.get<GlobalConfiguration[]>(url);
      return res.data;
    },
  });
  useScrollToHighlighted(highlightedKey, !configsLoading);


  const safeEnvs = Array.isArray(globalEnvs) ? globalEnvs : [];
  const safeConfigs = Array.isArray(configs) ? configs : [];

  const envOptions = useMemo(() => {
    const seen = new Set<string>(['*']);
    const list: Array<{ slug: string; name: string; applicationCount?: number }> = [
      { slug: '*', name: 'All environments' },
    ];
    safeEnvs.forEach((e) => {
      if (e.slug && !seen.has(e.slug)) {
        seen.add(e.slug);
        list.push(e);
      }
    });
    customSlugs.forEach((slug) => {
      if (slug && !seen.has(slug)) {
        seen.add(slug);
        list.push({ slug, name: slug, applicationCount: 0 });
      }
    });
    safeConfigs.forEach((c) => {
      if (c.environmentSlug && !seen.has(c.environmentSlug)) {
        seen.add(c.environmentSlug);
        list.push({ slug: c.environmentSlug, name: c.environmentSlug, applicationCount: 0 });
      }
    });
    return list;
  }, [safeEnvs, customSlugs, safeConfigs]);

  const searchLower = search.toLowerCase();
  const filteredConfigs = safeConfigs.filter((c) =>
    (c.key || '').toLowerCase().includes(searchLower) ||
    String(c.value ?? '').toLowerCase().includes(searchLower) ||
    (c.description || '').toLowerCase().includes(searchLower)
  );

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '—' : format(d, 'yyyy-MM-dd HH:mm');
  };

  const handleExport = async () => {
    try {
      const res = await api.get<GlobalConfiguration[]>('/global/configurations');
      const all = Array.isArray(res.data) ? res.data : safeConfigs;
      const exportData: Record<string, Record<string, unknown>> = {};
      all.forEach((item) => {
        const envKey = item.environmentSlug || '*';
        if (!exportData[envKey]) {
          exportData[envKey] = {};
        }
        exportData[envKey][item.key] = exportValue(valueTypeOf(item), item.value);
      });
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'global-configurations.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Global configurations exported');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to export global configurations'));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content) as Record<string, Record<string, unknown>>;
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('Invalid JSON structure');
        }

        const requests: Promise<any>[] = [];
        Object.entries(data).forEach(([envSlug, entries]) => {
          if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;
          Object.entries(entries).forEach(([key, raw]) => {
            requests.push(
              api.post('/global/configurations', {
                environmentSlug: envSlug,
                key,
                ...importEntry(raw),
                description: 'Imported global configuration',
              })
            );
          });
        });

        await Promise.all(requests);
        await queryClient.invalidateQueries({ queryKey: ['global-configurations'] });
        await queryClient.invalidateQueries({ queryKey: ['effective-configurations'] });
        toast.success(`Imported ${requests.length} global configurations`);
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to import JSON. Expected format: { "<envSlug>": { "key": "value" } }.'));
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      const res = await api.delete(
        `/global/configurations/${encodeURIComponent(deletingItem.environmentSlug)}/${encodeURIComponent(deletingItem.key)}`
      );
      if (res?.status >= 400) {
        throw new Error(res.data?.message || 'Failed to delete global configuration');
      }
      await queryClient.invalidateQueries({ queryKey: ['global-configurations'] });
      await queryClient.invalidateQueries({ queryKey: ['effective-configurations'] });
      toast.success('Global configuration deleted');
      setDeletingItem(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to delete global configuration'));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-[#121214] px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <button
            type="button"
            onClick={() => setSelectedEnvFilter(null)}
            className={cn(
              "h-[26px] px-2.5 border text-[10px] font-bold uppercase tracking-widest transition-colors",
              selectedEnvFilter === null
                ? "border-global bg-global/15 text-global"
                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
            )}
          >
            All
          </button>

          {envOptions.map((env) => {
            const isWildcard = env.slug === '*';
            const isSelected = selectedEnvFilter === env.slug;
            return (
              <button
                key={env.slug}
                type="button"
                onClick={() => setSelectedEnvFilter(isSelected ? null : env.slug)}
                className={cn(
                  "h-[26px] px-2.5 border text-[10px] font-bold tracking-tight transition-colors inline-flex items-center gap-1.5",
                  isSelected
                    ? "border-global bg-global/15 text-global"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                )}
              >
                {isWildcard && <Globe className="w-3 h-3 text-global" />}
                <span>{isWildcard ? 'All environments' : env.slug}</span>
                {typeof env.applicationCount === 'number' && !isWildcard && (
                  <span className="text-[9px] font-mono text-zinc-500">({env.applicationCount})</span>
                )}
              </button>
            );
          })}

          {showCustomSlugInput ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addCustomSlug(customSlugInput);
              }}
              className="inline-flex items-center gap-1"
            >
              <input
                value={customSlugInput}
                onChange={(e) => setCustomSlugInput(e.target.value)}
                placeholder="env-slug"
                className="h-[26px] w-28 px-2 bg-zinc-900 border border-global/50 text-[11px] font-mono text-foreground"
                autoFocus
              />
              <button
                type="submit"
                className="h-[26px] px-2 bg-global text-black text-[10px] font-bold uppercase"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCustomSlugInput(false);
                  setCustomSlugInput('');
                }}
                className="h-[26px] px-1.5 border border-zinc-800 text-zinc-500 hover:text-zinc-300 text-[10px]"
              >
                <X className="w-3 h-3" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomSlugInput(true)}
              className="h-[26px] px-2.5 border border-dashed border-zinc-700 text-zinc-500 hover:border-global hover:text-global text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" /> custom slug
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-zinc-600" />
            <input
              placeholder="Filter globals..."
              className="w-full h-[28px] pl-8 pr-3 bg-zinc-900 border border-border text-xs focus:border-global transition-colors font-sans"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
            onClick={() => setIsAdding(true)}
            className="h-[28px] px-3 bg-global text-black hover:bg-global/90 font-bold uppercase tracking-tight text-[10px] transition-colors"
          >
            + Add Global
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scroll-area">
        {configsLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-global" />
            <span className="text-[10px] uppercase font-bold tracking-widest font-mono">Syncing Global Registry...</span>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-zinc-900/50">
              <TableRow className="hover:bg-transparent border-zinc-800 h-10">
                <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 pl-6">Environment</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Key Mapping</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Literal Value</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 hidden lg:table-cell">Context</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 hidden xl:table-cell">Timestamp</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-widest text-zinc-500 pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isAdding && (
                <GlobalConfigRow
                  defaultEnvSlug={selectedEnvFilter || '*'}
                  envOptions={envOptions}
                  onCancel={() => setIsAdding(false)}
                  onSave={() => setIsAdding(false)}
                />
              )}
              {filteredConfigs.length === 0 && !isAdding ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={6} className="p-12 text-center text-muted-foreground">
                    <FileJson className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-700">No Global Configurations Defined</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredConfigs.map((config) => {
                  const isEditing =
                    editingItem?.environmentSlug === config.environmentSlug &&
                    editingItem?.key === config.key;
                  const isHighlighted = !!highlightedKey && config.key === highlightedKey;

                  if (isEditing) {
                    return (
                      <GlobalConfigRow
                        key={`${config.environmentSlug}:::${config.key}`}
                        defaultEnvSlug={config.environmentSlug}
                        envOptions={envOptions}
                        initialData={config}
                        onCancel={() => setEditingItem(null)}
                        onSave={() => setEditingItem(null)}
                      />
                    );
                  }

                  return (
                    <TableRow
                      key={`${config.environmentSlug}:::${config.key}`}
                      data-highlighted={isHighlighted || undefined}
                      className={cn(
                        "group border-zinc-900/50 hover:bg-zinc-900/20 h-12 transition-colors",
                        isHighlighted && "bg-global/10 border-l-2 border-l-global"
                      )}
                    >
                      <TableCell className="pl-6">
                        {config.environmentSlug === '*' ? (
                          <Badge
                            variant="outline"
                            className="border-global/40 bg-global/10 text-global text-[10px] font-mono gap-1"
                          >
                            <Globe className="w-3 h-3" />
                            All environments
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-300 text-[10px] font-mono">
                            {config.environmentSlug}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[13px] font-bold text-global tracking-tight">{config.key}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-300">
                        <ConfigValueCell type={valueTypeOf(config)} value={config.value} />
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 hidden lg:table-cell font-sans">{config.description || '—'}</TableCell>
                      <TableCell className="text-[9px] font-mono text-zinc-600 hidden xl:table-cell">
                        {formatTimestamp(config.updatedAt || config.createdAt)}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end gap-2 pr-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            aria-label={`Edit ${config.key}`}
                            className="text-zinc-500 hover:text-global transition-colors"
                            onClick={() => setEditingItem({ environmentSlug: config.environmentSlug, key: config.key })}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${config.key}`}
                            className="text-zinc-700 hover:text-destructive transition-colors"
                            onClick={() => setDeletingItem(config)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmationModal
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
        onConfirm={handleDelete}
        title="Delete Global Configuration"
        description={`Deleting global configuration "${deletingItem?.key}" (${deletingItem?.environmentSlug === '*' ? 'All environments' : deletingItem?.environmentSlug}) affects all inheriting applications. Applications without an override will stop receiving this value.`}
        confirmText="Delete Global"
        variant="destructive"
      />
    </div>
  );
};

interface GlobalConfigRowProps {
  defaultEnvSlug: string;
  envOptions: Array<{ slug: string; name: string }>;
  initialData?: GlobalConfiguration;
  onCancel: () => void;
  onSave: () => void;
}

const GlobalConfigRow: React.FC<GlobalConfigRowProps> = ({
  defaultEnvSlug,
  envOptions,
  initialData,
  onCancel,
  onSave,
}) => {
  const [environmentSlug, setEnvironmentSlug] = useState(initialData?.environmentSlug || defaultEnvSlug || '*');
  const [key, setKey] = useState(initialData?.key || '');
  const valueState = useConfigValue(initialData ? valueTypeOf(initialData) : 'string', initialData?.value || '');
  const { valueType } = valueState;
  const [description, setDescription] = useState(initialData?.description || '');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

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
        const res = await api.put(
          `/global/configurations/${encodeURIComponent(initialData.environmentSlug)}/${encodeURIComponent(initialData.key)}`,
          { value: submitValue, description, valueType }
        );
        if (res?.status >= 400) {
          throw Object.assign(new Error(res.data?.message || 'Failed to update global configuration'), { response: res });
        }
      } else {
        const res = await api.post('/global/configurations', {
          environmentSlug,
          key,
          value: submitValue,
          description,
          valueType,
        });
        if (res?.status >= 400) {
          throw Object.assign(new Error(res.data?.message || 'Failed to create global configuration'), { response: res });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['global-configurations'] });
      await queryClient.invalidateQueries({ queryKey: ['effective-configurations'] });
      toast.success(initialData ? 'Global configuration updated' : 'Global configuration added');
      onSave();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error('Global configuration key already exists for this environment');
      } else {
        toast.error(apiErrorMessage(err, 'Failed to save global configuration'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <TableRow className="bg-global/5 border-global/20 border-x-2 border-x-global/30 align-top">
      <TableCell className="py-2 pl-6">
        {initialData ? (
          initialData.environmentSlug === '*' ? (
            <Badge variant="outline" className="border-global/40 bg-global/10 text-global text-[10px] font-mono gap-1">
              <Globe className="w-3 h-3" />
              All environments
            </Badge>
          ) : (
            <Badge variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-300 text-[10px] font-mono">
              {initialData.environmentSlug}
            </Badge>
          )
        ) : (
          <select
            aria-label="Global Environment"
            value={environmentSlug}
            onChange={(e) => setEnvironmentSlug(e.target.value)}
            className="h-8 px-2 bg-card border border-border font-mono text-xs text-foreground focus:border-global"
          >
            {envOptions.map((env) => (
              <option key={env.slug} value={env.slug}>
                {env.slug === '*' ? 'All environments' : env.slug}
              </option>
            ))}
          </select>
        )}
      </TableCell>
      <TableCell className="py-2">
        <Input
          placeholder="CONFIG_KEY"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="h-8 font-mono text-xs border-border bg-card focus-visible:ring-global"
          readOnly={!!initialData}
          autoFocus={!initialData}
        />
      </TableCell>
      <TableCell className="py-2 min-w-[280px]">
        <ConfigValueField state={valueState} accent="global" autoFocus={!!initialData} />
      </TableCell>
      <TableCell className="py-2 hidden lg:table-cell">
        <Input
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 text-[11px] border-border bg-card focus-visible:ring-global"
        />
      </TableCell>
      <TableCell className="py-2 hidden xl:table-cell"></TableCell>
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
