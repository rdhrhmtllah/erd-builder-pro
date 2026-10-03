import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Columns3, Database, FileText, Network, PenTool, Table2 } from 'lucide-react';

export interface FileMentionOption {
  name: string;
  type: 'note' | 'diagram' | 'flowchart' | 'drawing' | 'table' | 'column';
  uid: string;
  href: string;
  workspaceName?: string | null;
  nodeId?: string;
  columnId?: string;
  tableName?: string;
  diagramName?: string;
}

export interface FileMentionMenuProps {
  items: FileMentionOption[];
  query: string;
  command: (item: FileMentionOption) => void;
}

export interface FileMentionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  note: FileText,
  notes: FileText,
  diagram: Database,
  diagrams: Database,
  erd: Database,
  flowchart: Network,
  flowcharts: Network,
  drawing: PenTool,
  drawings: PenTool,
  table: Table2,
  column: Columns3,
  'db-client': Database,
  workspace: Database,
};

export const FileMentionMenu = forwardRef<FileMentionMenuRef, FileMentionMenuProps>(function FileMentionMenu(
  { items, query, command },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;

      if (event.key === 'ArrowDown') {
        setSelectedIndex(index => Math.min(index + 1, items.length - 1));
        return true;
      }

      if (event.key === 'ArrowUp') {
        setSelectedIndex(index => Math.max(index - 1, 0));
        return true;
      }

      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (!item) return false;
        command(item);
        return true;
      }

      return false;
    },
  }), [command, items, selectedIndex]);

  if (!items.length) return null;

  return (
    <div
      data-file-mention-menu
      className="z-9999 w-72 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover/95 p-1 shadow-2xl backdrop-blur-xl"
    >
      {items.map((option, index) => {
        const Icon = icons[option.type] || FileText;
        return (
          <button
            key={`${option.type}-${option.uid}-${option.nodeId || ''}-${option.columnId || ''}-${index}`}
            type="button"
            data-index={index}
            onPointerDown={(event) => event.preventDefault()}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => command(option)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
              index === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground/80 hover:bg-accent/60'
            }`}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">
              <span className="block truncate">{option.name}</span>
              {(option.diagramName || option.workspaceName) && (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {option.diagramName ? `${option.diagramName}${option.workspaceName ? ` • ${option.workspaceName}` : ''}` : option.workspaceName}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
});
