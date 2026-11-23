import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GRAPH_FILTER,
  edgePath,
  isUnusedWindow,
  lastReadInWords,
  layoutGraph,
  neighbourhood,
  nodeLink,
  parseGraph,
  parseUnused,
  unusedSecretDeletePath,
  unusedSecretLink,
  visibleGraph,
} from '../src/lib/reports';
import { reportsPath } from '../src/lib/routes';
import type { DependencyGraph, DependencyNode, UnusedSecret } from '../src/types/api';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 23, 12);

const node = (id: string, type: DependencyNode['type'], application: string | null = null, environments: string[] = []): DependencyNode => ({
  id,
  type,
  label: id.split(/[:/]/).at(-1)!,
  application,
  environments,
});

const edge = (source: string, target: string, kind: 'owns' | 'reads' | 'overrides' | 'inherits') => ({
  source,
  target,
  kind,
  environments: [] as string[],
  lastReadAt: null,
  readCount: null,
});

const GRAPH: DependencyGraph = {
  generatedAt: '2026-11-23T00:00:00Z',
  nodes: [
    node('app:web', 'application'),
    node('app:batch', 'application'),
    node('secret:web/Db', 'secret', 'web'),
    node('global-secret:Db', 'global-secret'),
    node('global-secret:Smtp', 'global-secret'),
    node('config:web/Timeout', 'config-key', 'web', ['dev', 'prod']),
    node('global-config:Timeout', 'global-config-key', null, ['*']),
    node('global-config:Region', 'global-config-key', null, ['*']),
  ],
  edges: [
    edge('app:web', 'secret:web/Db', 'owns'),
    edge('secret:web/Db', 'global-secret:Db', 'overrides'),
    edge('app:batch', 'global-secret:Db', 'reads'),
    edge('app:web', 'global-secret:Smtp', 'reads'),
    edge('app:web', 'config:web/Timeout', 'owns'),
    edge('config:web/Timeout', 'global-config:Timeout', 'overrides'),
    edge('app:web', 'global-config:Region', 'inherits'),
    edge('app:batch', 'global-config:Region', 'inherits'),
    edge('app:batch', 'global-config:Timeout', 'inherits'),
  ],
};

const unused = (over: Partial<UnusedSecret> = {}): UnusedSecret => ({
  application: 'web',
  applicationName: 'Web',
  secret: 'Db',
  isGlobal: false,
  createdAt: '2026-01-01T00:00:00Z',
  lastReadAt: null,
  readCount: 0,
  reads: [],
  ...over,
});

describe('reports routes', () => {
  it('omits defaults and encodes params', () => {
    expect(reportsPath()).toBe('/reports');
    expect(reportsPath('unused', { days: 90 })).toBe('/reports');
    expect(reportsPath('unused', { days: 30 })).toBe('/reports?days=30');
    expect(reportsPath('dependencies')).toBe('/reports/dependencies');
    expect(reportsPath('dependencies', { focus: 'secret:web/Db' })).toBe('/reports/dependencies?focus=secret%3Aweb%2FDb');
  });

  it('accepts only offered windows', () => {
    expect(isUnusedWindow('30')).toBe(true);
    expect(isUnusedWindow('45')).toBe(false);
    expect(isUnusedWindow(null)).toBe(false);
  });
});

describe('parseUnused', () => {
  it('normalises the payload', () => {
    const parsed = parseUnused({
      days: 30,
      since: 's',
      items: [
        { application: 'web', secret: 'Db', isGlobal: false, lastReadAt: null, readCount: 2, reads: [{ application: 'web', environment: 'prod', lastReadAt: 'x', readCount: 2 }, 'junk'] },
        'junk',
      ],
    });
    expect(parsed.days).toBe(30);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].reads).toEqual([{ application: 'web', environment: 'prod', lastReadAt: 'x', readCount: 2 }]);
    expect(parsed.items[0].applicationName).toBeNull();
  });

  it('rejects something that is not a report', () => {
    expect(() => parseUnused({ status: 404 })).toThrow();
    expect(() => parseUnused(null)).toThrow();
  });

  it('falls back to defaults for missing fields', () => {
    const parsed = parseUnused({ items: [{}] });
    expect(parsed.days).toBe(90);
    expect(parsed.items[0]).toMatchObject({ secret: '', isGlobal: false, readCount: 0, reads: [] });
  });
});

