import { describe, expect, it } from 'vitest';
import { SelectionMode } from '@xyflow/react';
import { canvasModeForKey, canvasModeProps, DEFAULT_CANVAS_MODE } from '../canvas-interaction-mode';

describe('canvasModeProps', () => {
  it('pans on a plain drag in hand mode', () => {
    expect(canvasModeProps('pan')).toMatchObject({ panOnDrag: true, selectionOnDrag: false });
  });

  it('draws a selection box on a plain drag in cursor mode', () => {
    expect(canvasModeProps('select')).toMatchObject({ selectionOnDrag: true });
  });

  it('still pans with the middle and right button in cursor mode', () => {
    // Without this the viewport would be stuck behind a mode switch.
    expect(canvasModeProps('select').panOnDrag).toEqual([1, 2]);
  });

  it('catches tables the box only touches, in either mode', () => {
    expect(canvasModeProps('pan').selectionMode).toBe(SelectionMode.Partial);
    expect(canvasModeProps('select').selectionMode).toBe(SelectionMode.Partial);
  });

  it('never reports panOnDrag as true in cursor mode, which would disable the box', () => {
    // React Flow computes `selectionOnDrag && panOnDrag !== true`, so a `true`
    // here would silently cancel the selection box.
    expect(canvasModeProps('select').panOnDrag).not.toBe(true);
  });
});

describe('canvasModeForKey', () => {
  it('maps the design-tool shortcuts', () => {
    expect(canvasModeForKey('v')).toBe('select');
    expect(canvasModeForKey('h')).toBe('pan');
  });

  it('ignores the shift state of the key', () => {
    expect(canvasModeForKey('V')).toBe('select');
    expect(canvasModeForKey('H')).toBe('pan');
  });

  it('leaves every other key alone', () => {
    for (const key of ['a', 'd', 'Escape', ' ', 'Enter']) {
      expect(canvasModeForKey(key)).toBeNull();
    }
  });
});

describe('the mode a diagram opens in', () => {
  it('is cursor, so dragging selects without a first click', () => {
    expect(DEFAULT_CANVAS_MODE).toBe('select');
  });
});
