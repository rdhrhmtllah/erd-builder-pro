import { describe, expect, it } from 'vitest';
import { parseClientMessage, parseCollabServerMessage, nextPresenceState, emptyPresence, PresenceSnapshot } from '../presence';

describe('Cursor Chat & Follow Presenter Protocol', () => {
  it('parses client cursor-chat frame correctly', () => {
    const raw = JSON.stringify({ t: 'cursor-chat', id: 'peer-1', text: 'Hello team!' });
    const parsed = parseCollabServerMessage(raw);
    expect(parsed).toEqual({ t: 'cursor-chat', id: 'peer-1', text: 'Hello team!' });
  });

  it('folds cursor-chat into presence peer state', () => {
    const initial: PresenceSnapshot = {
      status: 'open',
      error: null,
      selfId: 'self-1',
      selfColor: '#ffffff',
      peers: [{ id: 'peer-2', name: 'Alice', color: '#ff0000', x: 100, y: 200 }],
    };

    const next = nextPresenceState(initial, { t: 'cursor-chat', id: 'peer-2', text: 'Check this table' });
    expect(next.peers[0].chatText).toBe('Check this table');
  });

  it('folds viewport coordinates into presence peer for following', () => {
    const initial: PresenceSnapshot = {
      status: 'open',
      error: null,
      selfId: 'self-1',
      selfColor: '#ffffff',
      peers: [{ id: 'peer-2', name: 'Alice', color: '#ff0000', x: 100, y: 200 }],
    };

    const next = nextPresenceState(initial, { t: 'viewport', id: 'peer-2', x: 450, y: -200, zoom: 1.5 });
    expect(next.peers[0].viewport).toEqual({ x: 450, y: -200, zoom: 1.5 });
  });
});
