import type { Edge, Node } from '@xyflow/react';

export type ErdSubjectArea = {
  id: string;
  name: string;
  color: string;
  node_ids: string[];
  parent_id?: string | null;
  effective_node_ids?: string[];
  depth?: number;
  viewport_x: number;
  viewport_y: number;
  viewport_zoom: number;
  created_at?: string;
  updated_at?: string;
};

export function normalizeSubjectAreaNodeIds(nodeIds: string[]): string[] {
  return [...new Set(nodeIds.map(id => id.trim()).filter(Boolean))];
}

/**
 * Produce a stable depth-first tree for display. The API returns a flat list;
 * sorting only by depth would separate children from their actual parent.
 * Orphans and malformed cycles are retained as roots so they remain editable.
 */
export function flattenSubjectAreaTree(areas: ErdSubjectArea[]): ErdSubjectArea[] {
  const byId = new Map(areas.map(area => [area.id, area]));
  const children = new Map<string, ErdSubjectArea[]>();
  const roots: ErdSubjectArea[] = [];
  const byName = (a: ErdSubjectArea, b: ErdSubjectArea) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

  for (const area of areas) {
    if (area.parent_id && area.parent_id !== area.id && byId.has(area.parent_id)) {
      children.set(area.parent_id, [...(children.get(area.parent_id) || []), area]);
    } else {
      roots.push(area);
    }
  }

  const result: ErdSubjectArea[] = [];
  const visited = new Set<string>();
  const visit = (area: ErdSubjectArea, depth: number) => {
    if (visited.has(area.id)) return;
    visited.add(area.id);
    result.push({ ...area, depth });
    for (const child of [...(children.get(area.id) || [])].sort(byName)) visit(child, depth + 1);
  };
  for (const root of [...roots].sort(byName)) visit(root, 0);
  for (const area of [...areas].sort(byName)) if (!visited.has(area.id)) visit(area, 0);
  return result;
}

export function getSubjectAreaDescendantIds(areas: ErdSubjectArea[], areaId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const area of areas) {
    if (area.parent_id) children.set(area.parent_id, [...(children.get(area.parent_id) || []), area.id]);
  }
  const result = new Set<string>();
  const visit = (id: string) => {
    for (const child of children.get(id) || []) {
      if (result.has(child)) continue;
      result.add(child);
      visit(child);
    }
  };
  visit(areaId);
  return result;
}

export function getSubjectAreaVisibility(nodes: Node[], edges: Edge[], nodeIds: string[]) {
  const existing = new Set(nodes.map(node => node.id));
  const visibleNodeIds = new Set(normalizeSubjectAreaNodeIds(nodeIds).filter(id => existing.has(id)));
  const visibleEdgeIds = new Set(edges
    .filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map(edge => edge.id));
  return { visibleNodeIds, visibleEdgeIds };
}

export type SubjectAreaBoundary = {
  internal_relations: number;
  external_relations: number;
  neighbours: Array<{ node_id: string; relation_count: number; direction: 'incoming' | 'outgoing' | 'both' }>;
};

/** Summarise cross-Area relationships without duplicating external tables. */
export function getSubjectAreaBoundary(nodes: Node[], edges: Edge[], nodeIds: string[]): SubjectAreaBoundary {
  const existing = new Set(nodes.map(node => node.id));
  const inside = new Set(normalizeSubjectAreaNodeIds(nodeIds).filter(id => existing.has(id)));
  let internalRelations = 0;
  const neighbours = new Map<string, { relation_count: number; incoming: boolean; outgoing: boolean }>();
  for (const edge of edges) {
    const sourceInside = inside.has(edge.source);
    const targetInside = inside.has(edge.target);
    if (sourceInside && targetInside) { internalRelations += 1; continue; }
    if (sourceInside === targetInside) continue;
    const nodeId = sourceInside ? edge.target : edge.source;
    const entry = neighbours.get(nodeId) || { relation_count: 0, incoming: false, outgoing: false };
    entry.relation_count += 1;
    if (sourceInside) entry.outgoing = true; else entry.incoming = true;
    neighbours.set(nodeId, entry);
  }
  return {
    internal_relations: internalRelations,
    external_relations: [...neighbours.values()].reduce((total, entry) => total + entry.relation_count, 0),
    neighbours: [...neighbours.entries()].map(([node_id, entry]) => ({
      node_id, relation_count: entry.relation_count,
      direction: (entry.incoming && entry.outgoing ? 'both' : entry.incoming ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing' | 'both',
    })).sort((a, b) => b.relation_count - a.relation_count || a.node_id.localeCompare(b.node_id)),
  };
}
