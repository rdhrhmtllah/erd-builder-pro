import { useEffect, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';

/**
 * React Flow applies d3's 10x pinch multiplier only on macOS:
 *
 *   const factor = event.ctrlKey && isMacOs() ? 10 : 1;
 *
 * so the identical gesture moves roughly ten times less on Linux and Windows.
 * This takes the pinch over entirely and uses one feel everywhere — anchored on
 * the pointer, not the viewport centre, so the table under the fingers stays put
 * while the scale changes.
 */

/** Matches the multiplier React Flow itself uses on macOS, where pinch is best tuned. */
const ZOOM_FACTOR = 10;

/**
 * Largest zoom change one event may cause, as a power of two — about 19%.
 *
 * A trackpad pinch arrives as a stream of small deltas and never reaches this,
 * but one mouse-wheel notch reports deltaY ≈ 100 in Chrome, which would
 * otherwise scale by 2^2 = 4x in a single click. The clamp is what keeps
 * Ctrl + wheel usable on a mouse without dulling the pinch.
 */
const MAX_STEP = 0.25;

/** Pixels, lines, then pages — the same per-deltaMode scaling d3-zoom uses. */
function unitScale(deltaMode: number): number {
  if (deltaMode === 1) return 0.05;
  if (deltaMode === 2) return 1;
  return 0.002;
}

/** Zoom exponent for a single wheel or pinch event. Exported for testing. */
export function pinchZoomDelta(deltaY: number, deltaMode = 0): number {
  const raw = -deltaY * unitScale(deltaMode) * ZOOM_FACTOR;
  const clamped = Math.max(-MAX_STEP, Math.min(MAX_STEP, raw));
  return clamped === 0 ? 0 : clamped;
}

export function useCanvasPinchZoom(
  containerRef: RefObject<HTMLElement | null>,
  minZoom: number,
  maxZoom: number,
) {
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      // A trackpad pinch reaches the browser as ctrl+wheel. A plain two-finger
      // scroll has no ctrlKey and must fall through to React Flow's panning.
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();

      const { x, y, zoom } = getViewport();
      const scaled = zoom * Math.pow(2, pinchZoomDelta(event.deltaY, event.deltaMode));
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, scaled));
      if (nextZoom === zoom) return;

      const rect = container.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const ratio = nextZoom / zoom;

      setViewport({
        x: pointerX - (pointerX - x) * ratio,
        y: pointerY - (pointerY - y) * ratio,
        zoom: nextZoom,
      });
    };

    // Capture phase: the pane's own d3 wheel handler sits below this element,
    // so stopping here is what keeps the zoom from being applied twice.
    container.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => container.removeEventListener('wheel', onWheel, { capture: true });
  }, [containerRef, getViewport, setViewport, minZoom, maxZoom]);
}
