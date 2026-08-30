import type { Edge, Node } from '@xyflow/react';

export type ErdSubjectArea = {
  id: string;
  name: string;
  color: string;
  node_ids: string[];
  viewport_x: number;
  viewport_y: number;
  viewport_zoom: number;
  created_at?: string;
  updated_at?: string;
};

export function normalizeSubjectAreaNodeIds(nodeIds: string[]): string[] {
  return [...new Set(nodeIds.map(id => id.trim()).filter(Boolean))];
}

export function getSubjectAreaVisibility(nodes: Node[], edges: Edge[], nodeIds: string[]) {
  const existing = new Set(nodes.map(node => node.id));
  const visibleNodeIds = new Set(normalizeSubjectAreaNodeIds(nodeIds).filter(id => existing.has(id)));
  const visibleEdgeIds = new Set(edges
    .filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map(edge => edge.id));
  return { visibleNodeIds, visibleEdgeIds };
}
