import { useEffect, useState } from 'react';
import { SearchResult } from '@/types/api';
import { appPath, globalPath } from '@/lib/routes';

/** Matches `GET /management/search` (guibranco/grimoire-api#105). */
export const MIN_SEARCH_LENGTH = 2;
export const SEARCH_LIMIT = 20;
export const SEARCH_DEBOUNCE_MS = 150;

export const SEARCH_GROUPS: { type: SearchResult['type']; label: string }[] = [
  { type: 'application', label: 'Applications' },
  { type: 'secret', label: 'Secrets' },
  { type: 'configuration', label: 'Configuration' },
  { type: 'global-secret', label: 'Global secrets' },
  { type: 'global-configuration', label: 'Global configuration' },
];

/**
 * Environment to open for a hit: the one last visited in that app when it holds a value,
 * otherwise the first listed. `*` isn't a real environment for application entries.
 */
export const pickEnvironment = (environments: string[], preferred?: string | null) => {
  const real = environments.filter((e) => e !== '*');
  if (preferred && real.includes(preferred)) return preferred;
  return real[0] ?? null;
};

/** Route for a search hit, highlighting the entry with `?key=` where possible. */
export const searchResultPath = (hit: SearchResult, preferredEnv?: string | null): string => {
  switch (hit.type) {
    case 'application':
      return appPath(hit.application ?? hit.name);
    case 'secret':
    case 'configuration': {
      const app = hit.application ?? '';
      const env = pickEnvironment(hit.environments, preferredEnv);
      // A tab needs an environment in the URL; without one the app opens on its default tab.
      if (!env) return appPath(app, null, null, hit.type === 'configuration' ? hit.name : null);
      return appPath(app, env, hit.type === 'secret' ? 'secrets' : 'config', hit.name);
    }
    case 'global-secret':
      return globalPath('secrets', hit.name);
    case 'global-configuration':
      return globalPath('config', hit.name);
    default:
      return globalPath();
  }
};

export interface TextSegment {
  text: string;
  match: boolean;
}

/** Splits `text` into segments, marking case-insensitive occurrences of `query`. */
export const highlightSegments = (text: string, query: string): TextSegment[] => {
  const term = query.trim().toLowerCase();
  if (!term) return [{ text, match: false }];

  const lower = text.toLowerCase();
  const segments: TextSegment[] = [];
  let from = 0;
  for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, from)) {
    if (at > from) segments.push({ text: text.slice(from, at), match: false });
    segments.push({ text: text.slice(at, at + term.length), match: true });
    from = at + term.length;
  }
  if (from < text.length) segments.push({ text: text.slice(from), match: false });
  return segments;
};

/** ⌘K on macOS, Ctrl+K elsewhere (either is accepted). */
export const isPaletteShortcut = (e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>) =>
  e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;

export const isMacPlatform = () =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export const paletteShortcutLabel = () => (isMacPlatform() ? '⌘K' : 'Ctrl K');

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
