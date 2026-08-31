import { describe, expect, it } from 'vitest';
import { flattenSubjectAreaTree, getSubjectAreaBoundary, getSubjectAreaDescendantIds, getSubjectAreaVisibility, normalizeSubjectAreaNodeIds } from '../erd-subject-areas';

describe('ERD subject areas', () => {
  it('normalizes duplicate and blank table ids without changing their order', () => {
    expect(normalizeSubjectAreaNodeIds([' users ', '', 'orders', 'users', 'orders']))
      .toEqual(['users', 'orders']);
  });

  it('renders every child directly below its parent and tracks descendants', () => {
    const area = (id: string, name: string, parent_id: string | null = null): any => ({ id, name, parent_id, color: '#6366f1', node_ids: [], viewport_x: 0, viewport_y: 0, viewport_zoom: 1 });
    const areas = [area('child-b', 'B child', 'root-b'), area('root-a', 'A root'), area('child-a', 'A child', 'root-a'), area('root-b', 'B root'), area('grandchild', 'Grandchild', 'child-a')];
    expect(flattenSubjectAreaTree(areas).map(item => [item.id, item.depth])).toEqual([
      ['root-a', 0], ['child-a', 1], ['grandchild', 2], ['root-b', 0], ['child-b', 1],
    ]);
    expect([...getSubjectAreaDescendantIds(areas, 'root-a')]).toEqual(['child-a', 'grandchild']);
  });

  it('summarizes internal and cross-Area relations as drill-down portals', () => {
    const nodes: any[] = [{ id: 'users' }, { id: 'orders' }, { id: 'payments' }];
    const edges: any[] = [
      { id: 'users-orders', source: 'users', target: 'orders' },
      { id: 'orders-payments', source: 'orders', target: 'payments' },
      { id: 'payments-orders', source: 'payments', target: 'orders' },
    ];
    expect(getSubjectAreaBoundary(nodes, edges, ['users', 'orders'])).toEqual({
      internal_relations: 1, external_relations: 2,
      neighbours: [{ node_id: 'payments', relation_count: 2, direction: 'both' }],
    });
  });

  it('keeps only existing area tables and relationships fully inside the area', () => {
    const nodes = ['users', 'orders', 'products'].map(id => ({ id, position: { x: 0, y: 0 }, data: {} }));
    const edges = [
      { id: 'user-orders', source: 'users', target: 'orders' },
      { id: 'order-products', source: 'orders', target: 'products' },
      { id: 'stale', source: 'missing', target: 'users' },
    ];
    const result = getSubjectAreaVisibility(nodes, edges, ['users', 'orders', 'missing']);

    expect([...result.visibleNodeIds]).toEqual(['users', 'orders']);
    expect([...result.visibleEdgeIds]).toEqual(['user-orders']);
  });
});
