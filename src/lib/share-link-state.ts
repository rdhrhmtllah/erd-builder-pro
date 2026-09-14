export interface ShareSettings {
  isPublic: boolean;
  token: string;
  /** Days until the link expires; empty means it never does. */
  durationDays: string;
}

export type ShareLinkState =
  | { canCopy: true; notice: null }
  | { canCopy: false; notice: string };

/**
 * Whether the share link is safe to hand out yet.
 *
 * The link only works once the server knows the document is public, so copying
 * has to follow what was saved, never what is merely ticked on screen. Offering
 * a copyable link for unsaved settings is how a dead link gets sent to someone.
 */
export function shareLinkState(saved: ShareSettings, draft: ShareSettings): ShareLinkState {
  if (!saved.isPublic && !draft.isPublic) {
    return { canCopy: false, notice: 'Turn on public access, then save, to get a working link.' };
  }
  if (!saved.isPublic) {
    return { canCopy: false, notice: 'Save to publish this document before sharing the link.' };
  }
  if (hasUnsavedChanges(saved, draft)) {
    return { canCopy: false, notice: 'You have unsaved changes — save them before sharing the link.' };
  }
  return { canCopy: true, notice: null };
}

export function hasUnsavedChanges(saved: ShareSettings, draft: ShareSettings): boolean {
  return saved.isPublic !== draft.isPublic
    || saved.token !== draft.token
    || saved.durationDays !== draft.durationDays;
}
