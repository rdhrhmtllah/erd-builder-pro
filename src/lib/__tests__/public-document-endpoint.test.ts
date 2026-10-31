import { describe, expect, it } from 'vitest';
import { publicDocumentEndpoint } from '../public-document-endpoint';

describe('publicDocumentEndpoint', () => {
  it('serves ERDs from the diagrams collection', () => {
    // Regression: an `erd` share link used to request `/api/files/public/:uid`,
    // a route the server does not mount, so every shared diagram 404'd.
    expect(publicDocumentEndpoint('erd')).toBe('diagrams');
  });

  it('keeps the other share types on their own collections', () => {
    expect(publicDocumentEndpoint('notes')).toBe('notes');
    expect(publicDocumentEndpoint('drawings')).toBe('drawings');
    expect(publicDocumentEndpoint('flowchart')).toBe('flowcharts');
  });

  it('passes unknown types through unchanged', () => {
    expect(publicDocumentEndpoint('projects')).toBe('projects');
  });
});