describe('parseGraph', () => {
  it('drops unknown node types and dangling or unknown edges', () => {
    const parsed = parseGraph({
      nodes: [{ id: 'app:a', type: 'application', label: 'A' }, { id: 'x', type: 'mystery' }, { id: 'secret:a/S', type: 'secret', application: 'a' }],
      edges: [
        { source: 'app:a', target: 'secret:a/S', kind: 'owns' },
        { source: 'app:a', target: 'x', kind: 'owns' },
        { source: 'app:a', target: 'secret:a/S', kind: 'weird' },
        { source: 'app:a', target: 'secret:a/S', kind: 'reads', environments: ['prod', 1], readCount: 4 },
      ],
    });
    expect(parsed.nodes.map((n) => n.id)).toEqual(['app:a', 'secret:a/S']);
    expect(parsed.nodes[1].label).toBe('secret:a/S');
    expect(parsed.edges).toHaveLength(2);
    expect(parsed.edges[1]).toMatchObject({ kind: 'reads', environments: ['prod'], readCount: 4, lastReadAt: null });
  });

  it('rejects something that is not a graph', () => {
    expect(() => parseGraph({ nodes: [] })).toThrow();
  });
});

describe('lastReadInWords', () => {
  it('describes ages', () => {
    expect(lastReadInWords(null, NOW)).toBe('never');
    expect(lastReadInWords('nope', NOW)).toBe('unknown');
    expect(lastReadInWords(new Date(NOW - 3600_000).toISOString(), NOW)).toBe('today');
    expect(lastReadInWords(new Date(NOW - DAY).toISOString(), NOW)).toBe('1 day ago');
    expect(lastReadInWords(new Date(NOW - 12.5 * DAY).toISOString(), NOW)).toBe('12 days ago');
  });
});

describe('links', () => {
  it('opens global secrets in Global and application secrets in a read environment', () => {
    expect(unusedSecretLink(unused({ isGlobal: true, application: null, secret: 'Smtp' }))).toBe('/global/secrets?key=Smtp');
    expect(
      unusedSecretLink(unused({ reads: [{ application: 'web', environment: 'prod', lastReadAt: 'x', readCount: 1 }] }), 'dev')
    ).toBe('/apps/web/prod/secrets?key=Db');
    expect(unusedSecretLink(unused(), 'dev')).toBe('/apps/web/dev/secrets?key=Db');
    expect(unusedSecretLink(unused())).toBe('/apps/web');
  });

  it('builds delete paths', () => {
    expect(unusedSecretDeletePath(unused({ secret: 'A B' }))).toBe('/applications/web/secrets/A%20B');
    expect(unusedSecretDeletePath(unused({ isGlobal: true, application: null }))).toBe('/global/secrets/Db');
  });

  it('links every node type', () => {
    const byId = (id: string) => GRAPH.nodes.find((n) => n.id === id)!;
    expect(nodeLink(byId('app:web'))).toBe('/apps/web');
    expect(nodeLink(byId('secret:web/Db'), 'prod')).toBe('/apps/web/prod/secrets?key=Db');
    expect(nodeLink(byId('secret:web/Db'))).toBe('/apps/web');
    expect(nodeLink(byId('global-secret:Db'))).toBe('/global/secrets?key=Db');
    expect(nodeLink(byId('config:web/Timeout'))).toBe('/apps/web/dev/config?key=Timeout');
    expect(nodeLink({ ...byId('config:web/Timeout'), environments: [] })).toBe('/apps/web?key=Timeout');
    expect(nodeLink(byId('global-config:Region'))).toBe('/global/config?key=Region');
    expect(nodeLink({ ...byId('secret:web/Db'), application: null })).toBeNull();
    expect(nodeLink({ ...byId('config:web/Timeout'), application: null })).toBeNull();
  });
});

