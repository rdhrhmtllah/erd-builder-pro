import { describe, expect, it } from 'vitest';
import { pinchZoomDelta } from '../useCanvasPinchZoom';

/** How much one event actually scales the canvas. */
const factor = (deltaY: number, deltaMode = 0) => 2 ** pinchZoomDelta(deltaY, deltaMode);

describe('pinchZoomDelta', () => {
  it('keeps a trackpad pinch gradual', () => {
    // Chrome reports pixel deltas of roughly 2-10 per pinch event.
    expect(factor(-5)).toBeCloseTo(1.072, 2);
    expect(factor(-10)).toBeCloseTo(1.149, 2);
  });

  it('caps one mouse-wheel notch, which reports a far larger delta', () => {
    // Without the clamp this would scale by 2^2 = 4x in a single click.
    expect(factor(-100)).toBeCloseTo(1.189, 2);
    expect(factor(-240)).toBeCloseTo(1.189, 2);
  });

  it('caps zooming out by the same amount, so the gesture is symmetric', () => {
    expect(factor(100) * factor(-100)).toBeCloseTo(1, 5);
    expect(factor(1000)).toBeCloseTo(1 / 1.189, 2);
  });

  it('normalises line and page deltas instead of treating them as pixels', () => {
    // Firefox reports lines (deltaMode 1) with small values; untreated they
    // would barely zoom at all compared with Chrome's pixel deltas. Measured
    // below the clamp, where the per-unit scaling is still visible.
    expect(pinchZoomDelta(-0.02, 1)).toBeGreaterThan(pinchZoomDelta(-0.02, 0));
    expect(pinchZoomDelta(-0.02, 2)).toBeGreaterThan(pinchZoomDelta(-0.02, 1));
  });

  it('clamps every unit type once the delta is large enough', () => {
    // A coarse device cannot outrun the cap just by reporting a bigger number.
    expect(pinchZoomDelta(-3, 1)).toBe(0.25);
    expect(pinchZoomDelta(-1, 2)).toBe(0.25);
    expect(pinchZoomDelta(-1000, 0)).toBe(0.25);
  });

  it('zooms in for negative delta and out for positive', () => {
    expect(factor(-5)).toBeGreaterThan(1);
    expect(factor(5)).toBeLessThan(1);
  });

  it('does nothing when the wheel did not move', () => {
    expect(pinchZoomDelta(0)).toBe(0);
    expect(factor(0)).toBe(1);
  });

  it('is gentler than the flat multiplier it replaces', () => {
    // The previous implementation was a flat -deltaY * 0.04 with no clamp.
    const previous = (deltaY: number) => 2 ** (-deltaY * 0.04);
    expect(factor(-5)).toBeLessThan(previous(-5));
    expect(factor(-100)).toBeLessThan(previous(-100));
  });
});
