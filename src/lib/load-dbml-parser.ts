export type DbmlParser = typeof import('@/lib/dbml-parser');

// @dbml/core is too large for the boot bundle, so boot-path code fetches the
// parser the first time it actually needs one. Resolves to null when the chunk
// cannot be loaded, so callers can degrade instead of silently losing a save.
let parserPromise: Promise<DbmlParser | null> | null = null;

export function loadDbmlParser(): Promise<DbmlParser | null> {
  parserPromise ??= import('@/lib/dbml-parser').catch((err) => {
    console.error('Failed to load the DBML parser:', err);
    parserPromise = null;
    return null;
  });
  return parserPromise;
}
