import type { Node } from '@xyflow/react';

/**
 * Selection helpers for the ERD canvas. React Flow owns `node.selected`, so these
 * only ever flip that flag — never positions, data, or the node identity of rows
 * that already hold the wanted state.
 */

/**
 * Select every table the user can currently see. Inside a Subject Area only its
 * members are selectable, so "select all" never grabs tables hidden off-view.
 */
export function applySelectAllTables<T extends Node>(nodes: T[], visibleNodeIds?: Set<string> | null): T[] {
  return nodes.map(node => {
    const selectable = !visibleNodeIds || visibleNodeIds.has(node.id);
    return Boolean(node.selected) === selectable ? node : { ...node, selected: selectable };
  });
}

export function applyClearSelection<T extends Node>(nodes: T[]): T[] {
  return nodes.map(node => (node.selected ? { ...node, selected: false } : node));
}

/** Stable key for the current selection, so consumers can memoise on it. */
export function selectionKeyOf(nodes: Node[]): string {
  return nodes.filter(node => node.selected).map(node => node.id).join(' ');
}
