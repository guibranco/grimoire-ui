import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { SecretVersion } from '@/types/api';
import { History, Loader2, ChevronRight, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { SecretModalScope } from './EditSecretValueModal';

interface SecretVersionsModalProps {
  appSlug?: string;
  scope?: SecretModalScope;
  secretName: string;
  envSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SecretVersionsModal: React.FC<SecretVersionsModalProps> = ({
  appSlug,
  scope,
  secretName,
  envSlug,
  open,
  onOpenChange,
}) => {
  const resolvedScope: SecretModalScope = scope ?? { appSlug: appSlug || '' };
  const isGlobal = resolvedScope === 'global';
  const targetAppSlug = isGlobal ? '' : resolvedScope.appSlug;

  const { data: versions, isLoading } = useQuery({
    queryKey: isGlobal
      ? ['global-secret-versions', secretName, envSlug]
      : ['secret-versions', targetAppSlug, secretName, envSlug],
    queryFn: async () => {
      const endpoint = isGlobal
        ? `/global/secrets/${encodeURIComponent(secretName)}/versions/${encodeURIComponent(envSlug)}`
        : `/applications/${targetAppSlug}/secrets/${encodeURIComponent(secretName)}/versions/${encodeURIComponent(envSlug)}`;
      const res = await api.get<SecretVersion[]>(endpoint);
      return res.data;
    },
    enabled: open && (isGlobal || !!targetAppSlug) && !!secretName && !!envSlug,
  });

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : format(d, 'yyyy-MM-dd HH:mm');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-card border-2 border-border p-0 gap-0 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-border">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 flex items-center justify-center shrink-0 border ${isGlobal ? 'bg-global/10 border-global text-global' : 'bg-grimoire/10 border-grimoire text-grimoire'}`}>
                <History className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight uppercase">
                  {isGlobal ? 'Global Secret Version History' : 'Secret Version History'}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                  <span>{secretName}</span>
                  <ChevronRight className="w-3 h-3" />
                  {envSlug === '*' ? (
                    <span className="inline-flex items-center gap-1 text-global">
                      <Globe className="w-3 h-3" />
                      All environments
                    </span>
                  ) : (
                    <span>{envSlug}</span>
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className={`w-6 h-6 animate-spin ${isGlobal ? 'text-global' : 'text-grimoire'}`} />
              <span className="text-[10px] font-mono uppercase tracking-widest">Loading Versions...</span>
            </div>
          ) : !versions || versions.length === 0 ? (
            <div className="py-10 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
              No version history found for this environment.
            </div>
          ) : (
            <div className="border border-border">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-9">Version</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-9">Status</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-9">Not Before</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-9">Expires At</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-9">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((ver) => (
                    <TableRow key={ver.version} className="border-border hover:bg-muted/20">
                      <TableCell className={`font-mono text-xs font-bold ${isGlobal ? 'text-global' : 'text-grimoire'}`}>v{ver.version}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            ver.isEnabled
                              ? 'text-[9px] uppercase font-bold tracking-widest bg-green-500/10 text-green-500 border-green-500/20'
                              : 'text-[9px] uppercase font-bold tracking-widest bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                          }
                        >
                          {ver.isEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-zinc-400">{formatTimestamp(ver.notBefore)}</TableCell>
                      <TableCell className="font-mono text-[11px] text-zinc-400">{formatTimestamp(ver.expiresAt)}</TableCell>
                      <TableCell className="font-mono text-[11px] text-zinc-500">
                        {formatTimestamp(ver.updatedAt || ver.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 bg-muted/30 p-4 border-t border-border mt-0 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="uppercase font-bold tracking-widest text-[10px] h-9"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
