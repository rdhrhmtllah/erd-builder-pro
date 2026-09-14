import { describe, expect, it } from 'vitest';
import { hasUnsavedChanges, shareLinkState, type ShareSettings } from '../share-link-state';

const settings = (over: Partial<ShareSettings> = {}): ShareSettings =>
  ({ isPublic: false, token: '', durationDays: '', ...over });

describe('shareLinkState', () => {
  it('refuses to copy a link for a document nobody has published', () => {
    const state = shareLinkState(settings(), settings());
    expect(state.canCopy).toBe(false);
    expect(state.notice).toMatch(/turn on public access/i);
  });

  it('refuses while public access is only ticked, not saved', () => {
    // This is the bug: the tick alone made the link look ready, and the link
    // that got sent returned "This document is private".
    const state = shareLinkState(settings(), settings({ isPublic: true }));
    expect(state.canCopy).toBe(false);
    expect(state.notice).toMatch(/save to publish/i);
  });

  it('allows copying once the saved settings say public', () => {
    const saved = settings({ isPublic: true });
    expect(shareLinkState(saved, saved)).toEqual({ canCopy: true, notice: null });
  });

  it('refuses while a token has been typed but not saved', () => {
    // The link would work, but not the way the user just configured it.
    const saved = settings({ isPublic: true });
    const state = shareLinkState(saved, settings({ isPublic: true, token: 'ABC123' }));
    expect(state.canCopy).toBe(false);
    expect(state.notice).toMatch(/unsaved changes/i);
  });

  it('refuses while an expiry has been typed but not saved', () => {
    const saved = settings({ isPublic: true });
    const state = shareLinkState(saved, settings({ isPublic: true, durationDays: '7' }));
    expect(state.canCopy).toBe(false);
  });

  it('refuses while public access is being turned off but not yet saved', () => {
    const state = shareLinkState(settings({ isPublic: true }), settings({ isPublic: false }));
    expect(state.canCopy).toBe(false);
  });
});

describe('hasUnsavedChanges', () => {
  it('is false for identical settings', () => {
    expect(hasUnsavedChanges(settings({ isPublic: true, token: 'A' }), settings({ isPublic: true, token: 'A' }))).toBe(false);
  });

  it('notices each field on its own', () => {
    const saved = settings({ isPublic: true });
    expect(hasUnsavedChanges(saved, settings({ isPublic: false }))).toBe(true);
    expect(hasUnsavedChanges(saved, settings({ isPublic: true, token: 'A' }))).toBe(true);
    expect(hasUnsavedChanges(saved, settings({ isPublic: true, durationDays: '3' }))).toBe(true);
  });
});
