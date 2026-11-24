import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Radio, Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { apiErrorMessage } from '@/lib/errors';
import { describePublishing, type PublishingScope } from '@/lib/publishing';
import { cn } from '@/lib/utils';
import { usePublish, usePublishing, useSetAutoPublish } from './usePublishing';

interface PublishBarProps {
  scope: PublishingScope;
  /**
   * Changes whenever the configuration shown above changed (e.g. the effective-configuration
   * query's `dataUpdatedAt`), so pending changes show up without a reload.
   */
  refreshKey?: number;
}

/**
 * Auto-publish toggle, "unpublished changes" indicator and "Publish changes" button
 * (guibranco/grimoire-ui#456). Hidden when the API doesn't support publishing.
 */
export const PublishBar: React.FC<PublishBarProps> = ({ scope, refreshKey }) => {
  const isGlobal = 'global' in scope;
  const { data: status, refetch } = usePublishing(scope);
  const publish = usePublish(scope);
  const setAutoPublish = useSetAutoPublish(scope);
  const [confirming, setConfirming] = useState(false);

  // Skip the first render: the query has just fetched.
  const seenKey = useRef(refreshKey);
  useEffect(() => {
    if (seenKey.current === refreshKey) return;
    seenKey.current = refreshKey;
    void refetch();
  }, [refreshKey, refetch]);

  if (!status) return null;

  const toggle = async (autoPublish: boolean) => {
    try {
      await setAutoPublish.mutateAsync(autoPublish);
      toast.success(
        autoPublish
          ? status.hasPendingChanges
            ? 'Auto-publish on: pending changes published'
            : 'Auto-publish on'
          : 'Auto-publish off: changes wait until you publish them'
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to change auto-publish'));
    }
  };

  const confirmPublish = async () => {
    try {
      await publish.mutateAsync();
      toast.success(isGlobal ? 'Global changes published' : 'Changes published');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to publish changes'));
    }
  };

  const switchId = isGlobal ? 'publish-auto-global' : `publish-auto-${scope.appSlug}-${scope.envSlug}`;

  return (
    <div
      data-testid="publish-bar"
      className={cn(
        'px-4 md:px-6 py-2 border-b border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs shrink-0',
        status.hasPendingChanges ? 'bg-amber-500/[0.06]' : 'bg-zinc-900/40'
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            id={switchId}
            checked={status.autoPublish}
            disabled={setAutoPublish.isPending}
            onCheckedChange={toggle}
            aria-label="Auto-publish"
          />
          <Label
            htmlFor={switchId}
            className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 cursor-pointer"
          >
            Auto-publish
          </Label>
        </div>
        <span
          className={cn(
            'flex items-center gap-1.5 font-sans min-w-0',
            status.hasPendingChanges ? 'text-amber-400' : 'text-zinc-500'
          )}
        >
          <Radio className="w-3 h-3 shrink-0" />
          <span className="truncate" title={status.sentinelValue ? `${status.sentinelKey} = ${status.sentinelValue}` : undefined}>
            {describePublishing(status)}
          </span>
        </span>
      </div>
      {status.hasPendingChanges && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={publish.isPending}
          className="h-[26px] px-3 bg-amber-500 text-black hover:bg-amber-400 font-bold uppercase tracking-tight text-[10px] transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Send className="w-3 h-3" />
          Publish changes
        </button>
      )}
      <ConfirmationModal
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={confirmPublish}
        title={isGlobal ? 'Publish global changes' : 'Publish changes'}
        description={
          isGlobal
            ? `Bumps ${status.sentinelKey}. Every application that inherits global values reloads its configuration.`
            : `Bumps ${status.sentinelKey} for ${scope.appSlug} / ${scope.envSlug}. Clients watching it reload their configuration.`
        }
        confirmText="Publish"
      />
    </div>
  );
};
