import { describe, expect, it } from 'vitest';
import { flattenNoteTree, noteAncestors } from '../note-tree';

const note = (id: number, title: string, parent_id: number | null = null) => ({ id, title, parent_id });

describe('flattenNoteTree', () => {
  it('places every child directly beneath its parent', () => {
    const flat = flattenNoteTree([
      note(3, 'Runbook', 1),
      note(1, 'Platform'),
      note(2, 'Billing'),
      note(4, 'Deploy', 3),
    ]);

    expect(flat.map(item => [item.title, item.depth])).toEqual([
      ['Billing', 0],
      ['Platform', 0],
      ['Runbook', 1],
      ['Deploy', 2],
    ]);
  });

  it('sorts siblings by title, not by insertion order', () => {
    const flat = flattenNoteTree([note(1, 'Root'), note(3, 'Zebra', 1), note(2, 'Alpha', 1)]);
    expect(flat.map(item => item.title)).toEqual(['Root', 'Alpha', 'Zebra']);
  });

  it('keeps a page whose parent is missing as a root rather than hiding it', () => {
    // The parent may be filtered out by a search, or sitting in the trash.
    const flat = flattenNoteTree([note(5, 'Orphan', 999)]);
    expect(flat).toEqual([expect.objectContaining({ title: 'Orphan', depth: 0 })]);
  });

  it('still lists pages caught in a loop', () => {
    const flat = flattenNoteTree([note(1, 'A', 2), note(2, 'B', 1)]);
    expect(flat.map(item => item.title).sort()).toEqual(['A', 'B']);
  });

  it('treats a page pointing at itself as a root', () => {
    expect(flattenNoteTree([note(1, 'Self', 1)])).toEqual([expect.objectContaining({ depth: 0 })]);
  });

  it('accepts the camelCase field name as well', () => {
    const flat = flattenNoteTree([{ id: 1, title: 'Root' }, { id: 2, title: 'Child', parentId: 1 }]);
    expect(flat.map(item => item.depth)).toEqual([0, 1]);
  });

  it('returns an empty list unchanged', () => {
    expect(flattenNoteTree([])).toEqual([]);
  });
});

describe('noteAncestors', () => {
  const tree = [note(1, 'Platform'), note(2, 'Runbook', 1), note(3, 'Deploy', 2)];

  it('lists the trail outermost first', () => {
    expect(noteAncestors(tree, 3).map(item => item.title)).toEqual(['Platform', 'Runbook']);
  });

  it('is empty for a top-level page', () => {
    expect(noteAncestors(tree, 1)).toEqual([]);
  });

  it('stops instead of looping on corrupt data', () => {
    expect(noteAncestors([note(1, 'A', 2), note(2, 'B', 1)], 1).length).toBeLessThanOrEqual(2);
  });
});
