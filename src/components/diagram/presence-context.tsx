/**
 * Presence is shared through two contexts on purpose.
 *
 * The canvas (ERDView) only ever needs the *publisher*, and the cursors are
 * drawn by a separate leaf component that only needs the *state*. Splitting them
 * means a peer moving their pointer re-renders the overlay alone: with one
 * context, every cursor frame would re-render the whole React Flow canvas, and
 * the canvas already carries a hand-written memo comparator for exactly that
 * reason.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useErdPresence, type ErdPresenceOptions } from '@/hooks/useErdPresence';
import type { PresenceSnapshot } from '@/lib/collab/presence';

interface PresencePublisher {
  publishCursor: (x: number, y: number) => void;
  isWatching: () => boolean;
}

interface PresenceState extends PresenceSnapshot {
  /** True once a room was entered and the viewer is on the canvas's peer list. */
  joined: boolean;
}

const NOOP_PUBLISHER: PresencePublisher = { publishCursor: () => {}, isWatching: () => false };

const PresenceStateContext = createContext<PresenceState | null>(null);
const PresencePublisherContext = createContext<PresencePublisher>(NOOP_PUBLISHER);

export function ErdPresenceProvider({
  children,
  ...options
}: ErdPresenceOptions & { children: ReactNode }) {
  const presence = useErdPresence(options);

  const publisher = useMemo<PresencePublisher>(
    () => ({ publishCursor: presence.publishCursor, isWatching: presence.isWatching }),
    [presence.publishCursor, presence.isWatching],
  );

  const state = useMemo<PresenceState>(
    () => ({
      status: presence.status,
      error: presence.error,
      selfId: presence.selfId,
      selfColor: presence.selfColor,
      peers: presence.peers,
      joined: presence.selfId !== null,
    }),
    [presence.status, presence.error, presence.selfId, presence.selfColor, presence.peers],
  );

  return (
    <PresencePublisherContext.Provider value={publisher}>
      <PresenceStateContext.Provider value={state}>{children}</PresenceStateContext.Provider>
    </PresencePublisherContext.Provider>
  );
}

/** Safe outside a provider: a canvas with no collaboration reports nothing. */
export function usePresencePublisher(): PresencePublisher {
  return useContext(PresencePublisherContext);
}

export function usePresenceState(): PresenceState | null {
  return useContext(PresenceStateContext);
}
