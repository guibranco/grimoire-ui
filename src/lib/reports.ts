import type {
  DependencyEdge,
  DependencyEdgeKind,
  DependencyGraph,
  DependencyNode,
  DependencyNodeType,
  UnusedSecret,
  UnusedSecretsResponse,
} from '@/types/api';
import { DEFAULT_UNUSED_WINDOW, appPath, globalPath } from '@/lib/routes';

/**
 * Helpers for the usage reports (guibranco/grimoire-ui#451, backend guibranco/grimoire-api#84):
 * response parsing, links, and the dependency graph's filtering, neighbourhood and layout.
 */

export const UNUSED_QUERY_KEY = ['reports', 'unused-secrets'] as const;
export const DEPENDENCIES_QUERY_KEY = ['reports', 'dependencies'] as const;

/** Windows offered on the unused-secrets report. */
export const UNUSED_WINDOWS = [30, 90, 180, 365] as const;
export { DEFAULT_UNUSED_WINDOW };

export const isUnusedWindow = (value: unknown): value is (typeof UNUSED_WINDOWS)[number] =>
  UNUSED_WINDOWS.includes(Number(value) as (typeof UNUSED_WINDOWS)[number]);

const DAY_MS = 24 * 60 * 60 * 1000;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Validates an unused-secrets payload; throws when it isn't one (e.g. an API without #84). */
export function parseUnused(data: unknown): UnusedSecretsResponse {
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error('Unexpected unused-secrets response');
  return {
    generatedAt: str(data.generatedAt) ?? new Date().toISOString(),
    days: num(data.days) || DEFAULT_UNUSED_WINDOW,
    since: str(data.since) ?? '',
    items: data.items.filter(isRecord).map(
      (i): UnusedSecret => ({
        application: str(i.application),
        applicationName: str(i.applicationName),
        secret: str(i.secret) ?? '',
        isGlobal: i.isGlobal === true,
        createdAt: str(i.createdAt) ?? '',
        lastReadAt: str(i.lastReadAt),
        readCount: num(i.readCount),
        reads: (Array.isArray(i.reads) ? i.reads : []).filter(isRecord).map((r) => ({
          application: str(r.application) ?? '',
          environment: str(r.environment) ?? '',
          lastReadAt: str(r.lastReadAt) ?? '',
          readCount: num(r.readCount),
        })),
      })
    ),
  };
}

const NODE_TYPES: ReadonlySet<string> = new Set<DependencyNodeType>(['application', 'secret', 'global-secret', 'config-key', 'global-config-key']);
const EDGE_KINDS: ReadonlySet<string> = new Set<DependencyEdgeKind>(['owns', 'reads', 'overrides', 'inherits']);

/** Validates a dependency graph payload, dropping unknown node types and dangling edges. */
export function parseGraph(data: unknown): DependencyGraph {
  if (!isRecord(data) || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Unexpected dependency graph response');
  }
  const nodes = data.nodes
    .filter(isRecord)
    .filter((n) => typeof n.id === 'string' && NODE_TYPES.has(n.type as string))
    .map(
      (n): DependencyNode => ({
        id: n.id as string,
        type: n.type as DependencyNodeType,
        label: str(n.label) ?? (n.id as string),
        application: str(n.application),
        environments: strings(n.environments),
      })
    );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = data.edges
    .filter(isRecord)
    .filter(
      (e) =>
        ids.has(e.source as string) && ids.has(e.target as string) && EDGE_KINDS.has(e.kind as string)
    )
    .map(
      (e): DependencyEdge => ({
        source: e.source as string,
        target: e.target as string,
        kind: e.kind as DependencyEdgeKind,
        environments: strings(e.environments),
        lastReadAt: str(e.lastReadAt),
        readCount: typeof e.readCount === 'number' ? e.readCount : null,
      })
    );
  return { generatedAt: str(data.generatedAt) ?? new Date().toISOString(), nodes, edges };
}

