import React, { useState, useMemo, useEffect } from 'react';
import { useScrollToHighlighted } from '@/lib/useScrollToHighlighted';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Secret, SecretStatus, SecretVersion, GlobalEnvironment } from '@/types/api';
import {
  Search,
  Lock,
  Globe,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Loader2,
  History,
  Plus,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddSecretModal } from '@/components/grimoire/AddSecretModal';
import { EditSecretValueModal } from '@/components/grimoire/EditSecretValueModal';
import { SecretVersionsModal } from '@/components/grimoire/SecretVersionsModal';
import { EditSecretModal } from '@/components/grimoire/EditSecretModal';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface GlobalSecretsTabProps {
  highlightedName?: string | null;
  customSlugs?: string[];
  onAddCustomSlug?: (slug: string) => void;
  /** Open the "add secret" dialog (from `?new=1`, e.g. the dashboard's quick action). */
  startCreating?: boolean;
}

export const GlobalSecretsTab: React.FC<GlobalSecretsTabProps> = ({
  highlightedName = null,
  startCreating = false,
  customSlugs: externalCustomSlugs,
  onAddCustomSlug,
}) => {
  const [selectedEnvFilter, setSelectedEnvFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isAddSecretOpen, setIsAddSecretOpen] = useState(startCreating);
  useEffect(() => {
    if (startCreating) setIsAddSecretOpen(true);
  }, [startCreating]);
  const [expandedSecret, setExpandedSecret] = useState<string | null>(highlightedName);

  // Expand the highlighted secret when deep-linked to it (e.g. /global/secrets?key=NAME).
  useEffect(() => {
    if (highlightedName) setExpandedSecret(highlightedName);
  }, [highlightedName]);
  const [editingValue, setEditingValue] = useState<{ secretName: string; envSlug: string } | null>(null);
  const [viewingVersions, setViewingVersions] = useState<{ secretName: string; envSlug: string } | null>(null);
  const [deletingSecret, setDeletingSecret] = useState<string | null>(null);
  const [editingSecret, setEditingSecret] = useState<string | null>(null);
  const [localCustomSlugs, setLocalCustomSlugs] = useState<string[]>([]);
  const [customSlugInput, setCustomSlugInput] = useState('');
  const [showCustomSlugInput, setShowCustomSlugInput] = useState(false);

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

  const { data: secrets, isLoading: secretsLoading } = useQuery({
    queryKey: ['global-secrets'],
    queryFn: async () => {
      const res = await api.get<Secret[]>('/global/secrets');
      return res.data;
    },
  });
  useScrollToHighlighted(highlightedName, !secretsLoading);


  const { data: globalEnvs } = useQuery({
    queryKey: ['global-environments'],
    queryFn: async () => {
      const res = await api.get<GlobalEnvironment[]>('/global/environments');
      return res.data;
    },
  });

  const { data: expandedSecretDetail, isLoading: expandedSecretLoading } = useQuery({
    queryKey: ['global-secret', expandedSecret],
    queryFn: async () => {
      const res = await api.get<Secret>(`/global/secrets/${encodeURIComponent(expandedSecret!)}`);
      return res.data;
    },
    enabled: !!expandedSecret,
  });

  const safeSecrets = Array.isArray(secrets) ? secrets : [];
  const safeGlobalEnvs = Array.isArray(globalEnvs) ? globalEnvs : [];

  const envList = useMemo(() => {
    const seen = new Set<string>(['*']);
    const list: Array<{ slug: string; name: string; applicationCount?: number }> = [
      { slug: '*', name: 'All environments' },
    ];
    safeGlobalEnvs.forEach((e) => {
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
    return list;
  }, [safeGlobalEnvs, customSlugs]);

  const versionPairs = useMemo(
    () =>
      safeSecrets.flatMap((secret) =>
        envList.map((env) => ({
          secretName: secret.name,
          envSlug: env.slug,
        }))
      ),
    [safeSecrets, envList]
  );

  const versionQueries = useQueries({
    queries: versionPairs.map(({ secretName, envSlug }) => ({
      queryKey: ['global-secret-versions', secretName, envSlug],
      queryFn: async () => {
        try {
          const res = await api.get<SecretVersion[]>(
            `/global/secrets/${encodeURIComponent(secretName)}/versions/${encodeURIComponent(envSlug)}`
          );
          return Array.isArray(res.data) ? res.data : [];
        } catch (err: any) {
          if (err?.response?.status === 404) {
            return [] as SecretVersion[];
          }
          throw err;
        }
      },
      enabled: !!secretName && !!envSlug,
      retry: false,
    })),
  });

  const latestVersionByPair = useMemo(() => {
    const map = new Map<string, SecretVersion>();
    versionPairs.forEach(({ secretName, envSlug }, idx) => {
      const versions = versionQueries[idx]?.data;
      if (Array.isArray(versions) && versions.length > 0) {
        const latest = versions.reduce(
          (best, curr) => ((curr.version ?? 0) >= (best.version ?? 0) ? curr : best),
          versions[0]
        );
        map.set(`${secretName}:::${envSlug}`, latest);
      }
    });
    return map;
  }, [versionPairs, versionQueries]);

  const expandedVersionsLoading = useMemo(() => {
    if (!expandedSecret) return false;
    return versionPairs.some(
      (pair, idx) => pair.secretName === expandedSecret && versionQueries[idx]?.isLoading
    );
  }, [expandedSecret, versionPairs, versionQueries]);

  const resolveSecretVersion = (secretName: string, envSlug: string): SecretVersion | undefined => (
    latestVersionByPair.get(`${secretName}:::${envSlug}`)
  );

  const getSecretStatus = (secretName: string, envSlug: string): SecretStatus => {
    const versionInfo = resolveSecretVersion(secretName, envSlug);
    if (!versionInfo) return SecretStatus.MISSING;
    if (!versionInfo.isEnabled) return SecretStatus.DISABLED;

    const now = new Date();
    if (versionInfo.expiresAt) {
      const expires = new Date(versionInfo.expiresAt);
      if (!Number.isNaN(expires.getTime()) && expires < now) return SecretStatus.EXPIRED;
    }
    if (versionInfo.notBefore) {
      const notBefore = new Date(versionInfo.notBefore);
      if (!Number.isNaN(notBefore.getTime()) && notBefore > now) return SecretStatus.PENDING;
    }

    return SecretStatus.ENABLED;
  };

  const searchLower = search.toLowerCase();
  const filteredSecrets = safeSecrets.filter((s) => {
    const matchesSearch =
      (s.name || '').toLowerCase().includes(searchLower) ||
      (s.description || '').toLowerCase().includes(searchLower);
    if (!matchesSearch) return false;
    if (!selectedEnvFilter) return true;
    return getSecretStatus(s.name, selectedEnvFilter) !== SecretStatus.MISSING;
  });

  const formatDate = (ts?: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '—' : format(d, 'yyyy-MM-dd');
  };

  const handleDeleteSecret = async () => {
    if (!deletingSecret) return;
    try {
      await api.delete(`/global/secrets/${encodeURIComponent(deletingSecret)}`);
      await queryClient.invalidateQueries({ queryKey: ['global-secrets'] });
      await queryClient.invalidateQueries({ queryKey: ['global-secret', deletingSecret] });
      await queryClient.invalidateQueries({ queryKey: ['global-secret-versions', deletingSecret] });
      await queryClient.invalidateQueries({ queryKey: ['effective-secrets'] });
      if (expandedSecret === deletingSecret) {
        setExpandedSecret(null);
      }
      toast.success('Global secret deleted');
      setDeletingSecret(null);
    } catch {
      toast.error('Failed to delete global secret');
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

          {envList.map((env) => {
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

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-zinc-600" />
            <input
              placeholder="Search global secrets..."
              className="w-full h-[28px] pl-8 pr-3 bg-zinc-900 border border-border text-xs focus:border-global transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setIsAddSecretOpen(true)}
            className="h-[28px] px-3 bg-global text-black hover:bg-global/90 font-bold uppercase tracking-tight text-[10px] transition-colors"
          >
            + Add Secret
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scroll-area">
        {secretsLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-global" />
            <span className="text-[10px] uppercase font-bold tracking-widest font-mono text-zinc-700">Syncing Global Secrets...</span>
          </div>
        ) : filteredSecrets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full opacity-50">
            <Lock className="w-12 h-12 mb-4 text-muted-foreground" />
            <h3 className="text-lg font-bold tracking-tight uppercase">Global vault is empty</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">No global secrets defined</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-zinc-900/50">
              <TableRow className="hover:bg-transparent border-zinc-800 h-10">
                <TableHead className="w-[40px]"></TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Global Secret</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 hidden lg:table-cell">Presence</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-widest text-zinc-500 px-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSecrets.map((secret) => {
                const isExpanded = expandedSecret === secret.name;
                const isHighlighted = !!highlightedName && secret.name === highlightedName;
                const resolvedSecret: Secret =
                  isExpanded && expandedSecretDetail?.name === secret.name
                    ? { ...secret, ...expandedSecretDetail }
                    : secret;

                return (
                  <React.Fragment key={secret.name}>
                    <TableRow
                      data-highlighted={isHighlighted || undefined}
                      className={cn(
                        "cursor-pointer border-zinc-900/50 transition-colors h-14 group",
                        isExpanded ? "bg-zinc-900/40" : "hover:bg-zinc-900/20",
                        isHighlighted && "bg-global/10 border-l-2 border-l-global"
                      )}
                      onClick={() => setExpandedSecret(isExpanded ? null : secret.name)}
                    >
                      <TableCell className="text-center px-2">
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-global" /> : <ChevronDown className="w-3 h-3 text-zinc-700" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className={cn("font-mono text-sm font-medium transition-colors", isExpanded ? "text-global" : "text-zinc-200")}>
                            {secret.name}
                          </span>
                          <span className="text-[11px] text-zinc-600 truncate max-w-md">{secret.description || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex gap-1 flex-wrap">
                          {envList.map((env) => {
                            const status = getSecretStatus(resolvedSecret.name, env.slug);
                            if (status === SecretStatus.MISSING) return null;
                            if (env.slug === '*') {
                              return (
                                <Badge
                                  key={env.slug}
                                  variant="outline"
                                  className="px-1.5 py-0.5 border-global/40 bg-global/10 text-[9px] font-bold font-mono text-global gap-1"
                                >
                                  <Globe className="w-2.5 h-2.5" />
                                  All environments
                                </Badge>
                              );
                            }
                            return (
                              <div key={env.slug} className="px-1.5 py-0.5 border border-zinc-800 text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-tighter">
                                {env.slug.substring(0, 3)}
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            onClick={(e) => e.stopPropagation()}
                            className="h-8 w-8 inline-flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-[#0A0A0B] border-border p-0">
                            <DropdownMenuItem
                              className="text-[10px] uppercase font-bold tracking-widest p-2 hover:bg-zinc-900 cursor-pointer"
                              onClick={(e) => {
                                // Menu content is portalled, but React still bubbles the click
                                // to the row's onClick, which would toggle it straight back.
                                e.stopPropagation();
                                setExpandedSecret(isExpanded ? null : secret.name);
                              }}
                            >
                              {isExpanded ? 'Collapse' : 'Show Details'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-[10px] uppercase font-bold tracking-widest p-2 hover:bg-zinc-900 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingSecret(secret.name);
                              }}
                            >
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive text-[10px] uppercase font-bold tracking-widest p-2 hover:bg-destructive/10 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingSecret(secret.name);
                              }}
                            >
                              Delete Global Secret
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow className="bg-[#080809] border-zinc-900 hover:bg-[#080809]">
                        <TableCell colSpan={4} className="p-0">
                          <div className="p-4 md:p-8 border-l-2 border-global">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-12">
                              <div>
                                <h4 className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-600 mb-6 flex items-center gap-2">
                                  <div className="w-1 h-3 bg-global" />
                                  Global Secret Metadata
                                </h4>
                                <div className="grid grid-cols-2 gap-4 md:gap-6 bg-black/20 p-4 md:p-6 border border-zinc-900">
                                  <div className="col-span-2">
                                    <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Identifier</p>
                                    <p className="font-mono text-base text-zinc-200 tracking-tight break-all">{secret.name}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Created</p>
                                    <p className="font-mono text-xs text-zinc-400">{formatDate(resolvedSecret.createdAt)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Audit ID</p>
                                    <p className="font-mono text-xs text-zinc-400">#{resolvedSecret.id?.substring(0, 8) || 'N/A'}</p>
                                  </div>
                                  <div className="col-span-2">
                                    <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Description</p>
                                    <p className="text-sm text-zinc-400 leading-relaxed">{resolvedSecret.description || '—'}</p>
                                  </div>
                                  <div className="col-span-2">
                                    <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Rotation</p>
                                    <p className="font-mono text-xs text-zinc-400">
                                      {resolvedSecret.rotationIntervalDays ? `Every ${resolvedSecret.rotationIntervalDays} days` : 'No schedule'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-6">
                                <h4 className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-600 flex items-center gap-2">
                                  <div className="w-1 h-3 bg-zinc-800" />
                                  Environment Logic
                                  {(expandedSecretLoading || expandedVersionsLoading) && (
                                    <Loader2 className="w-3 h-3 animate-spin text-global ml-1" />
                                  )}
                                </h4>
                                <div className="border border-zinc-900 overflow-hidden">
                                  <Table>
                                    <TableHeader className="bg-black/40">
                                      <TableRow className="hover:bg-transparent border-zinc-900">
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-8">ENV</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-8">STATUS</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-8">VERSION</TableHead>
                                        <TableHead className="text-right text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-8 pr-4">ACTIONS</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {envList.map((env) => {
                                        const status = getSecretStatus(resolvedSecret.name, env.slug);
                                        const latestVersion = resolveSecretVersion(resolvedSecret.name, env.slug);
                                        const isWildcard = env.slug === '*';
                                        return (
                                          <TableRow key={env.slug} className="border-zinc-900 hover:bg-zinc-900/30 h-12 transition-colors">
                                            <td className="px-4 font-mono text-[11px] font-bold">
                                              {isWildcard ? (
                                                <span className="inline-flex items-center gap-1.5 text-global">
                                                  <Globe className="w-3 h-3" />
                                                  All environments
                                                </span>
                                              ) : (
                                                env.name
                                              )}
                                            </td>
                                            <td className="px-4">
                                              <div className="flex items-center gap-2">
                                                <div className={cn(
                                                  "w-1.5 h-1.5 rounded-full",
                                                  status === SecretStatus.ENABLED ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" :
                                                  status === SecretStatus.DISABLED ? "bg-zinc-700" :
                                                  status === SecretStatus.EXPIRED ? "bg-red-500" :
                                                  status === SecretStatus.MISSING ? "bg-zinc-800" : "bg-amber-500"
                                                )} />
                                                <span className={cn(
                                                  "text-[10px] font-bold uppercase tracking-widest",
                                                  status === SecretStatus.ENABLED ? "text-green-500" :
                                                  status === SecretStatus.MISSING ? "text-zinc-600" : "text-zinc-400"
                                                )}>
                                                  {status}
                                                </span>
                                              </div>
                                            </td>
                                            <td className="px-4 font-mono text-[10px] text-zinc-600">
                                              {latestVersion ? (
                                                <button
                                                  type="button"
                                                  onClick={() => setViewingVersions({ secretName: secret.name, envSlug: env.slug })}
                                                  className="inline-flex items-center gap-1 text-zinc-400 hover:text-global transition-colors"
                                                  title="View version history"
                                                >
                                                  <span>v{latestVersion.version}</span>
                                                  <History className="w-3 h-3" />
                                                </button>
                                              ) : (
                                                '—'
                                              )}
                                            </td>
                                            <td className="text-right pr-4">
                                              <button
                                                type="button"
                                                className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-global transition-colors"
                                                onClick={() => setEditingValue({ secretName: secret.name, envSlug: env.slug })}
                                              >
                                                {status === SecretStatus.MISSING ? '+ SET' : 'UPDATE'}
                                              </button>
                                            </td>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <AddSecretModal
        scope="global"
        customSlugs={customSlugs}
        open={isAddSecretOpen}
        onOpenChange={setIsAddSecretOpen}
      />

      {editingValue && (
        <EditSecretValueModal
          scope="global"
          secretName={editingValue.secretName}
          envSlug={editingValue.envSlug}
          open={!!editingValue}
          onOpenChange={(open) => !open && setEditingValue(null)}
        />
      )}

      {viewingVersions && (
        <SecretVersionsModal
          scope="global"
          secretName={viewingVersions.secretName}
          envSlug={viewingVersions.envSlug}
          open={!!viewingVersions}
          onOpenChange={(open) => !open && setViewingVersions(null)}
        />
      )}

      {editingSecret && (
        <EditSecretModal
          scope="global"
          secretName={editingSecret}
          open={!!editingSecret}
          onOpenChange={(open) => !open && setEditingSecret(null)}
        />
      )}
      <ConfirmationModal
        open={!!deletingSecret}
        onOpenChange={(open) => !open && setDeletingSecret(null)}
        onConfirm={handleDeleteSecret}
        title="Delete Global Secret"
        description={`Deleting global secret "${deletingSecret}" affects all inheriting applications and deletes all of its values across every environment. This action cannot be undone.`}
        confirmText="Delete Global Secret"
        variant="destructive"
      />
    </div>
  );
};
