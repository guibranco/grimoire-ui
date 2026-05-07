import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/lib/api';
import { Secret, SecretStatus, Environment } from '@/src/types/api';
import { 
  Plus, 
  Search, 
  Lock, 
  Eye, 
  EyeOff, 
  Calendar, 
  Clock, 
  AlertCircle,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  Edit2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddSecretModal } from './AddSecretModal';
import { EditSecretValueModal } from './EditSecretValueModal';
import { ConfirmationModal } from '@/src/components/shared/ConfirmationModal';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export const GrimoireTab: React.FC<{ appSlug: string }> = ({ appSlug }) => {
  const [search, setSearch] = useState('');
  const [isAddSecretOpen, setIsAddSecretOpen] = useState(false);
  const [expandedSecret, setExpandedSecret] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<{ secretName: string, envSlug: string } | null>(null);
  const [deletingSecret, setDeletingSecret] = useState<string | null>(null);
  
  const queryClient = useQueryClient();

  const { data: secrets, isLoading: secretsLoading } = useQuery({
    queryKey: ['secrets', appSlug],
    queryFn: async () => {
      const res = await api.get<Secret[]>(`/applications/${appSlug}/secrets`);
      return res.data;
    },
  });

  const { data: envs } = useQuery({
    queryKey: ['environments', appSlug],
    queryFn: async () => {
      const res = await api.get<Environment[]>(`/applications/${appSlug}/environments`);
      return res.data;
    },
  });

  const filteredSecrets = secrets?.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
  );

  const getSecretStatus = (secret: Secret, envSlug: string): SecretStatus => {
    const value = secret.values.find(v => v.environmentSlug === envSlug);
    if (!value) return SecretStatus.MISSING;
    if (!value.isEnabled) return SecretStatus.DISABLED;
    
    const now = new Date();
    if (value.expiresAt && new Date(value.expiresAt) < now) return SecretStatus.EXPIRED;
    if (value.notBefore && new Date(value.notBefore) > now) return SecretStatus.PENDING;
    
    return SecretStatus.ENABLED;
  };

  const StatusChip = ({ status }: { status: SecretStatus }) => {
    switch (status) {
      case SecretStatus.ENABLED:
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] uppercase font-bold tracking-widest gap-1 p-1 pr-2">
            <Lock className="w-2.5 h-2.5" /> Enabled
          </Badge>
        );
      case SecretStatus.DISABLED:
        return (
          <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20 text-[10px] uppercase font-bold tracking-widest p-1 px-2">
            Disabled
          </Badge>
        );
      case SecretStatus.EXPIRED:
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px] uppercase font-bold tracking-widest gap-1 p-1 pr-2">
            <Clock className="w-2.5 h-2.5" /> Expired
          </Badge>
        );
      case SecretStatus.PENDING:
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] uppercase font-bold tracking-widest gap-1 p-1 pr-2">
            <AlertCircle className="w-2.5 h-2.5" /> Pending
          </Badge>
        );
      case SecretStatus.MISSING:
        return (
          <span className="text-muted-foreground/30 font-mono text-lg leading-none">−</span>
        );
      default:
        return null;
    }
  };

  const handleDeleteSecret = async () => {
    if (!deletingSecret) return;
    try {
      await api.delete(`/applications/${appSlug}/secrets/${deletingSecret}`);
      queryClient.invalidateQueries({ queryKey: ['secrets', appSlug] });
      toast.success('Secret deleted');
    } catch (err) {
      toast.error('Failed to delete secret');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="h-[48px] border-b border-border bg-[#121214] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest whitespace-nowrap">
            {filteredSecrets?.length || 0} Secrets Defined
          </span>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-zinc-600" />
            <input 
              placeholder="Search..." 
              className="w-full h-[28px] pl-8 pr-3 bg-zinc-900 border border-border text-xs focus:border-grimoire transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <button 
          onClick={() => setIsAddSecretOpen(true)}
          className="h-[28px] px-3 bg-grimoire text-black hover:bg-grimoire/90 font-bold uppercase tracking-tight text-[10px] transition-colors"
        >
          + Add Secret
        </button>
      </div>

      <div className="flex-1 overflow-auto scroll-area">
        {secretsLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-[10px] uppercase font-bold tracking-widest font-mono text-zinc-700">Syncing Grimoire...</span>
          </div>
        ) : filteredSecrets?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full opacity-50">
            <Lock className="w-12 h-12 mb-4 text-muted-foreground" />
            <h3 className="text-lg font-bold tracking-tight uppercase">Grimoire is empty</h3>
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
                {filteredSecrets?.map((secret) => {
                  const isExpanded = expandedSecret === secret.name;
                  return (
                    <React.Fragment key={secret.name}>
                      <TableRow 
                        className={cn(
                          "cursor-pointer border-zinc-900/50 transition-colors h-14 group", 
                          isExpanded ? "bg-zinc-900/40" : "hover:bg-zinc-900/20"
                        )}
                        onClick={() => setExpandedSecret(isExpanded ? null : secret.name)}
                      >
                        <TableCell className="text-center px-2">
                          {isExpanded ? <ChevronUp className="w-3 h-3 text-grimoire" /> : <ChevronDown className="w-3 h-3 text-zinc-700" />}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className={cn("font-mono text-sm font-medium transition-colors", isExpanded ? "text-grimoire" : "text-zinc-200")}>
                              {secret.name}
                            </span>
                            <span className="text-[11px] text-zinc-600 truncate max-w-md">{secret.description}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex gap-1">
                            {envs?.map(env => {
                              const status = getSecretStatus(secret, env.slug);
                              if (status === SecretStatus.MISSING) return null;
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
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button className="h-8 w-8 inline-flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-[#0A0A0B] border-border p-0">
                              <DropdownMenuItem 
                                className="text-[10px] uppercase font-bold tracking-widest p-2 hover:bg-zinc-900 cursor-pointer"
                                onClick={() => setExpandedSecret(isExpanded ? null : secret.name)}
                              >
                                {isExpanded ? 'Collapse' : 'Show Details'}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive text-[10px] uppercase font-bold tracking-widest p-2 hover:bg-destructive/10 cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setDeletingSecret(secret.name); }}
                              >
                                Delete Secret
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-[#080809] border-zinc-900 hover:bg-[#080809]">
                          <TableCell colSpan={4} className="p-0">
                            <div className="p-8 border-l-2 border-grimoire">
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                                <div>
                                  <h4 className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-600 mb-6 flex items-center gap-2">
                                    <div className="w-1 h-3 bg-grimoire" />
                                    Secret Metadata
                                  </h4>
                                  <div className="grid grid-cols-2 gap-6 bg-black/20 p-6 border border-zinc-900">
                                    <div className="col-span-2">
                                      <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Identifier</p>
                                      <p className="font-mono text-base text-zinc-200 tracking-tight">{secret.name}</p>
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Created</p>
                                      <p className="font-mono text-xs text-zinc-400">{format(new Date(secret.createdAt), 'yyyy-MM-dd')}</p>
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Audit ID</p>
                                      <p className="font-mono text-xs text-zinc-400">#{(secret as any).id?.substring(0, 8) || 'N/A'}</p>
                                    </div>
                                    <div className="col-span-2">
                                      <p className="text-[11px] font-bold text-zinc-700 uppercase mb-1">Description</p>
                                      <p className="text-sm text-zinc-400 leading-relaxed">{secret.description}</p>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="space-y-6">
                                  <h4 className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-600 flex items-center gap-2">
                                    <div className="w-1 h-3 bg-zinc-800" />
                                    Environment Logic
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
                                        {envs?.map(env => {
                                          const status = getSecretStatus(secret, env.slug);
                                          const value = secret.values.find(v => v.environmentSlug === env.slug);
                                          return (
                                            <TableRow key={env.slug} className="border-zinc-900 hover:bg-zinc-900/30 h-12 transition-colors">
                                              <td className="px-4 font-mono text-[11px] font-bold">{env.name}</td>
                                              <td className="px-4">
                                                <div className="flex items-center gap-2">
                                                  <div className={cn(
                                                    "w-1.5 h-1.5 rounded-full",
                                                    status === SecretStatus.ENABLED ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" :
                                                    status === SecretStatus.DISABLED ? "bg-zinc-700" :
                                                    status === SecretStatus.EXPIRED ? "bg-red-500" : "bg-amber-500"
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
                                              <td className="px-4 font-mono text-[10px] text-zinc-600">v{value?.version || 1}</td>
                                              <td className="text-right pr-4">
                                                <button 
                                                  className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-grimoire transition-colors"
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
          </div>
        )}
      </div>

      <AddSecretModal 
        appSlug={appSlug} 
        open={isAddSecretOpen} 
        onOpenChange={setIsAddSecretOpen} 
      />

      {editingValue && (
        <EditSecretValueModal 
          appSlug={appSlug}
          secretName={editingValue.secretName}
          envSlug={editingValue.envSlug}
          open={!!editingValue}
          onOpenChange={(open) => !open && setEditingValue(null)}
        />
      )}

      <ConfirmationModal 
        open={!!deletingSecret}
        onOpenChange={(open) => !open && setDeletingSecret(null)}
        onConfirm={handleDeleteSecret}
        title="Delete Secret"
        description={`Are you sure you want to delete the secret "${deletingSecret}"? This will delete all values in all environments. This action cannot be undone.`}
        confirmText="Permanently Delete"
        variant="destructive"
      />
    </div>
  );
};
