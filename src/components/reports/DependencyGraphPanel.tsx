import React, { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, ExternalLink, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatAbsolute } from '@/lib/dashboard';
import {
  DEFAULT_GRAPH_FILTER,
  EDGE_KIND_LABELS,
  GRAPH_LAYOUT,
  NODE_TYPE_LABELS,
  edgePath,
  lastReadInWords,
  layoutGraph,
  nodeLink,
  visibleGraph,
  type GraphFilter,
} from '@/lib/reports';
import type { DependencyEdge, DependencyEdgeKind, DependencyGraph, DependencyNode, DependencyNodeType } from '@/types/api';
import { useDependencyGraph, useFirstEnvironments } from './useReports';

const NODE_STYLES: Record<DependencyNodeType, string> = {
  application: 'border-zinc-500 bg-zinc-900 text-zinc-100',
  secret: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
  'global-secret': 'border-global/60 bg-global/10 text-global',
  'config-key': 'border-sky-500/60 bg-sky-500/10 text-sky-200',
  'global-config-key': 'border-global/40 bg-global/5 text-global',
};

const EDGE_STYLES: Record<DependencyEdgeKind, { stroke: string; dash?: string; swatch: string }> = {
  owns: { stroke: 'stroke-zinc-600', swatch: 'bg-zinc-500' },
  reads: { stroke: 'stroke-emerald-500', swatch: 'bg-emerald-500' },
  overrides: { stroke: 'stroke-amber-400', dash: '6 4', swatch: 'bg-amber-400' },
  inherits: { stroke: 'stroke-sky-500/60', dash: '2 4', swatch: 'bg-sky-500' },
};

