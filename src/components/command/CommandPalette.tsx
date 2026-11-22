import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  AppWindow,
  CornerDownLeft,
  Globe,
  History,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Plus,
  Search,
  Settings,
} from 'lucide-react';
import { api } from '@/lib/api';
import { appPath, dashboardPath, globalCreatePath, globalPath } from '@/lib/routes';
import {
  highlightSegments,
  isPaletteShortcut,
  MIN_SEARCH_LENGTH,
  SEARCH_DEBOUNCE_MS,
  SEARCH_GROUPS,
  SEARCH_LIMIT,
  searchResultPath,
  useDebouncedValue,
} from '@/lib/search';
import { useStore } from '@/store/useStore';
import { Application, SearchResponse, SearchResult } from '@/types/api';
import { cn } from '@/lib/utils';

interface CommandPaletteApi {
  open: () => void;
}

/** Opens the ⌘K command palette from anywhere inside the shell. */
export const CommandPaletteContext = React.createContext<CommandPaletteApi>({ open: () => {} });

export const useCommandPalette = () => useContext(CommandPaletteContext);

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  /** Secondary line: location, environments or a hint. */
  detail?: string;
  /** Text matched only in the description; shown when the label doesn't match. */
  description?: string | null;
  badge?: string | null;
  icon: React.ReactNode;
  run: () => void;
}

const ICONS: Record<string, React.ReactNode> = {
  application: <AppWindow className="w-3.5 h-3.5 text-zinc-300" aria-hidden="true" />,
  secret: <Lock className="w-3.5 h-3.5 text-grimoire" aria-hidden="true" />,
  configuration: <Settings className="w-3.5 h-3.5 text-config" aria-hidden="true" />,
  'global-secret': <Lock className="w-3.5 h-3.5 text-global" aria-hidden="true" />,
  'global-configuration': <Globe className="w-3.5 h-3.5 text-global" aria-hidden="true" />,
};

const describeLocation = (hit: SearchResult) => {
  const envs = hit.environments.map((e) => (e === '*' ? 'all environments' : e)).join(', ');
  if (hit.type === 'application') return hit.application ?? undefined;
  if (!hit.application) return envs ? `Global · ${envs}` : 'Global';
  return envs ? `${hit.application} · ${envs}` : `${hit.application} · no value yet`;
};

const Highlighted: React.FC<{ text: string; query: string }> = ({ text, query }) => (
  <>
    {highlightSegments(text, query).map((s) =>
      s.match ? (
        <mark key={s.start} className="bg-grimoire/25 text-foreground rounded-none">
          {s.text}
        </mark>
      ) : (
        <React.Fragment key={s.start}>{s.text}</React.Fragment>
      )
    )}
  </>
);

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateApp: () => void;
}

