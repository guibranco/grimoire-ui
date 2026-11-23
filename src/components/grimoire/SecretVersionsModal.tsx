import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { api, toApiDateTime } from '@/lib/api';
import { SecretVersion, SecretVersionStatus, UpdateSecretVersionRequest } from '@/types/api';
import { AlertTriangle, CalendarClock, Check, ChevronRight, Globe, History, Loader2, Power, RotateCcw, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { MAX_GRACE_DAYS, openEndedOlderVersions, STATUS_LABELS, withStatus } from '@/lib/secretVersions';
import { cn } from '@/lib/utils';
import { SecretModalScope } from './EditSecretValueModal';
import { apiErrorMessage } from '@/lib/errors';

interface SecretVersionsModalProps {
  appSlug?: string;
  scope?: SecretModalScope;
  secretName: string;
  envSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_STYLES: Record<SecretVersionStatus, string> = {
  current: 'bg-green-500/10 text-green-500 border-green-500/30',
  valid: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  scheduled: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  expired: 'bg-red-500/10 text-red-400 border-red-500/20',
  disabled: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

const statusCode = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status;

/** `yyyy-MM-dd` of an ISO instant (UTC), matching what `toApiDateTime` sends back. */
const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

interface PendingForce {
  version: number;
  body: UpdateSecretVersionRequest;
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
  const envSuffix = envSlug === '*' ? '' : ` in ${envSlug}`;
  const queryClient = useQueryClient();
  const [busyVersion, setBusyVersion] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ version: number; notBefore: string; expiresAt: string } | null>(null);
  const [pendingForce, setPendingForce] = useState<PendingForce | null>(null);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [graceDays, setGraceDays] = useState(7);

  const base = isGlobal
    ? `/global/secrets/${encodeURIComponent(secretName)}/versions/${encodeURIComponent(envSlug)}`
    : `/applications/${targetAppSlug}/secrets/${encodeURIComponent(secretName)}/versions/${encodeURIComponent(envSlug)}`;
  const versionsKey = isGlobal
    ? ['global-secret-versions', secretName, envSlug]
    : ['secret-versions', targetAppSlug, secretName, envSlug];

  const { data, isLoading } = useQuery({
    queryKey: versionsKey,
    queryFn: async () => (await api.get<SecretVersion[]>(base)).data,
    enabled: open && (isGlobal || !!targetAppSlug) && !!secretName && !!envSlug,
  });
  const versions = Array.isArray(data) ? withStatus(data) : [];
  const openOlder = openEndedOlderVersions(versions);
  const hasCurrent = versions.some((v) => v.isCurrent);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: versionsKey });
    queryClient.invalidateQueries({ queryKey: isGlobal ? ['global-secrets'] : ['secrets', targetAppSlug] });
    queryClient.invalidateQueries({ queryKey: ['effective-secrets'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  /** Copies an older version's value into a new current version (the value stays hidden). */
  const rollbackTo = async (version: number) => {
    setBusyVersion(version);
    try {
      const res = await api.post<SecretVersion>(`${base}/${version}/rollback`);
      if (res.status >= 400) throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      toast.success(`v${version} restored as v${res.data?.version ?? 'new'}`);
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to roll back'));
    } finally {
      setBusyVersion(null);
    }
  };

  /** PATCH one version. Returns `'conflict'` when the API refuses to leave no valid version. */
  const patch = async (version: number, body: UpdateSecretVersionRequest, force = false) => {
    const res = await api.patch<SecretVersion>(`${base}/${version}`, body, force ? { params: { force: true } } : undefined);
    // The demo adapter resolves error statuses instead of rejecting like axios does.
    if (res.status >= 400) throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
    return res.data;
  };

  const update = async (version: number, body: UpdateSecretVersionRequest, success: string, force = false) => {
    setBusyVersion(version);
    try {
      await patch(version, body, force);
      toast.success(success);
      setEditing(null);
      refresh();
    } catch (err) {
      if (statusCode(err) === 409 && !force) {
        setPendingForce({ version, body });
      } else if (statusCode(err) === 400) {
        toast.error(apiErrorMessage(err, 'Expiry must be after the start date'));
      } else {
        toast.error(apiErrorMessage(err, 'Failed to update version'));
      }
    } finally {
      setBusyVersion(null);
    }
  };

  const expireOlder = async () => {
    const expiresAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000).toISOString();
    setBusyVersion(-1);
    try {
      await Promise.all(openOlder.map((v) => patch(v.version, { expiresAt })));
      toast.success(`Older versions expire in ${graceDays} day${graceDays === 1 ? '' : 's'}`);
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to expire older versions'));
    } finally {
      setBusyVersion(null);
    }
  };

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : format(d, 'yyyy-MM-dd HH:mm');
  };

  const accent = isGlobal ? 'text-global' : 'text-grimoire';
  const head = 'text-[10px] uppercase font-bold tracking-widest text-zinc-500 h-9';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl bg-card border-2 border-border p-0 gap-0 shadow-2xl flex flex-col max-h-[85vh]">
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

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {hasCurrent && openOlder.length > 0 && (
            <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border border-amber-500/30 bg-amber-500/5 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-zinc-300">
                {openOlder.length === 1 ? '1 older version is' : `${openOlder.length} older versions are`} still accepted with no expiry
                ({openOlder.map((v) => `v${v.version}`).join(', ')}). Old values keep working until they expire or are disabled.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-500">
                  Expire in{' '}
                  <input
                    type="number"
                    min={0}
                    max={MAX_GRACE_DAYS}
                    value={graceDays}
                    onChange={(e) => setGraceDays(Math.max(0, Math.min(MAX_GRACE_DAYS, Number(e.target.value) || 0)))}
                    className="w-14 h-7 bg-zinc-950 border border-border px-1 text-xs text-zinc-200"
                    aria-label="Days until older versions expire"
                  />{' '}
                  days
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={busyVersion !== null}
                  onClick={() => void expireOlder()}
                  className="h-7 text-[10px] uppercase font-bold tracking-widest bg-amber-500 text-black hover:bg-amber-400"
                >
                  {busyVersion === -1 ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Expire older'}
                </Button>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className={`w-6 h-6 animate-spin ${accent}`} />
              <span className="text-[10px] font-mono uppercase tracking-widest">Loading Versions...</span>
            </div>
          )}
          {!isLoading && versions.length === 0 && (
            <div className="py-10 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
              No version history found for this environment.
            </div>
          )}
          {!isLoading && versions.length > 0 && (
            <div className="border border-border overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className={head}>Version</TableHead>
                    <TableHead className={head}>Status</TableHead>
                    <TableHead className={head}>Not Before</TableHead>
                    <TableHead className={head}>Expires At</TableHead>
                    <TableHead className={head}>Created</TableHead>
                    <TableHead className={cn(head, 'text-right')}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((ver) => {
                    const status = ver.status ?? 'valid';
                    const servable = status === 'current' || status === 'valid';
                    const isEditing = editing?.version === ver.version;
                    const busy = busyVersion === ver.version;
                    return (
                      <TableRow
                        key={ver.version}
                        data-version={ver.version}
                        className={cn('border-border hover:bg-muted/20', !servable && 'opacity-60')}
                      >
                        <TableCell className={`font-mono text-xs font-bold ${accent}`}>
                          v{ver.version}
                          {ver.isCurrent && (
                            <span className="ml-2 px-1 py-px border border-green-500/40 text-green-500 text-[8px] uppercase tracking-widest align-middle">
                              Serving
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[9px] uppercase font-bold tracking-widest', STATUS_STYLES[status])}>
                            {STATUS_LABELS[status]}
                          </Badge>
                        </TableCell>
                        {isEditing ? (
                          <>
                            <TableCell>
                              <input
                                type="date"
                                aria-label={`Not before for v${ver.version}`}
                                value={editing.notBefore}
                                onChange={(e) => setEditing({ ...editing, notBefore: e.target.value })}
                                className="h-7 bg-zinc-950 border border-border px-1 text-[11px] font-mono text-zinc-200"
                              />
                            </TableCell>
                            <TableCell>
                              <input
                                type="date"
                                aria-label={`Expires at for v${ver.version}`}
                                value={editing.expiresAt}
                                onChange={(e) => setEditing({ ...editing, expiresAt: e.target.value })}
                                className="h-7 bg-zinc-950 border border-border px-1 text-[11px] font-mono text-zinc-200"
                              />
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-mono text-[11px] text-zinc-400">{formatTimestamp(ver.notBefore)}</TableCell>
                            <TableCell className="font-mono text-[11px] text-zinc-400">{formatTimestamp(ver.expiresAt)}</TableCell>
                          </>
                        )}
                        <TableCell className="font-mono text-[11px] text-zinc-500">{formatTimestamp(ver.createdAt)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {isEditing ? (
                            <span className="inline-flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Save dates for v${ver.version}`}
                                disabled={busy}
                                onClick={() =>
                                  void update(
                                    ver.version,
                                    {
                                      ...(editing.notBefore ? { notBefore: toApiDateTime(editing.notBefore) } : { clearNotBefore: true }),
                                      ...(editing.expiresAt ? { expiresAt: toApiDateTime(editing.expiresAt) } : { clearExpiresAt: true }),
                                    },
                                    `Dates updated for v${ver.version}`
                                  )
                                }
                                className="h-7 px-2"
                              >
                                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5 text-green-500" />}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label="Cancel editing dates"
                                onClick={() => setEditing(null)}
                                className="h-7 px-2"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Edit dates for v${ver.version}`}
                                title="Set start / expiry"
                                disabled={busyVersion !== null}
                                onClick={() =>
                                  setEditing({
                                    version: ver.version,
                                    notBefore: toDateInput(ver.notBefore),
                                    expiresAt: toDateInput(ver.expiresAt),
                                  })
                                }
                                className="h-7 px-2"
                              >
                                <CalendarClock className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busyVersion !== null}
                                onClick={() =>
                                  void update(
                                    ver.version,
                                    { isEnabled: !ver.isEnabled },
                                    `v${ver.version} ${ver.isEnabled ? 'disabled' : 'enabled'}`
                                  )
                                }
                                className="h-7 px-2 text-[10px] uppercase font-bold tracking-widest gap-1"
                              >
                                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                                {ver.isEnabled ? 'Disable' : 'Enable'}
                              </Button>
                              {!ver.isCurrent && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyVersion !== null}
                                  aria-label={`Roll back to v${ver.version}`}
                                  title="Copy this version's value into a new current version"
                                  onClick={() => setRollingBack(ver.version)}
                                  className="h-7 px-2 text-[10px] uppercase font-bold tracking-widest gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Roll back
                                </Button>
                              )}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-[10px] text-zinc-500">
            Consumers get the newest version that is enabled and inside its start/expiry window. Values can't be edited:
            add a new value to rotate.
          </p>
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

      <ConfirmationModal
        open={!!pendingForce}
        onOpenChange={(o) => !o && setPendingForce(null)}
        title="Leave no valid version?"
        description={`This change would leave ${secretName} with no valid version${envSuffix}, so consumers reading it will get "not found" until a new value is added. Apply it anyway?`}
        confirmText="Apply anyway"
        onConfirm={async () => {
          if (!pendingForce) return;
          const { version, body } = pendingForce;
          setPendingForce(null);
          await update(version, body, `v${version} updated`, true);
        }}
      />

      <ConfirmationModal
        open={rollingBack !== null}
        onOpenChange={(o) => !o && setRollingBack(null)}
        title={`Roll back to v${rollingBack ?? ''}?`}
        description={`v${rollingBack ?? ''}'s value is copied into a new version of ${secretName}${envSuffix}, which consumers get from now on. Older versions are left as they are; the value is never shown.`}
        confirmText="Roll back"
        onConfirm={async () => {
          const version = rollingBack;
          setRollingBack(null);
          if (version !== null) await rollbackTo(version);
        }}
      />
    </Dialog>
  );
};
