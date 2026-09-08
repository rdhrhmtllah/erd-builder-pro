import { useEffect, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';

/**
 * React Flow applies d3's 10x pinch multiplier only on macOS:
 *
 *   const factor = event.ctrlKey && isMacOs() ? 10 : 1;
 *
 * so the identical gesture moves roughly ten times less on Linux and Windows.
 * Rather than live with a per-OS feel, take the pinch over entirely and use one
 * sensitivity everywhere — anchored on the pointer, not the viewport centre, so
 * the table under the fingers stays put while the scale changes.
 */

/** Multiplier over d3's 0.002 base. Raise for a faster pinch, lower for finer control. */
const PINCH_SENSITIVITY = 0.04;

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
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoom * Math.pow(2, -event.deltaY * PINCH_SENSITIVITY)));
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
