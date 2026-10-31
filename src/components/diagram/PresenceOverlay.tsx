/**
 * The other people on the canvas: their cursors, in their colour, with their name.
 *
 * Drawn as an overlay over the flow pane rather than inside it, so it never
 * participates in the diagram's own layout, hit testing or export. Positions are
 * computed from the flow viewport directly (`x * zoom + pan`) instead of asking
 * React Flow to project them, because this component subscribes to the viewport
 * itself and must stay correct while the canvas is being panned.
 */
import { useViewport } from '@xyflow/react';
import { usePresenceState } from './presence-context';
import type { PresencePeer } from '@/lib/collab/presence';

function CursorGlyph({ color }: { color: string }) {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden="true" className="drop-shadow-sm">
      <path
        d="M1 1.5 16.2 9.3c.9.5.8 1.8-.2 2.1l-5.1 1.5-1.6 5.1c-.3 1-1.6 1.1-2.1.2L1 1.5Z"
        fill={color}
        stroke="white"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function PeerBadge({ peer }: { peer: PresencePeer }) {
  return (
    <span
      data-testid="presence-badge"
      className="ml-2 select-none rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-semibold text-white shadow-sm"
      style={{ backgroundColor: peer.color }}
    >
      {peer.name}
    </span>
  );
}

export function PresenceOverlay() {
  const presence = usePresenceState();
  const viewport = useViewport();

  if (!presence) return null;

  const visible = presence.peers.filter(
    (peer) => peer.id !== presence.selfId && peer.x !== null && peer.y !== null,
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" data-testid="presence-overlay">
      {visible.map((peer) => (
        <div
          key={peer.id}
          data-testid="presence-cursor"
          className="absolute top-0 left-0 flex items-start will-change-transform"
          style={{
            transform: `translate(${(peer.x as number) * viewport.zoom + viewport.x}px, ${
              (peer.y as number) * viewport.zoom + viewport.y
            }px)`,
          }}
        >
          <CursorGlyph color={peer.color} />
          <PeerBadge peer={peer} />
        </div>
      ))}
    </div>
  );
}

/**
 * A small "who is here" marker. Kept separate from the cursors so it can sit in
 * a corner and print above the canvas without being part of the pointer layer.
 */
export function PresencePill() {
  const presence = usePresenceState();
  if (!presence) return null;

  const others = presence.peers.filter((peer) => peer.id !== presence.selfId);

  if (presence.error && !presence.joined) {
    return (
      <div
        data-testid="presence-notice"
        className="pointer-events-none absolute bottom-4 right-3 z-[6] max-w-[240px] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 shadow-sm backdrop-blur dark:text-amber-400"
      >
        {presence.error}
      </div>
    );
  }

  if (others.length === 0) return null;

  return (
    <div
      data-testid="presence-pill"
      title={others.map((peer) => peer.name).join(', ')}
      className="pointer-events-none absolute bottom-4 right-3 z-[6] flex items-center gap-2 rounded-full border bg-popover/90 px-2.5 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur"
    >
      <span className="flex items-center">
        {others.slice(0, 4).map((peer, index) => (
          <span
            key={peer.id}
            className="size-2.5 rounded-full ring-1 ring-popover"
            style={{ backgroundColor: peer.color, marginLeft: index === 0 ? 0 : -4 }}
          />
        ))}
      </span>
      <span className="text-muted-foreground">
        {others.length} {others.length === 1 ? 'other' : 'others'}
      </span>
    </div>
  );
}
