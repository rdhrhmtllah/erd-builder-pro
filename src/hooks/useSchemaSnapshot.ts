import { useRef } from 'react';
import type { Node } from '@xyflow/react';

/**
 * True when two node lists describe the same schema, ignoring anything that a
 * drag or a click changes. Compares `data` by reference: applyNodeChanges keeps
 * that object identical for position and selection changes, and only swaps it
 * when the table is actually edited.
 */
export function isSameSchema<T extends Node>(previous: T[], next: T[]): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  return next.every((node, index) => {
    const before = previous[index];
    return before !== undefined && before.id === node.id && before.data === node.data;
  });
}

/**
 * Hand schema analyses a node list whose identity survives movement.
 *
 * Health and governance analysis never read node positions, yet React Flow
 * replaces every moved node object, so dragging one table re-ran both of them
 * on every animation frame — roughly 95% of the per-frame cost on a large ERD,
 * all of it producing the identical result.
 *
 * Consumers that do care about movement or selection must keep using the live
 * `nodes` array instead.
 */
export function useSchemaSnapshot<T extends Node>(nodes: T[]): T[] {
  const snapshot = useRef<T[]>(nodes);
  if (!isSameSchema(snapshot.current, nodes)) snapshot.current = nodes;
  return snapshot.current;
}
