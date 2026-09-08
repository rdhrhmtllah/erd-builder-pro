import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { buildJumpResults } from '../erd-jump-search';

const table = (id: string, name: string, columns: Array<Record<string, unknown>> = []): Node => ({
  id, type: 'entity', position: { x: 0, y: 0 }, data: { name, color: '#6366f1', columns },
});

const nodes = [
  table('t1', 'users', [
    { id: 'c1', name: 'id', type: 'BIGINT', is_pk: true },
    { id: 'c2', name: 'email', type: 'VARCHAR' },
  ]),
  table('t2', 'orders', [
    { id: 'c3', name: 'user_id', type: 'BIGINT' },
    { id: 'c4', name: 'total', type: 'DECIMAL' },
  ]),
];

describe('buildJumpResults', () => {
  it('lists tables with a column count when no query is given', () => {
    const { results, columnMatches } = buildJumpResults(nodes, '', 60);
    expect(results.map(item => [item.title, item.subtitle])).toEqual([
      ['users', '2 columns'],
      ['orders', '2 columns'],
    ]);
    expect(columnMatches).toBe(0);
  });

  it('returns each matching column as its own jumpable result', () => {
    const { results, columnMatches } = buildJumpResults(nodes, 'user', 60);
    expect(results).toEqual([
      expect.objectContaining({ nodeId: 't1', title: 'users' }),
      expect.objectContaining({ nodeId: 't2', title: 'user_id', columnId: 'c3', subtitle: 'orders', badge: 'BIGINT' }),
    ]);
    // The table row carries no columnId, so clicking it jumps without flashing a column.
    expect(results[0].columnId).toBeUndefined();
    expect(columnMatches).toBe(1);
  });

  it('carries the primary key flag so the row can be marked', () => {
    const { results } = buildJumpResults(nodes, 'id', 60);
    expect(results.find(item => item.columnId === 'c1')?.isPrimaryKey).toBe(true);
    expect(results.find(item => item.columnId === 'c3')?.isPrimaryKey).toBe(false);
  });

  it('matches case-insensitively and on partial names', () => {
    expect(buildJumpResults(nodes, 'EMA', 60).results).toHaveLength(1);
    expect(buildJumpResults(nodes, 'ORD', 60).results.some(item => item.title === 'orders')).toBe(true);
  });

  it('caps the list and reports how many were left out', () => {
    const { results, truncated } = buildJumpResults(nodes, 'id', 1);
    expect(results).toHaveLength(1);
    expect(truncated).toBe(1);
  });

  it('tolerates nodes without columns, such as flowchart symbols', () => {
    const { results, columnMatches } = buildJumpResults([table('s1', 'Start')], 'start', 60);
    expect(results).toEqual([expect.objectContaining({ title: 'Start' })]);
    expect(results[0].columnId).toBeUndefined();
    expect(columnMatches).toBe(0);
  });

  it('returns nothing when neither a table nor a column matches', () => {
    expect(buildJumpResults(nodes, 'zzz', 60).results).toEqual([]);
  });
});
