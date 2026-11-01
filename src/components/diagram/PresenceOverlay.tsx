/**
 * The other people on the canvas: their cursors, in their colour, with their name.
 * Also supports:
 * 1. Cursor Chat (press "/" to speak on cursor, auto-fades in 6s)
 * 2. Follow Peer / Presenter Mode (click avatar to smoothly lock viewport)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useViewport, useReactFlow } from '@xyflow/react';
import { usePresenceState, usePresencePublisher } from './presence-context';
import type { PresencePeer } from '@/lib/collab/presence';
import { Radio, X } from 'lucide-react';

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
    <div className="ml-2 flex flex-col items-start gap-1 select-none pointer-events-none">
      <span
        data-testid="presence-badge"
        className="rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-semibold text-white shadow-sm"
        style={{ backgroundColor: peer.color }}
      >
        {peer.name}
      </span>
      {peer.chatText && (
        <span
          data-testid="peer-chat-bubble"
          className="rounded-xl px-2.5 py-1 text-xs font-medium text-foreground bg-popover/95 border border-border shadow-md backdrop-blur animate-in fade-in zoom-in-95 max-w-[200px] break-words"
        >
          {peer.chatText}
        </span>
      )}
    </div>
  );
}

export function PresenceOverlay() {
  const presence = usePresenceState();
  const publisher = usePresencePublisher();
  const viewport = useViewport();
  const { setViewport } = useReactFlow();

  // Local Cursor Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [localChat, setLocalChat] = useState<string | null>(null);
  const localChatFadeRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow Mode state
  const [followingId, setFollowingId] = useState<string | null>(null);
  const followingPeer = presence?.peers.find(p => p.id === followingId);

  // Sync viewport with followed peer
  useEffect(() => {
    if (!followingPeer) {
      if (followingId) setFollowingId(null);
      return;
    }

    if (followingPeer.viewport) {
      setViewport(followingPeer.viewport, { duration: 120 });
    } else if (followingPeer.x !== null && followingPeer.y !== null) {
      // If peer has cursor coordinates, center on them
      const targetX = -followingPeer.x * viewport.zoom + window.innerWidth / 2;
      const targetY = -followingPeer.y * viewport.zoom + window.innerHeight / 2;
      setViewport({ x: targetX, y: targetY, zoom: viewport.zoom }, { duration: 100 });
    }
  }, [followingPeer, followingPeer?.viewport, followingPeer?.x, followingPeer?.y, setViewport, viewport.zoom, followingId]);

  // Listen for "/" key to open cursor chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || (activeEl as HTMLElement)?.isContentEditable;
      if (e.key === '/' && !isInput && !chatOpen) {
        e.preventDefault();
        setChatOpen(true);
        setTimeout(() => inputRef.current?.focus(), 20);
      } else if (e.key === 'Escape' && chatOpen) {
        setChatOpen(false);
        setChatInput('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatOpen]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) {
      setChatOpen(false);
      return;
    }
    const text = chatInput.trim().slice(0, 80);
    publisher.publishChat(text);
    setLocalChat(text);
    setChatInput('');
    setChatOpen(false);

    if (localChatFadeRef.current) clearTimeout(localChatFadeRef.current);
    localChatFadeRef.current = setTimeout(() => {
      setLocalChat(null);
      publisher.publishChat('');
    }, 6000);
  };

  if (!presence) return null;

  const visible = presence.peers.filter(
    (peer) => peer.id !== presence.selfId && peer.x !== null && peer.y !== null,
  );

  return (
    <>
      {/* Remote cursors & chat bubbles */}
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

        {/* Local user chat bubble (preview) */}
        {localChat && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none z-[20]">
            <span className="rounded-xl px-3 py-1.5 text-xs font-semibold text-foreground bg-popover/90 border border-primary/40 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2">
              💭 You: {localChat}
            </span>
          </div>
        )}
      </div>

      {/* Floating Cursor Chat input modal when triggered with "/" */}
      {chatOpen && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[30] animate-in fade-in zoom-in-95 duration-150">
          <form
            onSubmit={handleChatSubmit}
            className="flex items-center gap-1.5 p-1 bg-popover/95 border border-primary/50 rounded-2xl shadow-2xl backdrop-blur"
          >
            <span className="text-xs px-2 text-primary font-bold">💬</span>
            <input
              ref={inputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type message on cursor... (Enter to send, Esc)"
              maxLength={80}
              className="w-64 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none py-1"
            />
          </form>
        </div>
      )}

      {/* Following banner indicator */}
      {followingPeer && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[25] flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/40 bg-popover/95 text-xs font-semibold shadow-lg backdrop-blur">
          <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
          <span>Following <span style={{ color: followingPeer.color }}>{followingPeer.name}</span></span>
          <button
            onClick={() => setFollowingId(null)}
            className="ml-1 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="Stop following"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Peer avatar pill in corner with Follow toggle */}
      <PresencePill onSelectPeer={(id) => setFollowingId(followingId === id ? null : id)} followingId={followingId} />
    </>
  );
}

/**
 * Enhanced PresencePill with click-to-follow functionality
 */
export function PresencePill({
  onSelectPeer,
  followingId,
}: {
  onSelectPeer?: (id: string) => void;
  followingId?: string | null;
}) {
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
      className="absolute bottom-4 right-3 z-[6] flex items-center gap-2 rounded-full border bg-popover/90 px-2.5 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur"
    >
      <span className="flex items-center gap-1">
        {others.map((peer) => {
          const isFollowing = followingId === peer.id;
          return (
            <button
              key={peer.id}
              onClick={() => onSelectPeer?.(peer.id)}
              className={`relative size-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white transition-transform cursor-pointer hover:scale-115 ${isFollowing ? 'ring-2 ring-primary ring-offset-1 scale-110' : ''}`}
              style={{ backgroundColor: peer.color }}
              title={`Click to follow ${peer.name}'s view`}
            >
              {peer.name.slice(0, 1).toUpperCase()}
            </button>
          );
        })}
      </span>
      <span className="text-muted-foreground text-[10px]">
        {followingId ? 'Following' : `${others.length} online (Click avatar to follow)`}
      </span>
      <span className="text-[10px] text-muted-foreground/60 border-l pl-1.5">
        Press <kbd className="px-1 py-0.5 rounded bg-muted font-mono">/</kbd> to chat
      </span>
    </div>
  );
}
