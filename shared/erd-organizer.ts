import { governanceFrom } from './erd-governance';

/**
 * Deterministic, explainable grouping of an ERD into candidate Subject Areas.
 *
 * Lives in shared/ so the canvas and the MCP tools reach the identical result —
 * an agent that proposes different groups from the ones the Organize button
 * shows would be worse than no suggestion at all. Nothing here leaves the
 * server: the signals are table names, existing Data Dictionary domains, and
 * the foreign-key graph.
 */

export type ErdOrganizerTable = {
  id: string;
  name?: string | null;
  columns?: Array<{ name?: string | null }> | null;
  governance?: unknown;
  governance_data?: unknown;
  governanceData?: unknown;
};

export type ErdOrganizerRelationship = { source: string; target: string };

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

function tableTokens(table: ErdOrganizerTable): string[] {
  const governance = governanceFrom(table);
  const names = [table.name, governance.domain, ...(table.columns || []).slice(0, 12).map(column => column?.name)];
  return [...new Set(names.flatMap(value => tokens(String(value || ''))))];
}

function relationCounts(ids: Set<string>, relationships: ErdOrganizerRelationship[]) {
  let internal = 0;
  let external = 0;
  for (const relationship of relationships) {
    const source = ids.has(relationship.source);
    const target = ids.has(relationship.target);
    if (source && target) internal += 1;
    else if (source !== target) external += 1;
  }
  return { internal, external };
}

/**
 * Explicit Data Dictionary domains win, then shared table-name prefixes, then
 * clusters that are connected by foreign keys. Whatever is left is surfaced as
 * "Shared / Unassigned" rather than being hidden.
 */
export function suggestErdOrganizations(
  tables: ErdOrganizerTable[],
  relationships: ErdOrganizerRelationship[],
): ErdOrganizationSuggestion[] {
  if (!tables.length) return [];

  const tableById = new Map(tables.map(table => [table.id, table]));
  const adjacency = new Map<string, Set<string>>(tables.map(table => [table.id, new Set<string>()]));
  for (const relationship of relationships) {
    adjacency.get(relationship.source)?.add(relationship.target);
    adjacency.get(relationship.target)?.add(relationship.source);
  }

  type Group = { ids: string[]; reasons: Set<string>; confidence: 'high' | 'medium' | 'low'; unassigned?: boolean };
  const groups = new Map<string, Group>();
  const assigned = new Set<string>();

  const addGroup = (key: string, ids: string[], reason: string, confidence: Group['confidence']) => {
    const valid = [...new Set(ids)].filter(id => tableById.has(id) && !assigned.has(id));
    if (valid.length < 2) return;
    groups.set(key, { ids: valid, reasons: new Set([reason]), confidence });
    valid.forEach(id => assigned.add(id));
  };

  const explicit = new Map<string, string[]>();
  for (const table of tables) {
    const domain = governanceFrom(table).domain?.trim();
    if (domain) explicit.set(domain.toLowerCase(), [...(explicit.get(domain.toLowerCase()) || []), table.id]);
  }
  for (const [key, ids] of [...explicit.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    addGroup(`domain:${key}`, ids, 'Existing Data Dictionary domain metadata', 'high');
  }

  const prefixGroups = new Map<string, string[]>();
  for (const table of tables) {
    const prefix = tokens(String(table.name || table.id))[0] || 'general';
    prefixGroups.set(prefix, [...(prefixGroups.get(prefix) || []), table.id]);
  }
  for (const [prefix, ids] of [...prefixGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    addGroup(`prefix:${prefix}`, ids, `Shared table naming prefix “${prefix}”`, ids.length >= 3 ? 'high' : 'medium');
  }

  const visited = new Set<string>();
  for (const table of tables.filter(item => !assigned.has(item.id))) {
    if (visited.has(table.id)) continue;
    const component: string[] = [];
    const queue = [table.id];
    visited.add(table.id);
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
    addGroup(`connected:${table.id}`, component, 'Connected by foreign-key relationships', component.length >= 3 ? 'medium' : 'low');
  }

  const leftovers = tables.filter(table => !assigned.has(table.id));
  if (leftovers.length) {
    groups.set('shared:unassigned', {
      ids: leftovers.map(table => table.id),
      reasons: new Set(['No strong domain or relationship signal found']),
      confidence: 'low',
      unassigned: true,
    });
  }

  return [...groups.values()]
    .map((group, index) => {
      const members = group.ids.map(id => tableById.get(id)!).filter(Boolean);
      const commonTokens = new Map<string, number>();
      members.forEach(table => tableTokens(table).forEach(token => commonTokens.set(token, (commonTokens.get(token) || 0) + 1)));
      const strongest = [...commonTokens.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      const key = strongest || (group.ids.length === 1 ? String(members[0]?.name || 'Other') : 'Shared');
      const counts = relationCounts(new Set(group.ids), relationships);
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
