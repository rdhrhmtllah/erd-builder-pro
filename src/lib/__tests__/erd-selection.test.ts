import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { applyClearSelection, applySelectAllTables, selectionKeyOf } from '../erd-selection';

const node = (id: string, selected = false): Node => ({
  id, type: 'entity', position: { x: 0, y: 0 }, selected, data: {},
});

describe('applySelectAllTables', () => {
  it('selects every table when no area filter is active', () => {
    const result = applySelectAllTables([node('a'), node('b')]);
    expect(result.every(item => item.selected)).toBe(true);
  });

  it('selects only the visible members of an active Subject Area', () => {
    const result = applySelectAllTables([node('a'), node('b'), node('c', true)], new Set(['a']));
    expect(result.map(item => [item.id, Boolean(item.selected)])).toEqual([['a', true], ['b', false], ['c', false]]);
  });

  it('keeps the identity of rows that already hold the wanted state', () => {
    const unchanged = node('a', true);
    const [same, changed] = applySelectAllTables([unchanged, node('b')]);
    expect(same).toBe(unchanged);
    expect(changed).not.toBe(unchanged);
  });
});

describe('applyClearSelection', () => {
  it('deselects everything and leaves untouched rows identical', () => {
    const already = node('b');
    const [cleared, untouched] = applyClearSelection([node('a', true), already]);
    expect(cleared.selected).toBe(false);
    expect(untouched).toBe(already);
  });
});

describe('selectionKeyOf', () => {
  it('changes only when the selected set changes', () => {
    const before = selectionKeyOf([node('a', true), node('b')]);
    const afterMove = selectionKeyOf([{ ...node('a', true), position: { x: 99, y: 99 } }, node('b')]);
    const afterSelect = selectionKeyOf([node('a', true), node('b', true)]);

    expect(afterMove).toBe(before);
    expect(afterSelect).not.toBe(before);
  });

  it('is empty when nothing is selected', () => {
    expect(selectionKeyOf([node('a'), node('b')])).toBe('');
  });
});