const KINDS = Object.keys(EDGE_KIND_LABELS) as DependencyEdgeKind[];
const chip = 'h-[26px] px-2.5 border text-[10px] font-bold uppercase tracking-widest transition-colors';
const chipClass = (active: boolean) =>
  cn(chip, active ? 'border-grimoire bg-grimoire/15 text-grimoire' : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-200');

const nodeTitle = (n: DependencyNode) =>
  `${NODE_TYPE_LABELS[n.type]}: ${n.label}${n.application ? ` (${n.application})` : ''}`;

const edgeDetail = (e: DependencyEdge) => {
  if (e.kind !== 'reads') return null;
  const parts = [e.environments.join(', ')];
  if (e.lastReadAt) parts.push(`last ${lastReadInWords(e.lastReadAt)}`);
  if (e.readCount !== null) parts.push(`${e.readCount} reads`);
  return parts.filter(Boolean).join(' · ');
};

const NodeDetails: React.FC<{
  graph: DependencyGraph;
  node: DependencyNode;
  fallbackEnv?: string;
  onFocus: (id: string | null) => void;
}> = ({ graph, node, fallbackEnv, onFocus }) => {
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const connections = graph.edges.filter((e) => e.source === node.id || e.target === node.id);
  const link = nodeLink(node, fallbackEnv);

  return (
    <aside aria-label="Selected node" className="flex flex-col gap-3 border border-border bg-card/60 p-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">{NODE_TYPE_LABELS[node.type]}</p>
          <h3 className="font-mono text-sm text-zinc-100 break-all">{node.label}</h3>
          {node.application && <p className="text-[11px] text-zinc-500">in {node.application}</p>}
          {node.environments.length > 0 && (
            <p className="font-mono text-[10px] text-zinc-500">{node.environments.join(', ')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onFocus(null)}
          aria-label="Clear focus"
          className="h-6 w-6 inline-flex items-center justify-center text-zinc-500 hover:text-zinc-200"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
      {link && (
        <Link to={link} className="inline-flex items-center gap-1.5 text-xs text-grimoire hover:underline">
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
          Open
        </Link>
      )}
      <div>
        <h4 className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">
          Connections ({connections.length})
        </h4>
        {connections.length === 0 ? (
          <p className="text-xs text-zinc-600">None.</p>
        ) : (
          <ul className="flex flex-col gap-1 max-h-[420px] overflow-auto">
            {connections.map((e) => {
              const outgoing = e.source === node.id;
              const other = byId.get(outgoing ? e.target : e.source);
              if (!other) return null;
              const detail = edgeDetail(e);
              return (
                <li key={`${e.source}|${e.target}|${e.kind}`}>
                  <button
                    type="button"
                    onClick={() => onFocus(other.id)}
                    className="w-full text-left px-2 py-1 border border-zinc-900 hover:border-zinc-700 hover:bg-zinc-900/60"
                  >
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <span className={cn('inline-block w-2 h-2', EDGE_STYLES[e.kind].swatch)} aria-hidden="true" />
                      <span className="text-zinc-500">{outgoing ? EDGE_KIND_LABELS[e.kind] : `${EDGE_KIND_LABELS[e.kind]} ←`}</span>
                      <span className="font-mono text-zinc-200 truncate">{other.label}</span>
                    </span>
                    {detail && (
                      <span
                        className="block font-mono text-[10px] text-emerald-400/80"
                        title={e.lastReadAt ? formatAbsolute(e.lastReadAt) : undefined}
                      >
                        {detail}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};

const GraphCanvas: React.FC<{
  graph: DependencyGraph;
  filter: GraphFilter;
  focus: string | null;
  onFocus: (id: string | null) => void;
}> = ({ graph, filter, focus, onFocus }) => {
  const visible = useMemo(() => visibleGraph(graph, filter, focus), [graph, filter, focus]);
  const layout = useMemo(() => layoutGraph(visible.nodes), [visible.nodes]);
  const positions = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);
  const { nodeWidth, nodeHeight } = GRAPH_LAYOUT;

  if (visible.nodes.length === 0) {
    return <p className="p-6 text-xs text-zinc-500">Nothing to show with these filters.</p>;
  }

  return (
    <div className="relative" style={{ width: layout.width, height: layout.height }}>
      <svg width={layout.width} height={layout.height} className="absolute inset-0" aria-hidden="true">
        {visible.edges.map((e) => {
          const s = positions.get(e.source);
          const t = positions.get(e.target);
          if (!s || !t) return null;
          const style = EDGE_STYLES[e.kind];
          const touchesFocus = !focus || e.source === focus || e.target === focus;
          return (
            <path
              key={`${e.source}|${e.target}|${e.kind}`}
              data-kind={e.kind}
              d={edgePath(s, t)}
              fill="none"
              strokeWidth={e.kind === 'reads' ? 2 : 1.25}
              strokeDasharray={style.dash}
              className={cn(style.stroke, touchesFocus ? 'opacity-90' : 'opacity-30')}
            />
          );
        })}
      </svg>
      {layout.nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          data-node={n.id}
          aria-pressed={focus === n.id}
          title={nodeTitle(n)}
          onClick={() => onFocus(focus === n.id ? null : n.id)}
          style={{ left: n.x, top: n.y, width: nodeWidth, height: nodeHeight }}
          className={cn(
            'absolute flex items-center gap-1.5 px-2 border text-left font-mono text-[11px] truncate transition-shadow',
            NODE_STYLES[n.type],
            focus === n.id && 'ring-2 ring-grimoire ring-offset-1 ring-offset-black'
          )}
        >
          <span className="truncate">{n.label}</span>
          {n.application && n.type !== 'application' && (
            <span className="ml-auto shrink-0 text-[9px] text-zinc-500 truncate max-w-[45%]">{n.application}</span>
          )}
        </button>
      ))}
    </div>
  );
};

/**
 * Reports → Dependencies: applications, secrets and configuration keys with `owns`, `reads`,
 * `overrides` and `inherits` edges (guibranco/grimoire-ui#451). Clicking a node focuses its
 * neighbourhood; the focus lives in the URL (`?focus=`).
 */
export const DependencyGraphPanel: React.FC<{ focus: string | null; onFocus: (id: string | null) => void }> = ({
  focus,
  onFocus,
}) => {
  const { data, error, isPending } = useDependencyGraph();
  const [showConfig, setShowConfig] = useState(DEFAULT_GRAPH_FILTER.showConfig);
  const [kinds, setKinds] = useState<ReadonlySet<DependencyEdgeKind>>(DEFAULT_GRAPH_FILTER.kinds);
  const [query, setQuery] = useState('');
  const listId = useId();
  const filter = useMemo<GraphFilter>(() => ({ showConfig, kinds }), [showConfig, kinds]);

  const focused = data?.nodes.find((n) => n.id === focus) ?? null;
  const firstEnvs = useFirstEnvironments(focused?.application ? [focused.application] : []);

  const toggleKind = (kind: DependencyEdgeKind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q || !data) return;
    const match =
      data.nodes.find((n) => n.label.toLowerCase() === q || n.id.toLowerCase() === q) ??
      data.nodes.find((n) => n.label.toLowerCase().includes(q));
    if (match) {
      onFocus(match.id);
      setQuery('');
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16" aria-busy="true" aria-label="Loading dependency graph">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-16 border border-red-500/30 bg-red-500/5 text-center">
        <AlertOctagon className="w-6 h-6 text-red-400" aria-hidden="true" />
        <h3 className="text-sm font-bold text-zinc-100">Couldn't load the dependency graph</h3>
        <p className="text-xs text-zinc-500 max-w-sm">
          Check the connection, or that the API is recent enough to provide{' '}
          <code className="font-mono text-zinc-400">/management/reports/dependencies</code>.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Dependencies" className="flex flex-col gap-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <form onSubmit={submitSearch} className="flex items-center gap-1" role="search">
          <label htmlFor={`${listId}-q`} className="sr-only">Find a node</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
            <input
              id={`${listId}-q`}
              list={listId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an application, secret or key…"
              className="h-[26px] w-72 pl-7 pr-2 bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            <datalist id={listId}>
              {data.nodes.map((n) => (
                <option key={n.id} value={n.label}>{nodeTitle(n)}</option>
              ))}
            </datalist>
          </div>
          <button type="submit" className={chipClass(false)}>Focus</button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={showConfig} onClick={() => setShowConfig((v) => !v)} className={chipClass(showConfig)}>
            Config keys
          </button>
          <fieldset className="flex items-center gap-1 border-0 p-0 m-0">
            <legend className="sr-only">Edges</legend>
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={kinds.has(kind)}
                onClick={() => toggleKind(kind)}
                className={cn(chipClass(kinds.has(kind)), 'inline-flex items-center gap-1.5')}
              >
                <span className={cn('inline-block w-2 h-2', EDGE_STYLES[kind].swatch)} aria-hidden="true" />
                {EDGE_KIND_LABELS[kind]}
              </button>
            ))}
          </fieldset>
        </div>
      </div>

      <p className="text-[11px] text-zinc-500">
        {data.nodes.length} nodes · {data.edges.length} edges. Click a node to focus on it and its neighbours; click it
        again to show everything. <span className="text-zinc-400">reads</span> come from Consumer API reads;{' '}
        <span className="text-zinc-400">overrides</span> link an application entry to the global it shadows.
      </p>

      <div className={cn('grid gap-3', focused ? 'xl:grid-cols-[1fr_300px]' : 'grid-cols-1')}>
        <div className="border border-border bg-black/30 overflow-auto max-h-[70vh]">
          <GraphCanvas graph={data} filter={filter} focus={focused ? focus : null} onFocus={onFocus} />
        </div>
        {focused && (
          <NodeDetails
            graph={data}
            node={focused}
            fallbackEnv={focused.application ? firstEnvs[focused.application] : undefined}
            onFocus={onFocus}
          />
        )}
      </div>
    </section>
  );
};
