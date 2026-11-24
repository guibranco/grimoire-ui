import type { PublishingStatus } from '@/types/api';
import { GLOBAL_SENTINEL_KEY, SENTINEL_KEY } from '@/lib/publishing';

/**
 * Demo implementation of publishing (guibranco/grimoire-api#95) for the mock API: auto-publish
 * per environment and for globals, pending changes, and the sentinel value bumped on every
 * change (auto-publish on) or on publish. The demo keeps the sentinel here rather than as a
 * configuration entry.
 */

export interface MockPublishingContext {
  /** The application's environments, or `null` when the application doesn't exist. */
  environmentsOf: (appSlug: string) => { slug: string }[] | null;
}

export interface MockPublishingResponse {
  status: number;
  data: unknown;
}

interface PublishingState {
  autoPublish: boolean;
  sentinelValue: string | null;
  lastPublishedAt: string | null;
  pendingChangesSince: string | null;
}

const isBrowser = typeof window !== 'undefined';
const STORAGE_KEY = 'grm_mock_publishing';
const GLOBAL = '*';

const fresh = (): PublishingState => ({
  autoPublish: true,
  sentinelValue: null,
  lastPublishedAt: null,
  pendingChangesSince: null,
});

/** The demo's production gateway stages changes, so the "Publish changes" flow is visible. */
function seed(): Record<string, PublishingState> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  return {
    'production-gateway/production': {
      autoPublish: false,
      sentinelValue: String(Date.parse(dayAgo)),
      lastPublishedAt: dayAgo,
      pendingChangesSince: hourAgo,
    },
  };
}

function load(): Record<string, PublishingState> {
  if (isBrowser) {
    const item = localStorage.getItem(STORAGE_KEY);
    if (item) {
      try {
        return JSON.parse(item);
      } catch {
        // fall back to the seed
      }
    }
  }
  return seed();
}

let states = load();

const persist = () => {
  if (isBrowser) localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
};

export function resetMockPublishing() {
  states = seed();
  if (isBrowser) localStorage.removeItem(STORAGE_KEY);
}

/** Drops an application's publishing state (when the demo deletes it or an environment). */
export function forgetMockPublishing(appSlug: string, envSlug?: string) {
  for (const id of Object.keys(states))
    if (envSlug ? id === `${appSlug}/${envSlug}` : id.startsWith(`${appSlug}/`)) delete states[id];
  persist();
}

const stateOf = (id: string) => (states[id] ??= fresh());

function bump(state: PublishingState) {
  const now = Date.now();
  const previous = Number(state.sentinelValue ?? 0);
  state.sentinelValue = String(previous >= now ? previous + 1 : now);
  state.lastPublishedAt = new Date().toISOString();
  state.pendingChangesSince = null;
}

/** A configuration or secret change: bump when auto-publishing, otherwise mark as pending. */
function change(id: string) {
  const state = stateOf(id);
  if (state.autoPublish) bump(state);
  else state.pendingChangesSince ??= new Date().toISOString();
  persist();
}

/**
 * Records a successful write described by the audit trail: `environment` is the target
 * environment slug (`*` or a slug for globals), `application` is `null` for globals.
 */
export function noteMockPublishingChange(change_: {
  application: string | null;
  environment: string | null;
  targetType: string | null;
}) {
  const { application, environment, targetType } = change_;
  if (!environment || !['configuration', 'secret', 'import'].includes(targetType ?? '')) return;
  if (application === null) change(GLOBAL);
  else for (const env of environment.split(',')) change(`${application}/${env.trim()}`);
}

const toStatus = (state: PublishingState, sentinelKey: string): PublishingStatus => ({
  ...state,
  sentinelKey,
  hasPendingChanges: state.pendingChangesSince !== null,
});

const ok = (data: unknown): MockPublishingResponse => ({ status: 200, data });
const notFound = (message: string): MockPublishingResponse => ({ status: 404, data: { title: 'Not Found', detail: message } });

function respond(id: string, sentinelKey: string, method: string, action: string, body: any) {
  const state = stateOf(id);
  if (action === 'publishing' && method === 'GET') return ok(toStatus(state, sentinelKey));
  if (action === 'publishing' && method === 'PUT') {
    state.autoPublish = !!body?.autoPublish;
    if (state.autoPublish && state.pendingChangesSince) bump(state);
    persist();
    return ok(toStatus(state, sentinelKey));
  }
  if (action === 'publish' && method === 'POST') {
    bump(state);
    persist();
    return ok(toStatus(state, sentinelKey));
  }
  return undefined;
}

export function handlePublishingRequest(
  ctx: MockPublishingContext,
  method: string,
  cleanPath: string,
  body: any
): MockPublishingResponse | undefined {
  const global = /^\/global\/(publishing|publish)$/.exec(cleanPath);
  if (global) return respond(GLOBAL, GLOBAL_SENTINEL_KEY, method, global[1], body);

  const app = /^\/applications\/([^/]+)\/environments\/([^/]+)\/(publishing|publish)$/.exec(cleanPath);
  if (!app) return undefined;
  const [appSlug, envSlug] = [decodeURIComponent(app[1]), decodeURIComponent(app[2])];
  const envs = ctx.environmentsOf(appSlug);
  if (!envs) return notFound('Application not found.');
  if (!envs.some((e) => e.slug === envSlug)) return notFound('Environment not found.');
  return respond(`${appSlug}/${envSlug}`, SENTINEL_KEY, method, app[3], body);
}
