import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { findErdRelationPath, traceErdRelations } from '../erd-focus';

const edges: Edge[] = [
  { id: 'orders-customer', source: 'orders', target: 'customers' },
  { id: 'items-order', source: 'items', target: 'orders' },
  { id: 'shipment-order', source: 'shipments', target: 'orders' },
  { id: 'audit-self', source: 'audit', target: 'audit' },
];

describe('ERD focus traversal', () => {
  it('traces upstream dependencies by depth', () => {
    const oneHop = traceErdRelations(edges, ['items'], 'upstream', 1);
    expect([...oneHop.nodeIds]).toEqual(['items', 'orders']);
    expect([...oneHop.edgeIds]).toEqual(['items-order']);

    const all = traceErdRelations(edges, ['items'], 'upstream', 'all');
    expect(all.nodeIds).toEqual(new Set(['items', 'orders', 'customers']));
  });

  it('traces downstream dependants', () => {
    const result = traceErdRelations(edges, ['customers'], 'downstream', 2);
    expect(result.nodeIds).toEqual(new Set(['customers', 'orders', 'items', 'shipments']));
  });

  it('handles cycles without looping', () => {
    const result = traceErdRelations(edges, ['audit'], 'both', 'all');
    expect(result.nodeIds).toEqual(new Set(['audit']));
    expect(result.edgeIds).toEqual(new Set(['audit-self']));
  });

  it('finds the shortest relation path in both directions', () => {
    expect(findErdRelationPath(edges, 'items', 'shipments')).toEqual({
      nodeIds: ['items', 'orders', 'shipments'],
      edgeIds: ['items-order', 'shipment-order'],
    });
  });

  it('respects direction and reports missing paths', () => {
    expect(findErdRelationPath(edges, 'customers', 'items', 'upstream')).toBeNull();
    expect(findErdRelationPath(edges, 'missing', 'items')).toBeNull();
  });
});
