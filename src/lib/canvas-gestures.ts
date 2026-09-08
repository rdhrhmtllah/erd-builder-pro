import { PanOnScrollMode } from '@xyflow/react';

/**
 * Trackpad-first canvas gestures, shared by every diagram surface so the ERD and
 * the flowchart never behave differently under the same fingers.
 *
 * Two fingers pan in both axes and pinch zooms — the behaviour design tools have
 * trained people to expect. The wheel no longer zooms on its own, which is what
 * made the canvas lurch during an ordinary scroll. Mouse users keep zoom on
 * Ctrl/Cmd + wheel: browsers report a trackpad pinch as exactly that event, so
 * the same handler serves both.
 */
export const CANVAS_GESTURES = {
  /** A bare wheel/two-finger scroll must never change the zoom level. */
  zoomOnScroll: false,
  zoomOnPinch: true,
  panOnScroll: true,
  panOnScrollMode: PanOnScrollMode.Free,
  /** Double-click carries meaning on nodes; zooming the pane too is jarring. */
  zoomOnDoubleClick: false,
} as const;