/**
 * Global search across applications, secrets and configuration (application and Global),
 * plus navigation commands and recently visited applications. Backed by
 * `GET /management/search`, which never returns values.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onOpenChange, onCreateApp }) => {
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const recentAppSlugs = useStore((s) => s.recentAppSlugs);
  const lastVisitedAppSlug = useStore((s) => s.lastVisitedAppSlug);
  const lastVisitedEnvironmentSlug = useStore((s) => s.lastVisitedEnvironmentSlug);
  const disconnect = useStore((s) => s.disconnect);

  const term = query.trim();
  const debouncedTerm = useDebouncedValue(term, SEARCH_DEBOUNCE_MS);
  const canSearch = debouncedTerm.length >= MIN_SEARCH_LENGTH;

  const { data: apps } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => (await api.get<Application[]>('/applications')).data,
    enabled: open,
  });

  const search = useQuery({
    queryKey: ['search', debouncedTerm],
    queryFn: async () => {
      const res = await api.get<SearchResponse>('/search', {
        params: { q: debouncedTerm, limit: SEARCH_LIMIT },
      });
      // The demo mock adapter resolves error statuses instead of rejecting like axios does.
      if (res.status >= 400) throw new Error(`Search failed with status ${res.status}`);
      return res.data;
    },
    enabled: open && canSearch,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

  // Reset when closed so the palette always opens fresh.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const go = useCallback(
    (to: string) => {
      onOpenChange(false);
      navigate(to);
    },
    [navigate, onOpenChange]
  );

  const items = useMemo<PaletteItem[]>(() => {
    const appName = (slug: string) =>
      (Array.isArray(apps) ? apps.find((a) => a.slug === slug)?.name : undefined) ?? slug;

    const commands: PaletteItem[] = [
      {
        id: 'cmd-dashboard',
        group: 'Commands',
        label: 'Go to Dashboard',
        icon: <LayoutDashboard className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />,
        run: () => go(dashboardPath()),
      },
      {
        id: 'cmd-global',
        group: 'Commands',
        label: 'Go to Global',
        icon: <Globe className="w-3.5 h-3.5 text-global" aria-hidden="true" />,
        run: () => go(globalPath()),
      },
      {
        id: 'cmd-new-app',
        group: 'Commands',
        label: 'New application',
        icon: <Plus className="w-3.5 h-3.5 text-grimoire" aria-hidden="true" />,
        run: () => {
          onOpenChange(false);
          onCreateApp();
        },
      },
      {
        id: 'cmd-new-global-config',
        group: 'Commands',
        label: 'New global configuration',
        icon: <Settings className="w-3.5 h-3.5 text-config" aria-hidden="true" />,
        run: () => go(globalCreatePath('config')),
      },
      {
        id: 'cmd-new-global-secret',
        group: 'Commands',
        label: 'New global secret',
        icon: <Lock className="w-3.5 h-3.5 text-grimoire" aria-hidden="true" />,
        run: () => go(globalCreatePath('secrets')),
      },
      {
        id: 'cmd-disconnect',
        group: 'Commands',
        label: 'Disconnect',
        detail: 'Forget the API URL and admin key on this browser',
        icon: <LogOut className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />,
        run: () => {
          onOpenChange(false);
          disconnect();
          navigate(dashboardPath());
        },
      },
    ];

    const recents: PaletteItem[] = recentAppSlugs.map((slug) => ({
      id: `recent-${slug}`,
      group: 'Recent applications',
      label: appName(slug),
      detail: slug,
      icon: <History className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />,
      run: () => go(appPath(slug, slug === lastVisitedAppSlug ? lastVisitedEnvironmentSlug : null)),
    }));

    const matches = (item: PaletteItem) =>
      !term ||
      item.label.toLowerCase().includes(term.toLowerCase()) ||
      (item.detail?.toLowerCase().includes(term.toLowerCase()) ?? false);

    if (term.length < MIN_SEARCH_LENGTH) {
      return [...recents.filter(matches), ...commands.filter(matches)];
    }

    const results = search.data?.results ?? [];
    const found: PaletteItem[] = SEARCH_GROUPS.flatMap(({ type, label }) =>
      results
        .filter((hit) => hit.type === type)
        .map((hit, i) => {
          const nameMatches = hit.name.toLowerCase().includes(term.toLowerCase());
          return {
            id: `hit-${type}-${hit.application ?? 'global'}-${hit.name}-${i}`,
            group: label,
            label: hit.name,
            detail: describeLocation(hit),
            description: nameMatches ? null : hit.description,
            badge: hit.valueType && hit.valueType !== 'string' ? hit.valueType : null,
            icon: ICONS[hit.type] ?? <Search className="w-3.5 h-3.5" aria-hidden="true" />,
            run: () =>
              go(
                searchResultPath(
                  hit,
                  hit.application && hit.application === lastVisitedAppSlug ? lastVisitedEnvironmentSlug : null
                )
              ),
          };
        })
    );

    return [...found, ...commands.filter(matches)];
  }, [
    apps,
    recentAppSlugs,
    lastVisitedAppSlug,
    lastVisitedEnvironmentSlug,
    term,
    search.data,
    go,
    onCreateApp,
    onOpenChange,
    disconnect,
    navigate,
  ]);

  // Keep the active row valid as results change.
  useEffect(() => {
    setActiveIndex((i) => (items.length === 0 ? 0 : Math.min(i, items.length - 1)));
  }, [items.length]);

  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length) setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length) setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(Math.max(0, items.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[activeIndex]?.run();
    }
  };

  const searching = term.length >= MIN_SEARCH_LENGTH && (search.isFetching || term !== debouncedTerm);
  const noResults =
    term.length >= MIN_SEARCH_LENGTH &&
    !searching &&
    search.isSuccess &&
    (search.data?.results.length ?? 0) === 0;

  // Render groups in order of first appearance, keeping a flat index for keyboard navigation.
  const groups: { name: string; entries: { item: PaletteItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const group = groups.find((g) => g.name === item.group);
    if (group) group.entries.push({ item, index });
    else groups.push({ name: item.group, entries: [{ item, index }] });
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/70 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup
          initialFocus={inputRef}
          aria-label="Command palette"
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 border border-border bg-[#121214] shadow-2xl outline-none flex flex-col max-h-[70dvh]"
        >
          <DialogPrimitive.Title className="sr-only">Search Grimoire</DialogPrimitive.Title>
          <div className="flex items-center gap-2 px-3 border-b border-border">
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500 shrink-0" aria-hidden="true" />
            ) : (
              <Search className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
            )}
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items.length ? optionId(activeIndex) : undefined}
              aria-label="Search applications, secrets and configuration"
              placeholder="Search apps, secrets, config keys… or type a command"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoComplete="off"
              className="flex-1 h-12 bg-transparent text-sm text-foreground placeholder:text-zinc-600 outline-none font-mono"
            />
            <kbd className="hidden sm:inline px-1.5 py-0.5 border border-zinc-700 text-[9px] font-mono text-zinc-500">ESC</kbd>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            <div id={listId} role="listbox" aria-label="Results" className="outline-none">
              {groups.map((group) => {
                const headingId = `${listId}-${group.name.replace(/\s+/g, '-').toLowerCase()}`;
                return (
                  <div key={group.name} role="group" aria-labelledby={headingId}>
                    <div
                      id={headingId}
                      className="px-3 pt-2 pb-1 text-[9px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-600"
                    >
                      {group.name}
                    </div>
                      {group.entries.map(({ item, index }) => {
                        const active = index === activeIndex;
                        return (
                          <div
                            key={item.id}
                            id={optionId(index)}
                            role="option"
                            aria-selected={active}
                            onMouseMove={() => !active && setActiveIndex(index)}
                            // Keep focus in the input while clicking.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => item.run()}
                            className={cn(
                              'mx-1 px-2.5 py-2 flex items-center gap-3 cursor-pointer border-l-2',
                              active ? 'bg-zinc-800/70 border-l-grimoire' : 'border-l-transparent'
                            )}
                          >
                            <span className="shrink-0">{item.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-zinc-100 font-mono">
                                <Highlighted text={item.label} query={term} />
                              </span>
                              {item.description ? (
                                <span className="block truncate text-[11px] text-zinc-500">
                                  <Highlighted text={item.description} query={term} />
                                </span>
                              ) : null}
                              {item.detail ? (
                                <span className="block truncate text-[10px] text-zinc-500 font-mono">{item.detail}</span>
                              ) : null}
                            </span>
                            {item.badge ? (
                              <span className="shrink-0 px-1.5 py-0.5 border border-config/40 text-config text-[9px] font-mono uppercase">
                                {item.badge}
                              </span>
                            ) : null}
                            {active ? (
                              <CornerDownLeft className="w-3 h-3 text-zinc-500 shrink-0" aria-hidden="true" />
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>

            <div aria-live="polite" className="px-3 py-2 text-[11px] text-zinc-500">
              {term.length === 1 ? `Type at least ${MIN_SEARCH_LENGTH} characters to search.` : null}
              {noResults ? <>No applications, secrets or keys match “{term}”.</> : null}
              {search.isError && term.length >= MIN_SEARCH_LENGTH ? 'Search failed. Is the API reachable?' : null}
              {search.data?.truncated && !searching ? `Showing the top ${SEARCH_LIMIT} results — refine your search.` : null}
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-4 px-3 h-8 border-t border-border text-[10px] font-mono text-zinc-600">
            <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>esc</kbd> close</span>
            <span className="ml-auto">Names and keys only — values are never searched</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

/** Registers ⌘K / Ctrl+K globally while mounted. */
export function usePaletteShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
}
