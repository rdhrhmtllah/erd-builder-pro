import { describe, expect, it } from 'vitest';
import { generateTableMockJSON, generateTableMockSQL } from '../mock-data-generator';
import { Entity } from '@/types';

describe('Mock Data Generator', () => {
  const sampleTable: Entity = {
    id: 'ent-users',
    name: 'users',
    x: 0,
    y: 0,
    color: '#6366f1',
    columns: [
      { id: '1', name: 'id', type: 'uuid', is_pk: true, is_nullable: false },
      { id: '2', name: 'email', type: 'varchar', is_pk: false, is_nullable: false },
      { id: '3', name: 'is_active', type: 'boolean', is_pk: false, is_nullable: true },
      { id: '4', name: 'created_at', type: 'timestamp', is_pk: false, is_nullable: false },
    ],
  };

  it('generates valid JSON mock data with semantic field values', () => {
    const jsonStr = generateTableMockJSON(sampleTable, 5);
    const parsed = JSON.parse(jsonStr);
    expect(parsed).toHaveLength(5);
    expect(parsed[0].id).toContain('a0eebc99');
    expect(parsed[0].email).toContain('@example.com');
    expect(typeof parsed[0].is_active).toBe('boolean');
  });

  it('generates valid SQL INSERT statements', () => {
    const sql = generateTableMockSQL(sampleTable, 3);
    expect(sql).toContain('INSERT INTO "users"');
    expect(sql).toContain('@example.com');
  });
});
