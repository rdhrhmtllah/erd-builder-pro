import { SelectionMode } from '@xyflow/react';

/**
 * What dragging on empty canvas does: move the viewport, or draw a selection box.
 *
 * Holding Space overrides whichever mode is active — React Flow's own
 * `panActivationKeyCode` forces `panOnDrag` to `true` while the key is down,
 * which also suppresses the selection box for that moment. So "hand" is always
 * one key away and this mode only decides the resting behaviour.
 */
export type CanvasMode = 'pan' | 'select';

/** Dragging to select is the common act on an ERD; panning has Space and two fingers. */
export const DEFAULT_CANVAS_MODE: CanvasMode = 'select';

export interface CanvasModeProps {
  panOnDrag: boolean | number[];
  selectionOnDrag: boolean;
  selectionMode: SelectionMode;
}

export function canvasModeProps(mode: CanvasMode): CanvasModeProps {
  return {
    // Middle and right button keep panning in select mode, so the viewport is
    // never stuck behind a mode switch.
    panOnDrag: mode === 'pan' ? true : [1, 2],
    selectionOnDrag: mode === 'select',
    // A table only half inside the box is one the user meant to catch; demanding
    // full enclosure is punishing on a wide table.
    selectionMode: SelectionMode.Partial,
  };
}

/** The mode a bare keypress asks for, following the shortcuts design tools use. */
export function canvasModeForKey(key: string): CanvasMode | null {
  const pressed = key.toLowerCase();
  if (pressed === 'v') return 'select';
  if (pressed === 'h') return 'pan';
  return null;
}
