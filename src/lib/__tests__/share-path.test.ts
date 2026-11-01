import { describe, expect, it } from 'vitest';
import { matchSharePath } from '../urlUtils';

describe('matchSharePath', () => {
  it('maps every share URL the app hands out to its document type', () => {
    expect(matchSharePath('/view/diagram/abc')).toEqual({ type: 'erd', uid: 'abc' });
    expect(matchSharePath('/view/note/abc')).toEqual({ type: 'notes', uid: 'abc' });
    expect(matchSharePath('/view/drawing/abc')).toEqual({ type: 'drawings', uid: 'abc' });
    expect(matchSharePath('/view/flowchart/abc')).toEqual({ type: 'flowchart', uid: 'abc' });
    expect(matchSharePath('/share/erd/abc')).toEqual({ type: 'erd', uid: 'abc' });
  });

  it('ignores editor routes', () => {
    expect(matchSharePath('/diagrams/abc')).toBeNull();
    expect(matchSharePath('/view/unknown/abc')).toBeNull();
  });
});
