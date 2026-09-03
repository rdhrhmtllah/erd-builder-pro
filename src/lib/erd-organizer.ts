import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { governanceFrom } from '../../shared/erd-governance';

export type ErdOrganizationSuggestion = {
  id: string;
  name: string;
  color: string;
  node_ids: string[];
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  internal_relations: number;
  external_relations: number;
};

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];
const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'data', 'info', 'item', 'items', 'table', 'tbl']);

function tokens(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map(token => token.toLowerCase().trim())
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function title(value: string): string {
  return value.split(/\s+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function tableTokens(node: Node<Entity>): string[] {
  const data = node.data || ({} as Entity);
  const governance = governanceFrom(data);
  const names = [data.name, governance.domain, ...(data.columns || []).slice(0, 12).map(column => column.name)];
  return [...new Set(names.flatMap(value => tokens(String(value || ''))))];
}

function relationCounts(nodeIds: Set<string>, edges: Edge[]) {
  let internal = 0;
  let external = 0;
  for (const edge of edges) {
    const source = nodeIds.has(edge.source);
    const target = nodeIds.has(edge.target);
    if (source && target) internal += 1;
    else if (source !== target) external += 1;
  }
  return { internal, external };
}

/**
 * Make deterministic, explainable domain suggestions without sending schema
 * content to an external service. Explicit governance domains win, followed by
 * shared table-name prefixes and finally connected-table clusters.
 */
export function suggestErdOrganizations(nodes: Node<Entity>[], edges: Edge[]): ErdOrganizationSuggestion[] {
  if (!nodes.length) return [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const adjacency = new Map<string, Set<string>>(nodes.map(node => [node.id, new Set()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const groups = new Map<string, { ids: string[]; reasons: Set<string>; confidence: 'high' | 'medium' | 'low'; unassigned?: boolean }>();
  const assigned = new Set<string>();
  const addGroup = (key: string, ids: string[], reason: string, confidence: 'high' | 'medium' | 'low') => {
    const valid = [...new Set(ids)].filter(id => nodeById.has(id) && !assigned.has(id));
    if (valid.length < 2) return;
    groups.set(key, { ids: valid, reasons: new Set([reason]), confidence });
    valid.forEach(id => assigned.add(id));
  };

  const explicit = new Map<string, string[]>();
  for (const node of nodes) {
    const domain = governanceFrom(node.data || {}).domain?.trim();
    if (domain) explicit.set(domain.toLowerCase(), [...(explicit.get(domain.toLowerCase()) || []), node.id]);
  }
  for (const [key, ids] of [...explicit.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    addGroup(`domain:${key}`, ids, 'Existing Data Dictionary domain metadata', 'high');
  }

  const prefixGroups = new Map<string, string[]>();
  for (const node of nodes) {
    const nameTokens = tokens(String(node.data?.name || node.id));
    const prefix = nameTokens[0] || 'general';
    prefixGroups.set(prefix, [...(prefixGroups.get(prefix) || []), node.id]);
  }
  for (const [prefix, ids] of [...prefixGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    addGroup(`prefix:${prefix}`, ids, `Shared table naming prefix “${prefix}”`, ids.length >= 3 ? 'high' : 'medium');
  }

  const unassigned = nodes.filter(node => !assigned.has(node.id));
  const visited = new Set<string>();
  for (const node of unassigned) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length) {
      const id = queue.shift()!;
      component.push(id);
      for (const next of adjacency.get(id) || []) {
        if (!visited.has(next) && !assigned.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    addGroup(`connected:${node.id}`, component, 'Connected by foreign-key relationships', component.length >= 3 ? 'medium' : 'low');
  }

  const leftovers = nodes.filter(node => !assigned.has(node.id));
  if (leftovers.length) {
    groups.set('shared:unassigned', {
      ids: leftovers.map(node => node.id),
      reasons: new Set(['No strong domain or relationship signal found']),
      confidence: 'low',
      unassigned: true,
    });
  }

  return [...groups.values()]
    .map((group, index) => {
      const groupNodes = group.ids.map(id => nodeById.get(id)!).filter(Boolean);
      const commonTokens = new Map<string, number>();
      groupNodes.forEach(node => tableTokens(node).forEach(token => commonTokens.set(token, (commonTokens.get(token) || 0) + 1)));
      const strongest = [...commonTokens.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      const key = strongest || (group.ids.length === 1 ? String(groupNodes[0]?.data?.name || 'Other') : 'Shared');
      const counts = relationCounts(new Set(group.ids), edges);
      return {
        id: `suggestion-${index + 1}`,
        name: group.unassigned ? 'Shared / Unassigned' : title(key),
        color: COLORS[index % COLORS.length],
        node_ids: group.ids,
        confidence: group.confidence,
        reasons: [...group.reasons],
        internal_relations: counts.internal,
        external_relations: counts.external,
      };
    })
    .sort((a, b) => b.node_ids.length - a.node_ids.length || a.name.localeCompare(b.name));
}