describe('neighbourhood', () => {
  it('reaches globals an application overrides', () => {
    const n = neighbourhood(GRAPH, 'app:web');
    expect(n).toEqual(
      new Set(['app:web', 'secret:web/Db', 'global-secret:Db', 'global-secret:Smtp', 'config:web/Timeout', 'global-config:Timeout', 'global-config:Region'])
    );
  });

  it('reaches the owners of entries that override a global, but not other inheritors', () => {
    const n = neighbourhood(GRAPH, 'global-secret:Db');
    expect(n).toEqual(new Set(['global-secret:Db', 'secret:web/Db', 'app:web', 'app:batch']));
    const region = neighbourhood(GRAPH, 'global-config:Region');
    expect(region).toEqual(new Set(['global-config:Region', 'app:web', 'app:batch']));
  });
});

describe('visibleGraph', () => {
  it('hides configuration keys by default and keeps only edges between visible nodes', () => {
    const v = visibleGraph(GRAPH, DEFAULT_GRAPH_FILTER);
    expect(v.nodes.some((n) => n.type === 'config-key' || n.type === 'global-config-key')).toBe(false);
    expect(v.edges.map((e) => e.kind).sort()).toEqual(['overrides', 'owns', 'reads', 'reads']);
  });

  it('filters edge kinds and focuses a neighbourhood, keeping a focused key visible', () => {
    const v = visibleGraph(GRAPH, { showConfig: true, kinds: new Set(['inherits']) }, 'app:batch');
    expect(v.nodes.map((n) => n.id).sort()).toEqual(['app:batch', 'global-config:Region', 'global-config:Timeout', 'global-secret:Db']);
    expect(v.edges.every((e) => e.kind === 'inherits')).toBe(true);

    const key = visibleGraph(GRAPH, DEFAULT_GRAPH_FILTER, 'global-config:Region');
    expect(key.nodes.map((n) => n.id).sort()).toEqual(['app:batch', 'app:web', 'global-config:Region']);
  });

  it('ignores a focus that is not in the graph', () => {
    expect(visibleGraph(GRAPH, DEFAULT_GRAPH_FILTER, 'app:gone').nodes).toHaveLength(5);
  });
});

describe('layout', () => {
  it('places applications, secrets and keys in columns, globals last', () => {
    const layout = layoutGraph(GRAPH.nodes);
    const at = (id: string) => layout.nodes.find((n) => n.id === id)!;
    expect(at('app:batch').column).toBe(0);
    expect(at('app:batch').y).toBeLessThan(at('app:web').y);
    expect(at('secret:web/Db').column).toBe(1);
    expect(at('secret:web/Db').y).toBeLessThan(at('global-secret:Db').y);
    expect(at('global-config:Region').column).toBe(2);
    expect(layout.width).toBeGreaterThan(at('global-config:Region').x);
    expect(layout.height).toBeGreaterThan(at('global-secret:Smtp').y);
    expect(layoutGraph([]).height).toBeGreaterThan(0);
  });

  it('draws arcs within a column and curves across columns either way', () => {
    const layout = layoutGraph(GRAPH.nodes);
    const at = (id: string) => layout.nodes.find((n) => n.id === id)!;
    const arc = edgePath(at('secret:web/Db'), at('global-secret:Db'));
    expect(arc.startsWith(`M ${at('secret:web/Db').x + 220} `)).toBe(true);
    const forward = edgePath(at('app:web'), at('global-secret:Db'));
    const backward = edgePath(at('global-secret:Db'), at('app:web'));
    expect(forward).toBe(backward);
  });
});
