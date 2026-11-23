import React, { useMemo, useState } from 'react';
import { Info, KeyRound, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { RelativeTime } from '@/components/dashboard/parts';
import { APIKeyRevealModal } from '@/components/modals/APIKeyRevealModal';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { apiErrorMessage } from '@/lib/errors';
import { STATUS_LABELS, TOKEN_PREFIX, environmentsLabel, scopeLabel, sortTokens } from '@/lib/accessTokens';
import { cn } from '@/lib/utils';
import type { AccessToken, AccessTokenStatus, Environment } from '@/types/api';
import { CreateAccessTokenModal } from './CreateAccessTokenModal';
import { useAccessTokens, useRevokeAccessToken } from './useAccessTokens';

const STATUS_CLASSES: Record<AccessTokenStatus, string> = {
  active: 'border-emerald-500/40 text-emerald-400',
  expired: 'border-amber-500/40 text-amber-400',
  revoked: 'border-zinc-700 text-zinc-500',
};

interface Props {
  appSlug: string;
  envs: Environment[];
  /** Opens the header's "Rotate key" confirmation for the legacy API key. */
  onRotateKey: () => void;
}

/**
 * Route content for `/apps/:app/:env/tokens` (guibranco/grimoire-ui#444): the application's
 * Consumer API access tokens, and a note on the legacy API key.
 */
export const AccessTokensTab: React.FC<Props> = ({ appSlug, envs, onRotateKey }) => {
  const { data, isLoading, isError, refetch } = useAccessTokens(appSlug);
  const revoke = useRevokeAccessToken(appSlug);
  const [creating, setCreating] = useState(false);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<AccessToken | null>(null);
  const tokens = useMemo(() => sortTokens(Array.isArray(data) ? data : []), [data]);

  const confirmRevoke = async () => {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.id);
      toast.success(`Revoked ${revoking.name}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to revoke the access token'));
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <section
        aria-label="Legacy API key"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-zinc-800 bg-zinc-950/60 px-4 py-3"
      >
        <div className="flex items-start gap-3 min-w-0">
          <Info className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-zinc-400">
            <span className="mr-2 px-1.5 py-0.5 border border-zinc-700 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Legacy
            </span>
            <span>
              The application API key reads every environment, and rotating it breaks every consumer at once.
              Prefer an access token per consumer, limited to the environments and data it needs.
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onRotateKey}
          className="h-8 px-3 border border-border text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-zinc-800 shrink-0 self-start sm:self-auto"
        >
          Rotate key
        </button>
      </section>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Access tokens</h3>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 h-8 px-3 bg-grimoire text-xs font-bold text-black hover:bg-grimoire/90"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New token
        </button>
      </div>

      {isLoading && <p className="text-xs text-zinc-500">Loading access tokens…</p>}

      {isError && (
        <div role="alert" className="flex items-center gap-3 text-xs text-red-400">
          <span>Couldn't load the access tokens.</span>
          <button type="button" onClick={() => void refetch()} className="inline-flex items-center gap-1 underline">
            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && tokens.length === 0 && (
        <div className="border border-dashed border-zinc-800 px-6 py-10 text-center">
          <KeyRound className="w-6 h-6 text-zinc-600 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-zinc-300">No access tokens yet</p>
          <p className="text-xs text-zinc-500 mt-1">
            Create one per consumer, so each can be limited, expired and revoked on its own.
          </p>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="border border-zinc-800 overflow-x-auto">
          <table className="w-full text-left" aria-label="Access tokens">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-widest text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-bold">Name</th>
                <th className="px-3 py-2 font-bold">Environments</th>
                <th className="px-3 py-2 font-bold hidden md:table-cell">Scopes</th>
                <th className="px-3 py-2 font-bold hidden lg:table-cell">Expires</th>
                <th className="px-3 py-2 font-bold hidden lg:table-cell">Last used</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr
                  key={token.id}
                  className={cn('border-t border-zinc-900 text-xs', token.status !== 'active' && 'text-zinc-500')}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-200">{token.name}</div>
                    <div className="font-mono text-[11px] text-zinc-500">
                      {TOKEN_PREFIX}
                      {token.prefix}…
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{environmentsLabel(token.environments)}</td>
                  <td className="px-3 py-2 hidden md:table-cell">{token.scopes.map(scopeLabel).join(', ')}</td>
                  <td className="px-3 py-2 hidden lg:table-cell whitespace-nowrap">
                    {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell whitespace-nowrap">
                    <RelativeTime value={token.lastUsedAt} />
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 border text-[10px] font-bold uppercase tracking-widest',
                        STATUS_CLASSES[token.status]
                      )}
                    >
                      {STATUS_LABELS[token.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {token.status !== 'revoked' && (
                      <button
                        type="button"
                        onClick={() => setRevoking(token)}
                        aria-label={`Revoke ${token.name}`}
                        className="h-7 px-2 border border-destructive/30 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateAccessTokenModal
        appSlug={appSlug}
        envs={envs}
        takenNames={tokens.map((t) => t.name)}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(created) => setPlainToken(created.plainToken)}
      />

      <APIKeyRevealModal
        apiKey={plainToken}
        onClose={() => setPlainToken(null)}
        title="Access token created"
        description="Send it in the X-Api-Key header. It can only read the environments and data you chose."
        secretLabel="access token"
      />

      <ConfirmationModal
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke access token"
        description={`Revoke ${revoking?.name ?? 'this token'}? Anything using it stops working at once. This can't be undone.`}
        onConfirm={confirmRevoke}
        confirmText="Revoke"
        variant="destructive"
        confirmationWord="REVOKE"
      />
    </div>
  );
};
