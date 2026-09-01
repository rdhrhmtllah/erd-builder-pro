import React from 'react';
import type { Edge, Node } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { ArrowDownToLine, ArrowUpFromLine, GitBranch, Route, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/select';
import type { Entity } from '@/types';
import {
  findErdRelationPath,
  traceErdRelations,
  type ErdTraceDepth,
  type ErdTraceDirection,
} from '@/lib/erd-focus';
import { cn } from '@/lib/utils';

export type ErdExplorerSelection = {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  pathNodeIds: Set<string>;
  pathEdgeIds: Set<string>;
};

type Props = {
  nodes: Node<Entity>[];
  edges: Edge[];
  selectedNodeIds: string[];
  onClose: () => void;
  onSelectionChange: (selection: ErdExplorerSelection | null) => void;
};

const directions: Array<{ value: ErdTraceDirection; label: string }> = [
  { value: 'upstream', label: 'Upstream' },
  { value: 'downstream', label: 'Downstream' },
  { value: 'both', label: 'Both' },
];

export function ErdRelationExplorer({ nodes, edges, selectedNodeIds, onClose, onSelectionChange }: Props) {
  const { fitView } = useReactFlow();
  const [direction, setDirection] = React.useState<ErdTraceDirection>('both');
  const [depth, setDepth] = React.useState<ErdTraceDepth>(1);
  const [pathStart, setPathStart] = React.useState(selectedNodeIds[0] || '');
  const [pathEnd, setPathEnd] = React.useState('');
  const [pathResult, setPathResult] = React.useState<ReturnType<typeof findErdRelationPath>>(null);
  const [pathAttempted, setPathAttempted] = React.useState(false);

  const sortedNodes = React.useMemo(() => [...nodes].sort((a, b) =>
    String(a.data.name).localeCompare(String(b.data.name))), [nodes]);
  const names = React.useMemo(() => new Map(nodes.map(node => [node.id, String(node.data.name || node.id)])), [nodes]);
  const focus = React.useMemo(() => traceErdRelations(edges, selectedNodeIds, direction, depth),
    [edges, selectedNodeIds, direction, depth]);
  const selection = React.useMemo<ErdExplorerSelection | null>(() => {
    if (pathResult) return {
      nodeIds: new Set(pathResult.nodeIds),
      edgeIds: new Set(pathResult.edgeIds),
      pathNodeIds: new Set(pathResult.nodeIds),
      pathEdgeIds: new Set(pathResult.edgeIds),
    };
    if (!selectedNodeIds.length) return null;
    return { nodeIds: focus.nodeIds, edgeIds: focus.edgeIds, pathNodeIds: new Set(), pathEdgeIds: new Set() };
  }, [focus, pathResult, selectedNodeIds.length]);

  React.useEffect(() => {
    onSelectionChange(selection);
    return () => onSelectionChange(null);
  }, [selection, onSelectionChange]);

  React.useEffect(() => {
    if (!pathStart && selectedNodeIds[0]) setPathStart(selectedNodeIds[0]);
  }, [pathStart, selectedNodeIds]);

  const clearPath = () => {
    setPathResult(null);
    setPathAttempted(false);
  };

  const findPath = () => {
    setPathAttempted(true);
    const result = findErdRelationPath(edges, pathStart, pathEnd, direction);
    setPathResult(result);
    if (result) {
      requestAnimationFrame(() => void fitView({
        nodes: result.nodeIds.map(id => ({ id })), padding: 0.4, duration: 300, minZoom: 0.15, maxZoom: 1.2,
      }));
    }
  };

  const activeEdges = edges.filter(edge => selection?.edgeIds.has(edge.id));

  return (
    <aside className="absolute right-4 top-20 z-30 w-[min(360px,calc(100vw-2rem))] max-h-[calc(100%-6rem)] overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl pointer-events-auto">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold"><GitBranch className="h-4 w-4 text-primary" /> Relation Explorer</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Select a table to trace its dependencies.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close explorer"><X className="h-4 w-4" /></Button>
      </div>

      <div className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-4 custom-scrollbar">
        <section className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Direction</div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1">
            {directions.map(item => (
              <button key={item.value} onClick={() => { setDirection(item.value); clearPath(); }} className={cn(
                'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                direction === item.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}>{item.label}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {([1, 2, 'all'] as ErdTraceDepth[]).map(value => (
              <button key={value} onClick={() => { setDepth(value); clearPath(); }} className={cn(
                'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold',
                depth === value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
              )}>{value === 'all' ? 'All levels' : `${value}-hop`}</button>
            ))}
          </div>
        </section>

        <section className="space-y-2 border-t border-border/60 pt-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Route className="h-3.5 w-3.5" /> Find path A → B</div>
          <SearchableSelect value={pathStart} onValueChange={value => { setPathStart(value); clearPath(); }} className="h-9 text-xs" placeholder="Start table…" searchPlaceholder="Search start table..." options={[{ value: '', label: 'Start table…' }, ...sortedNodes.map(node => ({ value: node.id, label: node.data.name }))]} />
          <SearchableSelect value={pathEnd} onValueChange={value => { setPathEnd(value); clearPath(); }} className="h-9 text-xs" placeholder="Destination table…" searchPlaceholder="Search destination..." options={[{ value: '', label: 'Destination table…' }, ...sortedNodes.map(node => ({ value: node.id, label: node.data.name }))]} />
          <Button className="h-8 w-full text-xs" disabled={!pathStart || !pathEnd} onClick={findPath}>Show shortest path</Button>
          {pathAttempted && !pathResult && <p className="text-[11px] text-destructive">No path found for the selected direction.</p>}
          {pathResult && <p className="text-[11px] text-amber-600 dark:text-amber-400">{pathResult.nodeIds.length} tables · {pathResult.edgeIds.length} relationships</p>}
        </section>

        <section className="space-y-2 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Visible relationships</span><span>{activeEdges.length}</span>
          </div>
          {!selectedNodeIds.length && !pathResult ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">Click a table on the canvas.</p>
          ) : activeEdges.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No relationships at this depth.</p>
          ) : (
            <div className="space-y-1.5">
              {activeEdges.map(edge => (
                <button key={edge.id} onClick={() => void fitView({ nodes: [{ id: edge.source }, { id: edge.target }], padding: 0.8, duration: 250, maxZoom: 1.2 })} className="flex w-full items-center gap-2 rounded-lg border border-border/60 px-2.5 py-2 text-left text-[11px] hover:bg-muted">
                  <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{names.get(edge.source)}</span>
                  <ArrowDownToLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{names.get(edge.target)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
