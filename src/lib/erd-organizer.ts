import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { suggestErdOrganizations as suggestFromTables } from '../../shared/erd-organizer';

export type { ErdOrganizationSuggestion } from '../../shared/erd-organizer';

/**
 * Canvas adapter for the shared organizer. The grouping itself lives in
 * shared/erd-organizer so the Organize panel and the MCP tools always agree.
 */
export function suggestErdOrganizations(nodes: Node<Entity>[], edges: Edge[]) {
  return suggestFromTables(
    nodes.map(node => ({ ...(node.data || {}), id: node.id })),
    edges.map(edge => ({ source: edge.source, target: edge.target })),
  );
}
