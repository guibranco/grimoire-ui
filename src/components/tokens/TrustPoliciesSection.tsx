import React, { useState } from 'react';
import { GitBranch, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { RelativeTime } from '@/components/dashboard/parts';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { apiErrorMessage } from '@/lib/errors';
import { environmentsLabel, scopeLabel } from '@/lib/accessTokens';
import { matchSummary } from '@/lib/trustPolicies';
import type { Environment, TrustPolicy } from '@/types/api';
import { TrustPolicyFormModal } from './TrustPolicyFormModal';
import { useDeleteTrustPolicy, useTrustPolicies } from './useTrustPolicies';

interface Props {
  appSlug: string;
  envs: Environment[];
}

/** GitHub OIDC trust policies, on the Access Tokens tab (guibranco/grimoire-ui#444). */
export const TrustPoliciesSection: React.FC<Props> = ({ appSlug, envs }) => {
  const { data, isLoading, isError } = useTrustPolicies(appSlug);
  const remove = useDeleteTrustPolicy(appSlug);
  const [editing, setEditing] = useState<TrustPolicy | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<TrustPolicy | null>(null);
  const policies = Array.isArray(data) ? data : [];

  const openForm = (policy: TrustPolicy | null) => {
    setEditing(policy);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(`Deleted ${deleting.name}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to delete the trust policy'));
    }
  };

  return (
    <section aria-labelledby="trust-policies-heading" className="space-y-3 pt-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 id="trust-policies-heading" className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            GitHub OIDC trust policies
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Workflows exchange their OIDC token at <span className="font-mono">POST /consumer/oidc/github</span>{' '}
            for a short-lived token; nothing is stored in GitHub.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-1 h-8 px-3 border border-border text-xs font-bold text-foreground hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New policy
        </button>
      </div>

      {isLoading && <p className="text-xs text-zinc-500">Loading trust policies…</p>}
      {isError && (
        <p role="alert" className="text-xs text-red-400">
          Couldn't load the trust policies.
        </p>
      )}

      {!isLoading && !isError && policies.length === 0 && (
        <div className="border border-dashed border-zinc-800 px-6 py-6 text-center">
          <GitBranch className="w-5 h-5 text-zinc-600 mx-auto mb-2" aria-hidden="true" />
          <p className="text-xs text-zinc-500">
            No trust policies. Add one to let a repository's workflows read without a stored token.
          </p>
        </div>
      )}

      {policies.length > 0 && (
        <div className="border border-zinc-800 overflow-x-auto">
          <table className="w-full text-left" aria-label="Trust policies">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-widest text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-bold">Name</th>
                <th className="px-3 py-2 font-bold">Repository</th>
                <th className="px-3 py-2 font-bold hidden md:table-cell">Grants</th>
                <th className="px-3 py-2 font-bold hidden lg:table-cell">Last used</th>
                <th className="px-3 py-2 font-bold sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id} className="border-t border-zinc-900 text-xs">
                  <td className="px-3 py-2 font-medium text-zinc-200">{policy.name}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-zinc-300">{policy.repository}</div>
                    <div className="font-mono text-[11px] text-zinc-500">{matchSummary(policy)}</div>
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <div className="font-mono text-[11px]">{environmentsLabel(policy.environments)}</div>
                    <div className="text-[11px] text-zinc-500">
                      {policy.scopes.map(scopeLabel).join(', ')} · {policy.tokenLifetimeMinutes} min
                    </div>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell whitespace-nowrap">
                    <RelativeTime value={policy.lastUsedAt} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openForm(policy)}
                        aria-label={`Edit ${policy.name}`}
                        className="h-7 w-7 inline-flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(policy)}
                        aria-label={`Delete ${policy.name}`}
                        className="h-7 w-7 inline-flex items-center justify-center text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TrustPolicyFormModal
        appSlug={appSlug}
        envs={envs}
        policy={editing}
        takenNames={policies.map((p) => p.name)}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <ConfirmationModal
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete trust policy"
        description={`Delete ${deleting?.name ?? 'this policy'}? Its workflows can no longer get tokens, and tokens it issued stop working at once.`}
        onConfirm={confirmDelete}
        confirmText="Delete"
        variant="destructive"
      />
    </section>
  );
};
