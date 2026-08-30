import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { analyzeErdSchemaHealth } from '../erd-schema-health';

const table = (id: string, columns: any[], extras: Partial<Entity> = {}): Node<Entity> => ({
  id, position: { x: 0, y: 0 }, type: 'entity',
  data: { id, name: id, x: 0, y: 0, color: '#6366f1', columns, ...extras },
});
const column = (id: string, type = 'BIGINT', extra: Record<string, unknown> = {}) => ({
  id, name: id, type, is_pk: id === 'id', is_nullable: id !== 'id', ...extra,
});
const relation = (id: string, source: string, sourceColumn: string, target: string, targetColumn: string): Edge => ({
  id, source, target, sourceHandle: `col-${sourceColumn}-source`, targetHandle: `col-${targetColumn}-target`,
});

describe('ERD schema health', () => {
  it('returns a perfect score for a keyed, indexed, compatible schema', () => {
    const nodes = [
      table('users', [column('id')]),
      table('orders', [column('id'), column('user_id')], { indexes: [{ id: 'i1', entity_id: 'orders', name: 'orders_user_id_idx', column_ids: ['user_id'] }] }),
    ];
    const report = analyzeErdSchemaHealth(nodes, [relation('r1', 'orders', 'user_id', 'users', 'id')]);
    expect(report.score).toBe(100);
    expect(report.issues).toEqual([]);
  });

  it('finds missing and nullable primary keys, empty tables, and isolated tables', () => {
    const nodes = [
      table('logs', [column('message', 'TEXT')]),
      table('empty', []),
      table('bad_pk', [column('id', 'BIGINT', { is_nullable: true })]),
    ];
    const rules = analyzeErdSchemaHealth(nodes, []).issues.map(item => item.rule);
    expect(rules).toEqual(expect.arrayContaining(['missing-primary-key', 'nullable-primary-key', 'empty-table', 'isolated-table']));
  });

  it('finds broken, mismatched, non-key, unindexed, and duplicate relationships', () => {
    const nodes = [
      table('parents', [column('id'), column('code', 'TEXT')]),
      table('children', [column('id'), column('parent_code', 'INTEGER')]),
    ];
    const valid = relation('r1', 'children', 'parent_code', 'parents', 'code');
    const edges = [valid, { ...valid, id: 'r2' }, relation('broken', 'children', 'missing', 'parents', 'id')];
    const rules = analyzeErdSchemaHealth(nodes, edges).issues.map(item => item.rule);
    expect(rules).toEqual(expect.arrayContaining([
      'broken-relationship', 'relationship-type-mismatch', 'non-key-relationship-target',
      'unindexed-foreign-key', 'duplicate-relationship',
    ]));
  });

  it('detects names that collide without letter case and inconsistent identifiers', () => {
    const nodes = [
      table('Users', [column('id'), { ...column('Email'), name: 'Email' }, { ...column('email'), id: 'email-2', name: 'email' }]),
      { ...table('users-duplicate', [column('id')]), data: { ...table('users-duplicate', [column('id')]).data, name: 'users' } },
    ];
    const report = analyzeErdSchemaHealth(nodes, []);
    expect(report.issues.map(item => item.rule)).toEqual(expect.arrayContaining([
      'duplicate-table-name', 'duplicate-column-name', 'identifier-naming',
    ]));
    expect(report.counts.error).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
  });
});
