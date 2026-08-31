import { describe, expect, it } from 'vitest';
import { analyzeErdImpact } from '../../../shared/erd-impact';

const tables = [
  { id: 'users', name: 'users', columns: [{ id: 'users-id', name: 'id', is_pk: true }] },
  { id: 'orders', name: 'orders', columns: [{ id: 'orders-id', name: 'id', is_pk: true }, { id: 'orders-user', name: 'user_id' }] },
  { id: 'items', name: 'order_items', columns: [{ id: 'items-order', name: 'order_id' }] },
  { id: 'countries', name: 'countries', columns: [{ id: 'countries-id', name: 'id', is_pk: true }] },
];
const relationships = [
  { id: 'orders-users', source_entity_id: 'orders', source_column_id: 'orders-user', target_entity_id: 'users', target_column_id: 'users-id' },
  { id: 'items-orders', source_entity_id: 'items', source_column_id: 'items-order', target_entity_id: 'orders', target_column_id: 'orders-id' },
];

describe('ERD impact analysis', () => {
  it('finds direct and transitive dependants for table deletion', () => {
    const report = analyzeErdImpact(tables, relationships, { operation: 'table-delete', table_id: 'users' });
    expect(report.risk).toBe('critical');
    expect(report.direct_tables).toEqual([expect.objectContaining({ id: 'orders', depth: 1, direction: 'dependent' })]);
    expect(report.transitive_tables).toEqual([expect.objectContaining({
      id: 'items', depth: 2, path_table_names: ['users', 'orders', 'order_items'],
    })]);
    expect(report.affected_relationship_ids).toEqual(expect.arrayContaining(['orders-users', 'items-orders']));
  });

  it('limits column changes to relationships using the selected column', () => {
    const report = analyzeErdImpact(tables, relationships, {
      operation: 'column-type-change', table_id: 'orders', column_id: 'orders-user',
    });
    expect(report.direct_tables).toEqual([expect.objectContaining({ id: 'users', direction: 'referenced' })]);
    expect(report.transitive_tables).toEqual([]);
    expect(report.affected_relationship_ids).toEqual(['orders-users']);
    expect(report.affected_columns.map(item => item.column_name)).toEqual(['user_id', 'id']);
  });

  it('raises the blast-radius score for unique keys as well as primary keys', () => {
    const withUnique = tables.map(table => table.id === 'orders'
      ? { ...table, columns: table.columns.map(column => column.id === 'orders-user' ? { ...column, is_pk: false, is_unique: true } : column) }
      : table);
    const keyed = analyzeErdImpact(withUnique, relationships, { operation: 'column-type-change', table_id: 'orders', column_id: 'orders-user' });
    const regular = analyzeErdImpact(tables, relationships, { operation: 'column-type-change', table_id: 'orders', column_id: 'orders-user' });
    expect(keyed.risk_score).toBe(regular.risk_score + 10);
  });

  it('validates selected tables, columns, and operations', () => {
    expect(() => analyzeErdImpact(tables, relationships, { operation: 'table-delete', table_id: 'missing' })).toThrow(/Table not found/);
    expect(() => analyzeErdImpact(tables, relationships, { operation: 'column-delete', table_id: 'users' })).toThrow(/Column not found/);
  });

  it('handles circular dependencies without repeating tables', () => {
    const circular = [...relationships, {
      id: 'users-orders', source_entity_id: 'users', source_column_id: 'users-id', target_entity_id: 'orders', target_column_id: 'orders-id',
    }];
    const report = analyzeErdImpact(tables, circular, { operation: 'table-delete', table_id: 'users' });
    expect(report.affected_table_ids).toEqual(['orders', 'items']);
    expect(new Set(report.affected_relationship_ids).size).toBe(report.affected_relationship_ids.length);
  });
});
