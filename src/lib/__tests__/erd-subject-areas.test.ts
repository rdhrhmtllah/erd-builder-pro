import { describe, expect, it } from 'vitest';
import { getSubjectAreaVisibility, normalizeSubjectAreaNodeIds } from '../erd-subject-areas';

describe('ERD subject areas', () => {
  it('normalizes duplicate and blank table ids without changing their order', () => {
    expect(normalizeSubjectAreaNodeIds([' users ', '', 'orders', 'users', 'orders']))
      .toEqual(['users', 'orders']);
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
