import { Hand, MousePointer2 } from 'lucide-react';
import type { CanvasMode } from '@/lib/canvas-interaction-mode';
import { cn } from '@/lib/utils';

const MODES: { mode: CanvasMode; icon: typeof Hand; label: string; hint: string }[] = [
  { mode: 'select', icon: MousePointer2, label: 'Select', hint: 'Drag to select tables · V' },
  { mode: 'pan', icon: Hand, label: 'Hand', hint: 'Drag to move the canvas · H' },
];

interface CanvasModeToggleProps {
  mode: CanvasMode;
  onChange: (mode: CanvasMode) => void;
}

/**
 * Switches what a drag on empty canvas does.
 *
 * Sits on the canvas rather than in the toolbar because it changes what the
 * pointer does, and it belongs next to the thing it acts on.
 */
export function CanvasModeToggle({ mode, onChange }: CanvasModeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Canvas drag mode"
      className="nodrag nopan flex gap-0.5 rounded-lg border border-border/60 bg-background/95 p-0.5 shadow-md backdrop-blur"
    >
      {MODES.map(({ mode: value, icon: Icon, label, hint }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          title={hint}
          className={cn(
            'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors',
            mode === value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
