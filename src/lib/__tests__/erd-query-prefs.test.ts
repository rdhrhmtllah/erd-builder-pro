import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_QUERY_PREFS, getQueryPrefs, readQueryPrefs, resetQueryPrefsCache,
  setQueryPrefs, subscribeQueryPrefs, writeQueryPrefs,
} from '../erd-query-prefs';

function installStorage(impl?: Partial<Storage>) {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    ...impl,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  return store;
}

describe('query preferences', () => {
  beforeEach(() => { installStorage(); resetQueryPrefsCache(); });

  it('starts on the defaults', () => {
    expect(readQueryPrefs()).toEqual(DEFAULT_QUERY_PREFS);
  });

  it('reads back what was written', () => {
    writeQueryPrefs({ dialect: 'sqlserver', placeholders: 'positional' });
    expect(readQueryPrefs()).toEqual({ dialect: 'sqlserver', placeholders: 'positional' });
  });

  it('ignores a value that is not a dialect it knows', () => {
    // A stored preference outlives the code that wrote it.
    installStorage().set('erd_query_prefs', JSON.stringify({ dialect: 'oracle', placeholders: 'literal' }));
    expect(readQueryPrefs()).toEqual({ dialect: DEFAULT_QUERY_PREFS.dialect, placeholders: 'literal' });
  });

  it('survives malformed stored data', () => {
    installStorage().set('erd_query_prefs', 'not json');
    expect(readQueryPrefs()).toEqual(DEFAULT_QUERY_PREFS);
  });

  it('falls back to the defaults when reading throws', () => {
    installStorage({ getItem: () => { throw new Error('blocked'); } });
    expect(readQueryPrefs()).toEqual(DEFAULT_QUERY_PREFS);
  });

  it('swallows a write that throws, since the copy itself must still work', () => {
    installStorage({ setItem: () => { throw new Error('quota'); } });
    expect(() => writeQueryPrefs({ dialect: 'mysql', placeholders: 'named' })).not.toThrow();
  });
});

describe('shared query preference value', () => {
  beforeEach(() => { installStorage(); resetQueryPrefsCache(); });

  it('hands out the same object until it changes, so React can compare it', () => {
    expect(getQueryPrefs()).toBe(getQueryPrefs());
  });

  it('tells every listener when the choice changes', () => {
    let calls = 0;
    const stop = subscribeQueryPrefs(() => { calls += 1; });

    setQueryPrefs({ dialect: 'sqlserver', placeholders: 'positional' });
    expect(calls).toBe(1);
    expect(getQueryPrefs()).toEqual({ dialect: 'sqlserver', placeholders: 'positional' });

    stop();
    setQueryPrefs({ dialect: 'mysql', placeholders: 'named' });
    expect(calls).toBe(1);
  });

  it('persists the change so the next session starts on it', () => {
    setQueryPrefs({ dialect: 'postgresql', placeholders: 'literal' });
    resetQueryPrefsCache();
    expect(readQueryPrefs()).toEqual({ dialect: 'postgresql', placeholders: 'literal' });
  });
});
