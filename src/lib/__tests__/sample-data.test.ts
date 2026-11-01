import { describe, expect, it } from 'vitest';
import { Entity } from '@/types';

describe('Table Sample Data & Live Records', () => {
  it('stores and attaches sample_data array to entity', () => {
    const table: Entity = {
      id: 'table-users',
      name: 'users',
      x: 100,
      y: 100,
      color: '#6366f1',
      columns: [
        { id: '1', name: 'id', type: 'uuid', is_pk: true, is_nullable: false },
        { id: '2', name: 'email', type: 'varchar', is_pk: false, is_nullable: false },
        { id: '3', name: 'status', type: 'varchar', is_pk: false, is_nullable: true },
      ],
      sample_data: [
        { id: 'usr-1', email: 'alice@example.com', status: 'active' },
        { id: 'usr-2', email: 'bob@example.com', status: 'pending' },
      ],
    };

    expect(table.sample_data).toHaveLength(2);
    expect(table.sample_data?.[0].email).toBe('alice@example.com');
    expect(table.sample_data?.[1].status).toBe('pending');
  });

  it('serializes and deserializes sample_data cleanly without mutating columns', () => {
    const table: Entity = {
      id: 'table-orders',
      name: 'orders',
      x: 0,
      y: 0,
      color: '#10b981',
      columns: [{ id: '1', name: 'total', type: 'numeric', is_pk: false, is_nullable: false }],
      sample_data: [{ total: 150.5 }],
    };

    const serialized = JSON.stringify(table);
    const restored = JSON.parse(serialized);
    expect(restored.sample_data[0].total).toBe(150.5);
    expect(restored.columns[0].name).toBe('total');
  });
});
