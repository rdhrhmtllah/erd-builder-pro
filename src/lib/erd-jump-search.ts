import type { Node } from '@xyflow/react';

export type JumpResult = {
  key: string;
  nodeId: string;
  title: string;
  color: string;
  subtitle?: string;
  badge?: string;
  columnId?: string;
  isPrimaryKey?: boolean;
};

export type JumpSearchResult = {
  results: JumpResult[];
  /** Matches beyond the cap, so the UI can tell the user to narrow the query. */
  truncated: number;
  columnMatches: number;
};

/**
 * Find tables and columns for the jump menu. An empty query lists the tables as
 * they are; a query matches table names and column names, returning each
 * matching column as its own result so it can be jumped to directly.
 */
export function buildJumpResults(nodes: Node[], query: string, maxResults: number): JumpSearchResult {
  const needle = query.trim().toLowerCase();
  const found: JumpResult[] = [];
  let columnMatches = 0;

  for (const node of nodes) {
    const data = node.data as Record<string, any>;
    const title = String(data.name || data.label || 'Unnamed component');
    const color = String(data.color || '#8b5cf6');
    const columns: any[] = Array.isArray(data.columns) ? data.columns : [];

    if (!needle) {
      found.push({
        key: node.id,
        nodeId: node.id,
        title,
        color,
        ...(columns.length ? { subtitle: `${columns.length} columns` } : {}),
      });
      continue;
    }

    if (title.toLowerCase().includes(needle)) {
      found.push({ key: node.id, nodeId: node.id, title, color });
    }

    for (const column of columns) {
      const columnName = String(column.name || '');
      if (!columnName.toLowerCase().includes(needle)) continue;
      columnMatches += 1;
      found.push({
        key: `${node.id}:${column.id}`,
        nodeId: node.id,
        columnId: String(column.id),
        title: columnName,
        subtitle: title,
        badge: String(column.type || ''),
        isPrimaryKey: Boolean(column.is_pk),
        color,
      });
    }
  }

  return {
    results: found.slice(0, maxResults),
    truncated: Math.max(0, found.length - maxResults),
    columnMatches,
  };
}
