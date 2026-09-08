/**
 * Briefly highlight one column row on the ERD canvas.
 *
 * React Flow only mounts visible nodes, so the row exists once the viewport has
 * moved to its table — call this after the jump, never before. Driving it
 * through the DOM rather than React state keeps a highlight from re-rendering
 * every table on a large diagram.
 */

const FLASH_CLASS = 'erd-column-flash';
const FLASH_MS = 2100;

/** Wait for the table to mount after a viewport move before looking for the row. */
const SETTLE_MS = 180;

export function flashErdColumn(columnId: string, settleMs = SETTLE_MS): void {
  if (typeof document === 'undefined' || !columnId) return;

  window.setTimeout(() => {
    const selector = typeof CSS !== 'undefined' && CSS.escape
      ? `[data-erd-column-id="${CSS.escape(columnId)}"]`
      : `[data-erd-column-id="${columnId}"]`;
    const row = document.querySelector<HTMLElement>(selector);
    if (!row) return;

    row.classList.remove(FLASH_CLASS);
    void row.offsetWidth; // restart the animation when jumping twice in a row
    row.classList.add(FLASH_CLASS);
    window.setTimeout(() => row.classList.remove(FLASH_CLASS), FLASH_MS);
  }, settleMs);
}

export type PendingErdFocus = { nodeId: string; columnId?: string; expiresAt: number };

const PENDING_FOCUS_KEY = 'pending_focus_erd_node';

/**
 * How long a target stays valid. Long enough for a slow diagram to load, short
 * enough that an abandoned navigation never yanks the viewport later on.
 */
const FOCUS_TTL_MS = 30_000;

/** Hand a focus target to the ERD canvas across a route change. */
export function setPendingErdFocus(focus: { nodeId: string; columnId?: string }): void {
  try {
    localStorage.setItem(PENDING_FOCUS_KEY, JSON.stringify({ ...focus, expiresAt: Date.now() + FOCUS_TTL_MS }));
  } catch { /* storage unavailable */ }
}

/**
 * Read the target WITHOUT consuming it.
 *
 * The canvas re-renders several times before the requested diagram's tables are
 * mounted — often while the previous diagram's nodes are still on screen. A
 * read that consumed the target would throw it away on that first pass, so the
 * caller must clear it only once it has actually focused the node.
 */
export function peekPendingErdFocus(): PendingErdFocus | null {
  try {
    const raw = localStorage.getItem(PENDING_FOCUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.nodeId !== 'string' || !parsed.nodeId) {
      clearPendingErdFocus();
      return null;
    }
    if (typeof parsed.expiresAt === 'number' && parsed.expiresAt < Date.now()) {
      clearPendingErdFocus();
      return null;
    }
    return parsed as PendingErdFocus;
  } catch {
    return null;
  }
}

export function clearPendingErdFocus(): void {
  try { localStorage.removeItem(PENDING_FOCUS_KEY); } catch { /* storage unavailable */ }
}