/** "never", "today", "1 day ago", "12 days ago". */
export function lastReadInWords(lastReadAt: string | null, now = Date.now()): string {
  if (!lastReadAt) return 'never';
  const t = new Date(lastReadAt).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const days = Math.floor((now - t) / DAY_MS);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * Where to open an unused secret: Global's secrets tab, or the application's secrets tab in an
 * environment it was read from (else the given fallback environment, else the first one).
 */
export function unusedSecretLink(item: UnusedSecret, fallbackEnv?: string | null): string {
  if (item.isGlobal || !item.application) return globalPath('secrets', item.secret);
  const env = item.reads.find((r) => r.application === item.application)?.environment ?? fallbackEnv ?? null;
  // A tab needs an environment in the URL; without one the application opens on its default tab.
  return env ? appPath(item.application, env, 'secrets', item.secret) : appPath(item.application);
}

/** Management API path that deletes the secret. */
export const unusedSecretDeletePath = (item: UnusedSecret) =>
  item.isGlobal || !item.application
    ? `/global/secrets/${encodeURIComponent(item.secret)}`
    : `/applications/${encodeURIComponent(item.application)}/secrets/${encodeURIComponent(item.secret)}`;

/**
 * Where to open a graph node in the app. Application secrets open in `fallbackEnv` (the
 * application's first environment, when known); keys in the first environment they exist in.
 */
export function nodeLink(node: DependencyNode, fallbackEnv?: string | null): string | null {
  switch (node.type) {
    case 'application':
      return appPath(node.id.slice('app:'.length));
    case 'secret':
      if (!node.application) return null;
      return fallbackEnv
        ? appPath(node.application, fallbackEnv, 'secrets', node.label)
        : appPath(node.application);
    case 'global-secret':
      return globalPath('secrets', node.label);
    case 'config-key': {
      if (!node.application) return null;
      const env = node.environments[0] ?? fallbackEnv ?? null;
      return env ? appPath(node.application, env, 'config', node.label) : appPath(node.application, null, null, node.label);
    }
    case 'global-config-key':
      return globalPath('config', node.label);
  }
}

export const NODE_TYPE_LABELS: Record<DependencyNodeType, string> = {
  application: 'Application',
  secret: 'Secret',
  'global-secret': 'Global secret',
  'config-key': 'Config key',
  'global-config-key': 'Global config key',
};

export const EDGE_KIND_LABELS: Record<DependencyEdgeKind, string> = {
  owns: 'owns',
  reads: 'reads',
  overrides: 'overrides',
  inherits: 'inherits',
};

export interface GraphFilter {
  /** Include configuration keys (application and global). */
  showConfig: boolean;
  /** Edge kinds to draw. */
  kinds: ReadonlySet<DependencyEdgeKind>;
}

export const DEFAULT_GRAPH_FILTER: GraphFilter = {
  showConfig: false,
  kinds: new Set(EDGE_KINDS as ReadonlySet<DependencyEdgeKind>),
};

const isConfig = (type: DependencyNodeType) => type === 'config-key' || type === 'global-config-key';

/**
 * The focused node's neighbourhood: its direct neighbours, plus one more hop through `owns` and
 * `overrides` edges, so focusing an application shows the globals its entries override and
 * focusing a global shows the applications whose entries override it.
 */
const isStructural = (kind: DependencyEdgeKind) => kind === 'owns' || kind === 'overrides';

export function neighbourhood(graph: Pick<DependencyGraph, 'edges'>, focus: string): Set<string> {
  const result = new Set<string>([focus]);
  const structural = new Set<string>();
  for (const e of graph.edges) {
    const other = otherEnd(e, focus);
    if (other === null) continue;
    result.add(other);
    if (isStructural(e.kind)) structural.add(other);
  }
  for (const e of graph.edges.filter((edge) => isStructural(edge.kind))) {
    if (structural.has(e.source)) result.add(e.target);
    if (structural.has(e.target)) result.add(e.source);
  }
  return result;
}

/** The edge's other end when it touches `id`, else `null`. */
function otherEnd(edge: Pick<DependencyEdge, 'source' | 'target'>, id: string): string | null {
  if (edge.source === id) return edge.target;
  return edge.target === id ? edge.source : null;
}

/** Nodes and edges to draw for a filter and optional focus. */
export function visibleGraph(graph: DependencyGraph, filter: GraphFilter, focus?: string | null) {
  const focusSet = focus && graph.nodes.some((n) => n.id === focus) ? neighbourhood(graph, focus) : null;
  const nodes = graph.nodes.filter(
    (n) => (filter.showConfig || !isConfig(n.type) || n.id === focus) && (!focusSet || focusSet.has(n.id))
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => filter.kinds.has(e.kind) && ids.has(e.source) && ids.has(e.target));
  return { nodes, edges };
}

/** 0 applications, 1 secrets, 2 configuration keys. */
export type GraphColumn = 0 | 1 | 2;

export interface PositionedNode extends DependencyNode {
  x: number;
  y: number;
  column: GraphColumn;
}

export const GRAPH_LAYOUT = { nodeWidth: 220, nodeHeight: 30, rowGap: 10, columnGap: 120, padding: 16 } as const;

const columnOf = (type: DependencyNodeType): GraphColumn => {
  if (type === 'application') return 0;
  return type === 'secret' || type === 'global-secret' ? 1 : 2;
};

/**
 * Three columns (applications, secrets, configuration keys). Entries are grouped by owning
 * application, globals last, so edges from one application stay close together.
 */
export function layoutGraph(nodes: DependencyNode[]) {
  const { nodeWidth, nodeHeight, rowGap, columnGap, padding } = GRAPH_LAYOUT;
  const columns: DependencyNode[][] = [[], [], []];
  for (const n of nodes) columns[columnOf(n.type)].push(n);
  const sortKey = (n: DependencyNode) => `${n.application === null && n.type !== 'application' ? '￿' : n.application ?? ''}\u0000${n.label}`;
  const positioned: PositionedNode[] = [];
  columns.forEach((column, c) => {
    column.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    column.forEach((n, row) =>
      positioned.push({
        ...n,
        column: c as GraphColumn,
        x: padding + c * (nodeWidth + columnGap),
        y: padding + row * (nodeHeight + rowGap),
      })
    );
  });
  const rows = Math.max(1, ...columns.map((c) => c.length));
  return {
    nodes: positioned,
    width: padding * 2 + 3 * nodeWidth + 2 * columnGap,
    height: padding * 2 + rows * nodeHeight + (rows - 1) * rowGap,
  };
}

/** SVG path for an edge: a curve between columns, or an arc beside the column within one. */
export function edgePath(source: PositionedNode, target: PositionedNode): string {
  const { nodeWidth, nodeHeight } = GRAPH_LAYOUT;
  const y1 = source.y + nodeHeight / 2;
  const y2 = target.y + nodeHeight / 2;
  if (source.column === target.column) {
    const x = source.x + nodeWidth;
    const bulge = 40 + Math.min(60, Math.abs(y2 - y1) / 4);
    return `M ${x} ${y1} C ${x + bulge} ${y1}, ${x + bulge} ${y2}, ${x} ${y2}`;
  }
  const [from, to] = source.x < target.x ? [source, target] : [target, source];
  const fy = from === source ? y1 : y2;
  const ty = to === target ? y2 : y1;
  const x1 = from.x + nodeWidth;
  const x2 = to.x;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${fy} C ${mid} ${fy}, ${mid} ${ty}, ${x2} ${ty}`;
}
