import React, { useState, useMemo } from 'react';
import { useReactFlow, Node } from '@xyflow/react';
import { Search, MapPin, ChevronDown, Columns3, KeyRound } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from '@/lib/utils';
import { buildJumpResults, type JumpResult } from '@/lib/erd-jump-search';

interface JumpToNodeProps {
  nodes: Node[];
  className?: string;
  label?: string;
}

/** A wide ERD can match thousands of columns; keep the list responsive. */
const MAX_RESULTS = 60;


export function JumpToNode({ nodes, className, label = 'Symbol' }: JumpToNodeProps) {
  const { fitView } = useReactFlow();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus input when dropdown opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Handle escape or other keys if needed
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    // Prevent dropdown from intercepting keys (especially space and arrows)
    e.stopPropagation();
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const { results, truncated, columnMatches } = useMemo(
    () => buildJumpResults(nodes, search, MAX_RESULTS),
    [nodes, search],
  );

  /**
   * React Flow only mounts visible nodes, so the row exists after the jump has
   * brought its table on screen — flash it there rather than before moving.
   */
  const flashColumn = (columnId: string) => {
    window.setTimeout(() => {
      const selector = typeof CSS !== 'undefined' && CSS.escape
        ? `[data-erd-column-id="${CSS.escape(columnId)}"]`
        : `[data-erd-column-id="${columnId}"]`;
      const row = document.querySelector<HTMLElement>(selector);
      if (!row) return;
      row.classList.remove('erd-column-flash');
      void row.offsetWidth; // restart the animation when jumping twice in a row
      row.classList.add('erd-column-flash');
      window.setTimeout(() => row.classList.remove('erd-column-flash'), 2100);
    }, 180);
  };

  const handleJump = (result: JumpResult) => {
    setOpen(false);
    setSearch('');

    // Use fitView with a tiny timeout to ensure the UI has updated (dropdown closed)
    // and the viewport is ready for manipulation.
    setTimeout(() => {
      fitView({
        nodes: [{ id: result.nodeId }],
        duration: 0, // Instant as requested
        padding: 1.5,
        minZoom: 1.2,
        maxZoom: 1.2
      });
      if (result.columnId) flashColumn(result.columnId);
    }, 100);
  };

  const summary = search.trim()
    ? `${results.length}${truncated ? `+` : ''} match${results.length === 1 ? '' : 'es'}${columnMatches ? ` · ${columnMatches} column${columnMatches === 1 ? '' : 's'}` : ''}`
    : `Showing ${results.length} of ${nodes.length} ${label.toLowerCase()}s`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 px-3 text-xs font-bold border-border/50 bg-muted/20 hover:bg-muted text-muted-foreground transition-all",
            className
          )}
        >
          <MapPin className="w-3.5 h-3.5 mr-2" />
          <span className="hidden sm:inline">Jump to {label}</span>
          <span className="sm:hidden">Jump</span>
          <ChevronDown className="w-3 h-3 ml-2 opacity-50" />
        </Button>
      } />
      <DropdownMenuContent align="start" className="w-[320px] p-0 shadow-2xl border-border/50 bg-background/95 backdrop-blur-xl">
        <div className="p-3 pb-2" onPointerDown={(e) => e.stopPropagation()}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder={`Search ${label.toLowerCase()}s or columns...`}
              className="h-8 pl-8 text-xs bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleInputKeyDown}
              autoComplete="off"
            />
          </div>
        </div>
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 pt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            {summary}
          </DropdownMenuLabel>
          <ScrollArea className="h-[250px] px-1 pb-1">
            {results.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-muted-foreground italic">
                No matching items found
              </div>
            ) : (
              results.map((result) => (
                <DropdownMenuItem
                  key={result.key}
                  onClick={() => handleJump(result)}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors focus:bg-accent focus:text-accent-foreground rounded-lg mx-1"
                >
                  {result.columnId ? (
                    <Columns3 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <div className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: result.color }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium tracking-tight">{result.title}</span>
                      {result.isPrimaryKey && <KeyRound className="w-3 h-3 shrink-0 text-amber-500" />}
                    </div>
                    {result.subtitle && (
                      <div className="truncate text-[10px] text-muted-foreground">
                        {result.columnId ? `in ${result.subtitle}` : result.subtitle}
                      </div>
                    )}
                  </div>
                  {result.badge && (
                    <span className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                      {result.badge}
                    </span>
                  )}
                </DropdownMenuItem>
              ))
            )}
            {truncated > 0 && (
              <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">
                +{truncated} more — refine your search
              </div>
            )}
          </ScrollArea>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
