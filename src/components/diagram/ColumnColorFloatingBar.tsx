/**
 * Floating bar that appears when one or more columns are selected in tables.
 * Allows applying preset colors, picking a custom color, or resetting color.
 */
import React from 'react';
import { useColumnColor, COLUMN_PRESET_COLORS } from '@/contexts/ColumnColorContext';
import { Palette, X, RotateCcw } from 'lucide-react';

export function ColumnColorFloatingBar({ isReadOnly }: { isReadOnly?: boolean }) {
  const { selectedColumns, clearColumnSelection, applyColorToSelectedColumns } = useColumnColor();

  if (isReadOnly || selectedColumns.size === 0) return null;

  const count = selectedColumns.size;

  return (
    <div
      data-testid="column-color-bar"
      className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-[30] flex items-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl border border-primary/40 bg-popover/95 text-foreground shadow-2xl backdrop-blur animate-in fade-in slide-in-from-bottom-3 duration-150 select-none max-w-[95vw] overflow-x-auto no-scrollbar"
    >
      <div className="flex items-center gap-1.5 pr-2 border-r border-border/80">
        <Palette className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-foreground">
          {count} column{count > 1 ? 's' : ''} selected
        </span>
      </div>

      {/* Preset color swatches */}
      <div className="flex items-center gap-1.5">
        {COLUMN_PRESET_COLORS.map((preset) => (
          <button
            key={preset.hex}
            type="button"
            onClick={() => applyColorToSelectedColumns(preset.hex)}
            className="size-5 rounded-full border border-black/20 dark:border-white/20 transition-transform cursor-pointer hover:scale-125 focus:scale-125 outline-none shadow-sm"
            style={{ backgroundColor: preset.hex }}
            title={`Set color: ${preset.name}`}
          />
        ))}
      </div>

      {/* Reset button */}
      <button
        type="button"
        onClick={() => applyColorToSelectedColumns(null)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer"
        title="Clear custom color"
      >
        <RotateCcw className="w-3 h-3" />
        Reset
      </button>

      {/* Dismiss / clear selection */}
      <button
        type="button"
        onClick={clearColumnSelection}
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer ml-0.5"
        title="Deselect columns (Esc)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
