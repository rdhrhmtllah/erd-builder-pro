/**
 * Quick Action Popover that floats on top of selected / clicked ERD relationship lines.
 * Allows instant cardinality change (1:N, 1:1, N:M), flip direction, and delete.
 */
import React from 'react';
import { EdgeLabelRenderer } from '@xyflow/react';
import { Trash2, ArrowLeftRight } from 'lucide-react';
import { RelationshipEndpointCardinality } from '@/types';

interface RelationQuickPopoverProps {
  edgeId: string;
  sourceSymbol: string;
  targetSymbol: string;
  currentType: string;
  centerX: number;
  centerY: number;
  isReadOnly?: boolean;
  onUpdateCardinality?: (edgeId: string, source: RelationshipEndpointCardinality, target: RelationshipEndpointCardinality) => void;
  onFlip?: (edgeId: string) => void;
  onDelete?: (edgeId: string) => void;
}

export function RelationQuickPopover({
  edgeId,
  sourceSymbol,
  targetSymbol,
  currentType,
  centerX,
  centerY,
  isReadOnly = false,
  onUpdateCardinality,
  onFlip,
  onDelete,
}: RelationQuickPopoverProps) {
  if (isReadOnly) {
    return (
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${centerX}px,${centerY}px)`,
            pointerEvents: 'none',
          }}
          className="z-20 select-none"
        >
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-background/95 border border-border/80 shadow-md backdrop-blur text-[10px] font-mono font-bold text-foreground/80">
            <span>{sourceSymbol}</span>
            <span className="text-muted-foreground/60">→</span>
            <span>{targetSymbol}</span>
          </div>
        </div>
      </EdgeLabelRenderer>
    );
  }

  return (
    <EdgeLabelRenderer>
      <div
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${centerX}px,${centerY}px)`,
          pointerEvents: 'all',
        }}
        className="nodrag nopan z-30 select-none animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="flex items-center gap-1 p-1 rounded-xl bg-popover/95 border border-primary/50 shadow-xl backdrop-blur text-xs">
          {/* Quick cardinality buttons */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateCardinality?.(edgeId, 'exactly-one', 'zero-or-many');
            }}
            className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold transition-colors cursor-pointer ${
              currentType === 'one-to-many'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            title="Set to One-to-Many (1:N)"
          >
            1 : N
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateCardinality?.(edgeId, 'exactly-one', 'exactly-one');
            }}
            className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold transition-colors cursor-pointer ${
              currentType === 'one-to-one'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            title="Set to One-to-One (1:1)"
          >
            1 : 1
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateCardinality?.(edgeId, 'zero-or-many', 'zero-or-many');
            }}
            className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold transition-colors cursor-pointer ${
              currentType === 'many-to-many'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            title="Set to Many-to-Many (N:M)"
          >
            N : M
          </button>

          {/* Flip direction */}
          {onFlip && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFlip(edgeId);
              }}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Reverse relationship direction"
            >
              <ArrowLeftRight className="size-3" />
            </button>
          )}

          {/* Delete relation */}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(edgeId);
              }}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              title="Delete relationship"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>
    </EdgeLabelRenderer>
  );
}
