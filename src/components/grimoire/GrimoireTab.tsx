import React, { useState, useMemo } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Application,
  EffectiveSecret,
  Secret,
  SecretStatus,
  SecretVersion,
  Environment,
} from '@/types/api';
import { useNavigate } from 'react-router-dom';
import { globalPath } from '@/lib/routes';
import {
  Search,
  Lock,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Loader2,
  History,
  Globe,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddSecretModal } from './AddSecretModal';
import { EditSecretValueModal } from './EditSecretValueModal';
import { SecretVersionsModal } from './SecretVersionsModal';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export const GrimoireTab: React.FC<{ appSlug: string }> = ({ appSlug }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showInherited, setShowInherited] = useState(true);
  const [isAddSecretOpen, setIsAddSecretOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<{ name: string; description: string } | null>(null);
  const [expandedSecret, setExpandedSecret] = useState<{ name: string; source: 'application' | 'global' } | null>(null);
  const [editingValue, setEditingValue] = useState<{ secretName: string; envSlug: string } | null>(null);
  const [viewingVersions, setViewingVersions] = useState<{
    secretName: string;
    envSlug: string;
    scope: 'global' | { appSlug: string };
  } | null>(null);
  const [deletingSecret, setDeletingSecret] = useState<EffectiveSecret | null>(null);
  const [enablingInheritance, setEnablingInheritance] = useState(false);

  const queryClient = useQueryClient();

  const { data: app } = useQuery({
    queryKey: ['application', appSlug],
    queryFn: async () => {
      const res = await api.get<Application>(`/applications/${appSlug}`);
      return res.data;
    },
    enabled: !!appSlug,
  });

  const { data: secrets, isLoading: secretsLoading } = useQuery({
    queryKey: ['effective-secrets', appSlug],
    queryFn: async () => {
      const res = await api.get<EffectiveSecret[]>(`/applications/${appSlug}/secrets/effective`);
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

  const { data: expandedSecretDetail, isLoading: expandedSecretLoading } = useQuery({
    queryKey: [
      expandedSecret?.source === 'global' ? 'global-secret' : 'secret',
      ...(expandedSecret?.source === 'global' ? [expandedSecret.name] : [appSlug, expandedSecret?.name]),
    ],
    queryFn: async () => {
      const url =
        expandedSecret?.source === 'global'
          ? `/global/secrets/${encodeURIComponent(expandedSecret.name)}`
          : `/applications/${appSlug}/secrets/${encodeURIComponent(expandedSecret!.name)}`;
      const res = await api.get<Secret>(url);
      return res.data;
    },
    enabled: !!appSlug && !!expandedSecret,
  });

  const safeSecrets = Array.isArray(secrets) ? secrets : [];
  const safeEnvs = Array.isArray(envs) ? envs : [];
  const visibleSecrets = showInherited
    ? safeSecrets
    : safeSecrets.filter(s => s.source !== 'global');

  const searchLower = search.toLowerCase();
  const filteredSecrets = visibleSecrets.filter(s =>
    (s.name || '').toLowerCase().includes(searchLower) ||
    (s.description || '').toLowerCase().includes(searchLower)
  );

  // Version queries for app secrets (per env) and global secrets (per env + wildcard '*')
  const appSecretsList = useMemo(
    () => safeSecrets.filter(s => s.source !== 'global'),
    [safeSecrets]
  );
  const globalSecretsList = useMemo(
    () => safeSecrets.filter(s => s.source === 'global'),
    [safeSecrets]
  );

  const appVersionPairs = useMemo(
    () =>
      appSecretsList.flatMap((secret) =>
        safeEnvs.map((env) => ({
          secretName: secret.name,
          envSlug: env.slug,
        }))
      ),
    [appSecretsList, safeEnvs]
  );

  const globalVersionPairs = useMemo(
    () =>
      globalSecretsList.flatMap((secret) => [
        { secretName: secret.name, envSlug: '*' },
        ...safeEnvs.map((env) => ({
          secretName: secret.name,
          envSlug: env.slug,
        })),
      ]),
    [globalSecretsList, safeEnvs]
  );

  const appVersionQueries = useQueries({
    queries: appVersionPairs.map(({ secretName, envSlug }) => ({
      queryKey: ['secret-versions', appSlug, secretName, envSlug],
      queryFn: async () => {
        try {
          const res = await api.get<SecretVersion[]>(
            `/applications/${appSlug}/secrets/${encodeURIComponent(secretName)}/versions/${encodeURIComponent(envSlug)}`
          );
          return Array.isArray(res.data) ? res.data : [];
        } catch (err: any) {
          if (err?.response?.status === 404) {
            return [] as SecretVersion[];
          }
          throw err;
        }
      },
      enabled: !!appSlug && !!secretName && !!envSlug,
      retry: false,
    })),
  });

  const globalVersionQueries = useQueries({
    queries: globalVersionPairs.map(({ secretName, envSlug }) => ({
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

  const latestAppVersionByPair = useMemo(() => {
    const map = new Map<string, SecretVersion>();
    appVersionPairs.forEach(({ secretName, envSlug }, idx) => {
      const versions = appVersionQueries[idx]?.data;
      if (Array.isArray(versions) && versions.length > 0) {
        const latest = versions.reduce((best, curr) =>
          (curr.version ?? 0) >= (best.version ?? 0) ? curr : best
        );
        map.set(`${secretName}:::${envSlug}`, latest);
      }
    });
    return map;
  }, [appVersionPairs, appVersionQueries]);

  const latestGlobalVersionByPair = useMemo(() => {
    const map = new Map<string, SecretVersion>();
    globalVersionPairs.forEach(({ secretName, envSlug }, idx) => {
      const versions = globalVersionQueries[idx]?.data;
      if (Array.isArray(versions) && versions.length > 0) {
        const latest = versions.reduce((best, curr) =>
          (curr.version ?? 0) >= (best.version ?? 0) ? curr : best
        );
        map.set(`${secretName}:::${envSlug}`, latest);
      }
    });
    return map;
  }, [globalVersionPairs, globalVersionQueries]);

  const expandedVersionsLoading = useMemo(() => {
    if (!expandedSecret) return false;
    if (expandedSecret.source === 'global') {
      return globalVersionPairs.some(
        (pair, idx) => pair.secretName === expandedSecret.name && globalVersionQueries[idx]?.isLoading
      );
    }
    return appVersionPairs.some(
      (pair, idx) => pair.secretName === expandedSecret.name && appVersionQueries[idx]?.isLoading
    );
  }, [expandedSecret, appVersionPairs, appVersionQueries, globalVersionPairs, globalVersionQueries]);

  const resolveSecretVersion = (
    secret: EffectiveSecret,
    envSlug: string
  ): { version?: SecretVersion; resolvedEnvSlug: string } => {
    if (secret.source === 'global') {
      const envSpecific = latestGlobalVersionByPair.get(`${secret.name}:::${envSlug}`);
      if (envSpecific) return { version: envSpecific, resolvedEnvSlug: envSlug };
      const wildcard = latestGlobalVersionByPair.get(`${secret.name}:::*`);
      if (wildcard) return { version: wildcard, resolvedEnvSlug: '*' };
      return { version: undefined, resolvedEnvSlug: envSlug };
    }
    return {
      version: latestAppVersionByPair.get(`${secret.name}:::${envSlug}`),
      resolvedEnvSlug: envSlug,
    };
  };

  const computeStatusFromVersion = (versionInfo?: SecretVersion): SecretStatus => {
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

  const getSecretStatus = (secret: EffectiveSecret, envSlug: string): SecretStatus => {
    const { version } = resolveSecretVersion(secret, envSlug);
    return computeStatusFromVersion(version);
  };

  const formatDate = (ts?: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '—' : format(d, 'yyyy-MM-dd');
  };

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

  const handleDeleteSecret = async () => {
    if (!deletingSecret) return;
    const wasOverride = deletingSecret.overridesGlobal;
    try {
      await api.delete(`/applications/${appSlug}/secrets/${encodeURIComponent(deletingSecret.name)}`);
      await queryClient.invalidateQueries({ queryKey: ['effective-secrets', appSlug] });
      await queryClient.invalidateQueries({ queryKey: ['secrets', appSlug] });
      await queryClient.invalidateQueries({ queryKey: ['secret', appSlug, deletingSecret.name] });
      await queryClient.invalidateQueries({ queryKey: ['secret-versions', appSlug, deletingSecret.name] });
      if (expandedSecret?.name === deletingSecret.name) {
        setExpandedSecret(null);
      }
      toast.success(wasOverride ? 'Global value is active again' : 'Secret deleted');
      setDeletingSecret(null);
    } catch {
      toast.error('Failed to delete secret');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="min-h-[48px] border-b border-border bg-[#121214] flex flex-wrap items-center justify-between px-4 md:px-6 py-2 shrink-0 gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 w-full md:w-auto md:flex-1">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest whitespace-nowrap">
            {filteredSecrets.length} Secrets Defined
          </span>
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-zinc-600" />
            <input
              placeholder="Search..."
              className="w-full h-[28px] pl-8 pr-3 bg-zinc-900 border border-border text-xs focus:border-grimoire transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              id="secrets-show-inherited"
              checked={showInherited}
              onCheckedChange={setShowInherited}
              className="data-[state=checked]:bg-global"
            />
            <Label
              htmlFor="secrets-show-inherited"
              className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 cursor-pointer"
            >
              Show inherited
            </Label>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOverrideTarget(null);
            setIsAddSecretOpen(true);
          }}
          className="h-[28px] px-3 bg-grimoire text-black hover:bg-grimoire/90 font-bold uppercase tracking-tight text-[10px] transition-colors"
        >
          + Add Secret
        </button>
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
        {secretsLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-[10px] uppercase font-bold tracking-widest font-mono text-zinc-700">Syncing Secrets...</span>
          </div>
        ) : filteredSecrets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full opacity-50">
            <Lock className="w-12 h-12 mb-4 text-muted-foreground" />
            <h3 className="text-lg font-bold tracking-tight uppercase">Secrets vault is empty</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">No secrets defined</p>
          </div>
        ) : (
          <div className="p-0">
            <Table>
              <TableHeader className="bg-zinc-900/50">
                <TableRow className="hover:bg-transparent border-zinc-800 h-10">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Secret Information</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 hidden lg:table-cell">Presence</TableHead>
                  <TableHead className="text-right text-[10px] uppercase font-bold tracking-widest text-zinc-500 px-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSecrets.map((secret) => {
                  const isGlobal = secret.source === 'global';
                  const isExpanded =
                    expandedSecret?.name === secret.name &&
                    expandedSecret?.source === secret.source;
                  const resolvedMetadata: EffectiveSecret =
                    isExpanded && expandedSecretDetail?.name === secret.name
                      ? { ...secret, ...expandedSecretDetail }
                      : secret;

                  return (
                    <React.Fragment key={`${secret.source}:::${secret.name}`}>
                      <TableRow
                        className={cn(
                          "cursor-pointer border-zinc-900/50 transition-colors h-14 group",
                          isGlobal && "bg-global/[0.03] hover:bg-global/[0.06]",
                          !isGlobal && (isExpanded ? "bg-zinc-900/40" : "hover:bg-zinc-900/20")
                        )}
                        onClick={() =>
                          setExpandedSecret(
                            isExpanded ? null : { name: secret.name, source: secret.source }
                          )
                        }
                      >
                        <TableCell className="text-center px-2">
                          {isExpanded ? (
                            <ChevronUp className={cn("w-3 h-3", isGlobal ? "text-global" : "text-grimoire")} />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-zinc-700" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={cn(
                                  "font-mono text-sm font-medium transition-colors",
                                  isGlobal
                                    ? "text-zinc-300"
                                    : isExpanded
                                      ? "text-grimoire"
                                      : "text-zinc-200"
                                )}
                              >
                                {secret.name}
                              </span>
                              {isGlobal && (
                                <Badge
                                  variant="outline"
                                  className="border-global/40 bg-global/10 text-global text-[9px] font-bold uppercase tracking-widest gap-1"
                                >
                                  <Globe className="w-2.5 h-2.5" />
                                  Global
                                </Badge>
                              )}
                              {!isGlobal && secret.overridesGlobal && (
                                <Badge
                                  variant="outline"
                                  title="Application secret takes precedence over the inherited global secret"
                                  className="border-global/30 bg-global/5 text-global text-[9px] font-mono cursor-help"
                                >
                                  overrides global
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-zinc-600 truncate max-w-md">{secret.description || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex gap-1">
                            {safeEnvs.map(env => {
                              const status = getSecretStatus(secret, env.slug);
                              if (status === SecretStatus.MISSING) return null;
                              return (
                                <div
                                  key={env.slug}
                                  className={cn(
                                    "px-1.5 py-0.5 border text-[9px] font-bold font-mono uppercase tracking-tighter",
                                    isGlobal ? "border-global/30 text-global/80" : "border-zinc-800 text-zinc-500"
                                  )}
                                >
                                  {env.slug.substring(0, 3)}
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right px-6">
                          {isGlobal ? (
                            <div
                              className="flex justify-end items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setOverrideTarget({
                                    name: secret.name,
                                    description: secret.description || '',
                                  });
                                  setIsAddSecretOpen(true);
                                }}
                                className="px-2 py-0.5 border border-grimoire/30 text-[10px] font-bold uppercase tracking-widest text-grimoire hover:bg-grimoire/10 transition-colors inline-flex items-center gap-1"
                              >
                                <ArrowUpRight className="w-3 h-3" />
                                Override
                              </button>
                              <button
                                type="button"
                                onClick={() => navigate(globalPath('secrets', secret.name))}
                                className="px-2 py-0.5 border border-global/30 text-[10px] font-bold uppercase tracking-widest text-global hover:bg-global/10 transition-colors inline-flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View in Global
                              </button>
                            </div>
                          ) : (
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
                                    setExpandedSecret(
                                      isExpanded ? null : { name: secret.name, source: secret.source }
                                    );
                                  }}
                                >
                                  {isExpanded ? 'Collapse' : 'Show Details'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive text-[10px] uppercase font-bold tracking-widest p-2 hover:bg-destructive/10 cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingSecret(secret);
                                  }}
                                >
                                  Delete Secret
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-[#080809] border-zinc-900 hover:bg-[#080809]">
                          <TableCell colSpan={4} className="p-0">
                            <div className={cn("p-4 md:p-8 border-l-2", isGlobal ? "border-global" : "border-grimoire")}>
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-12">
                                <div>
                                  <h4 className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-600 mb-6 flex items-center gap-2">
                                    <div className={cn("w-1 h-3", isGlobal ? "bg-global" : "bg-grimoire")} />
                                    Secret Metadata
                                  </h4>
                                  <div className="grid grid-cols-2 gap-4 md:gap-6 bg-black/20 p-4 md:p-6 border border-zinc-900">
                                    <div className="col-span-2">
                                      <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Identifier</p>
                                      <p className="font-mono text-base text-zinc-200 tracking-tight break-all">{secret.name}</p>
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Created</p>
                                      <p className="font-mono text-xs text-zinc-400">{formatDate(resolvedMetadata.createdAt)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Audit ID</p>
                                      <p className="font-mono text-xs text-zinc-400">#{resolvedMetadata.id?.substring(0, 8) || 'N/A'}</p>
                                    </div>
                                    <div className="col-span-2">
                                      <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Description</p>
                                      <p className="text-sm text-zinc-400 leading-relaxed">{resolvedMetadata.description || '—'}</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-6">
                                  <h4 className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-600 flex items-center gap-2">
                                    <div className="w-1 h-3 bg-zinc-800" />
                                    Environment Logic
                                    {(expandedSecretLoading || expandedVersionsLoading) && (
                                      <Loader2 className={cn("w-3 h-3 animate-spin ml-1", isGlobal ? "text-global" : "text-grimoire")} />
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
                                        {safeEnvs.map(env => {
                                          const { version: latestVersion, resolvedEnvSlug } = resolveSecretVersion(secret, env.slug);
                                          const status = computeStatusFromVersion(latestVersion);
                                          return (
                                            <TableRow key={env.slug} className="border-zinc-900 hover:bg-zinc-900/30 h-12 transition-colors">
                                              <td className="px-4 font-mono text-[11px] font-bold">{env.name}</td>
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
                                                    onClick={() =>
                                                      setViewingVersions({
                                                        secretName: secret.name,
                                                        envSlug: resolvedEnvSlug,
                                                        scope: isGlobal ? 'global' : { appSlug },
                                                      })
                                                    }
                                                    className={cn(
                                                      "inline-flex items-center gap-1 text-zinc-400 transition-colors",
                                                      isGlobal ? "hover:text-global" : "hover:text-grimoire"
                                                    )}
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
                                                {isGlobal ? (
                                                  <button
                                                    type="button"
                                                    className="text-[10px] font-bold uppercase tracking-widest text-grimoire hover:text-grimoire/80 transition-colors"
                                                    onClick={() => {
                                                      setOverrideTarget({
                                                        name: secret.name,
                                                        description: secret.description || '',
                                                      });
                                                      setIsAddSecretOpen(true);
                                                    }}
                                                  >
                                                    OVERRIDE
                                                  </button>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-grimoire transition-colors"
                                                    onClick={() => setEditingValue({ secretName: secret.name, envSlug: env.slug })}
                                                  >
                                                    {status === SecretStatus.MISSING ? '+ SET' : 'UPDATE'}
                                                  </button>
                                                )}
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
          </div>
        )}
      </div>

      <AddSecretModal
        scope={{ appSlug }}
        initialName={overrideTarget?.name}
        initialDescription={overrideTarget?.description}
        open={isAddSecretOpen}
        onOpenChange={(open) => {
          setIsAddSecretOpen(open);
          if (!open) setOverrideTarget(null);
        }}
      />

      {editingValue && (
        <EditSecretValueModal
          scope={{ appSlug }}
          secretName={editingValue.secretName}
          envSlug={editingValue.envSlug}
          open={!!editingValue}
          onOpenChange={(open) => !open && setEditingValue(null)}
        />
      )}

      {viewingVersions && (
        <SecretVersionsModal
          scope={viewingVersions.scope}
          secretName={viewingVersions.secretName}
          envSlug={viewingVersions.envSlug}
          open={!!viewingVersions}
          onOpenChange={(open) => !open && setViewingVersions(null)}
        />
      )}

      <ConfirmationModal
        open={!!deletingSecret}
        onOpenChange={(open) => !open && setDeletingSecret(null)}
        onConfirm={handleDeleteSecret}
        title="Delete Secret"
        description={
          deletingSecret?.overridesGlobal
            ? `Are you sure you want to delete the app-level override for "${deletingSecret?.name}"? The inherited global secret will become active again.`
            : `Are you sure you want to delete the secret "${deletingSecret?.name}"? This will delete all values in all environments. This action cannot be undone.`
        }
        confirmText="Permanently Delete"
        variant="destructive"
      />
    </div>
  );
};
