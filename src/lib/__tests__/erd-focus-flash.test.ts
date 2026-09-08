import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPendingErdFocus, peekPendingErdFocus, setPendingErdFocus } from '../erd-focus-flash';

const KEY = 'pending_focus_erd_node';

function installStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  return store;
}

describe('pending ERD focus', () => {
  let store: Map<string, string>;

  beforeEach(() => { store = installStorage(); });
  afterEach(() => { vi.useRealTimers(); });

  it('survives being read before the right diagram has loaded', () => {
    setPendingErdFocus({ nodeId: 'users', columnId: 'col-1' });

    // The canvas renders with the previous diagram still mounted; the target
    // must outlive that pass or the jump is silently lost.
    expect(peekPendingErdFocus()).toMatchObject({ nodeId: 'users', columnId: 'col-1' });
    expect(peekPendingErdFocus()).toMatchObject({ nodeId: 'users' });
    expect(peekPendingErdFocus()).toMatchObject({ nodeId: 'users' });
  });

  it('is gone once the caller clears it', () => {
    setPendingErdFocus({ nodeId: 'users' });
    clearPendingErdFocus();
    expect(peekPendingErdFocus()).toBeNull();
  });

  it('carries no column when a whole table was picked', () => {
    setPendingErdFocus({ nodeId: 'orders' });
    expect(peekPendingErdFocus()?.columnId).toBeUndefined();
  });

  it('expires so an abandoned navigation cannot yank the viewport later', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T00:00:00Z'));
    setPendingErdFocus({ nodeId: 'users' });

    vi.setSystemTime(new Date('2026-09-09T00:00:20Z'));
    expect(peekPendingErdFocus()).toMatchObject({ nodeId: 'users' });

    vi.setSystemTime(new Date('2026-09-09T00:01:00Z'));
    expect(peekPendingErdFocus()).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  it('discards malformed or empty targets instead of throwing', () => {
    store.set(KEY, 'not json');
    expect(peekPendingErdFocus()).toBeNull();

    store.set(KEY, JSON.stringify({ nodeId: '' }));
    expect(peekPendingErdFocus()).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  it('returns null when nothing is pending', () => {
    expect(peekPendingErdFocus()).toBeNull();
  });
});
