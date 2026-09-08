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

export type PendingErdFocus = { nodeId: string; columnId?: string };

const PENDING_FOCUS_KEY = 'pending_focus_erd_node';

/** Hand a focus target to the ERD canvas across a route change. */
export function setPendingErdFocus(focus: PendingErdFocus): void {
  try { localStorage.setItem(PENDING_FOCUS_KEY, JSON.stringify(focus)); } catch { /* storage unavailable */ }
}

/** Read and clear the target, so a later reload does not jump again. */
export function takePendingErdFocus(): PendingErdFocus | null {
  try {
    const raw = localStorage.getItem(PENDING_FOCUS_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_FOCUS_KEY);
    const parsed = JSON.parse(raw);
    return typeof parsed?.nodeId === 'string' ? parsed as PendingErdFocus : null;
  } catch {
    return null;
  }
}
