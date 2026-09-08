import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { isSameSchema } from '../useSchemaSnapshot';

const node = (id: string, data: object, x = 0, selected = false): Node =>
  ({ id, type: 'entity', position: { x, y: 0 }, data, selected } as Node);

describe('isSameSchema', () => {
  const users = { name: 'users', columns: [] };
  const orders = { name: 'orders', columns: [] };

  it('ignores a drag, which only replaces the position', () => {
    expect(isSameSchema([node('a', users, 0)], [node('a', users, 250)])).toBe(true);
  });

  it('ignores a selection change', () => {
    expect(isSameSchema([node('a', users)], [node('a', users, 0, true)])).toBe(true);
  });

  it('detects an edited table, where data identity is swapped', () => {
    expect(isSameSchema([node('a', users)], [node('a', { name: 'accounts', columns: [] })])).toBe(false);
  });

  it('detects an added or removed table', () => {
    expect(isSameSchema([node('a', users)], [node('a', users), node('b', orders)])).toBe(false);
    expect(isSameSchema([node('a', users), node('b', orders)], [node('a', users)])).toBe(false);
  });

  it('detects reordering, so a stale snapshot is never reused', () => {
    expect(isSameSchema([node('a', users), node('b', orders)], [node('b', orders), node('a', users)])).toBe(false);
  });

  it('treats the identical array as unchanged', () => {
    const same = [node('a', users)];
    expect(isSameSchema(same, same)).toBe(true);
  });

  it('treats two empty diagrams as unchanged', () => {
    expect(isSameSchema([], [])).toBe(true);
  });
});
