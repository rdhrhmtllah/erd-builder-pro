import type { PlaceholderStyle, QueryOptions, SqlDialect } from './erd-query-builder';

const KEY = 'erd_query_prefs';

const DIALECTS: SqlDialect[] = ['mysql', 'postgresql', 'sqlserver'];
const STYLES: PlaceholderStyle[] = ['named', 'positional', 'literal'];

/** Matches the default the code panel already opens on, so the two agree. */
export const DEFAULT_QUERY_PREFS: QueryOptions = { dialect: 'mysql', placeholders: 'named' };

/**
 * The dialect and placeholder style last copied with.
 *
 * Storage can be unavailable or throw outright — a private window, blocked site
 * data, a thumbnail capture — so every path here falls back to the defaults
 * rather than letting a copy action fail.
 */
export function readQueryPrefs(): QueryOptions {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_QUERY_PREFS;
    const parsed = JSON.parse(raw);
    return {
      dialect: DIALECTS.includes(parsed?.dialect) ? parsed.dialect : DEFAULT_QUERY_PREFS.dialect,
      placeholders: STYLES.includes(parsed?.placeholders) ? parsed.placeholders : DEFAULT_QUERY_PREFS.placeholders,
    };
  } catch {
    return DEFAULT_QUERY_PREFS;
  }
}

export function writeQueryPrefs(prefs: QueryOptions): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // A remembered preference is a convenience; losing it must not break the copy.
  }
}

// ── Shared live value ──
//
// The node menu and the toolbar menu are separate mounts of the same choice, so
// they read one cached value and are told when it changes; otherwise picking a
// dialect in one leaves the other showing the old one.

let cached: QueryOptions | null = null;
const listeners = new Set<() => void>();

/** Stable snapshot, safe to use as a `useSyncExternalStore` getter. */
export function getQueryPrefs(): QueryOptions {
  if (!cached) cached = readQueryPrefs();
  return cached;
}

export function setQueryPrefs(prefs: QueryOptions): void {
  cached = prefs;
  writeQueryPrefs(prefs);
  for (const listener of listeners) listener();
}

export function subscribeQueryPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam: drop the cache so the next read goes back to storage. */
export function resetQueryPrefsCache(): void {
  cached = null;
}
