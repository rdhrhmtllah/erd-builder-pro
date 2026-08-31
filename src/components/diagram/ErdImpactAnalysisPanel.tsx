import React from 'react';
import type { Edge, Node } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { AlertTriangle, CheckCircle2, Clipboard, Radar, Route, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Entity } from '@/types';
import {
  analyzeErdImpact,
  type ErdImpactOperation,
  type ErdImpactReport,
  type ErdImpactRisk,
} from '../../../shared/erd-impact';
import { cn } from '@/lib/utils';

export type ErdImpactSelection = {
  rootNodeId: string;
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  risk: ErdImpactRisk;
};

type Props = {
  nodes: Node<Entity>[];
  edges: Edge[];
  selectedNodeIds: string[];
  onClose: () => void;
  onSelectionChange: (selection: ErdImpactSelection | null) => void;
};

const operations: Array<{ value: ErdImpactOperation; label: string; description: string }> = [
  { value: 'table-delete', label: 'Delete table', description: 'Foreign keys and transitive dependants' },
  { value: 'table-rename', label: 'Rename table', description: 'Relationships and application contracts' },
  { value: 'column-delete', label: 'Delete column', description: 'Keys and relationships using this column' },
  { value: 'column-rename', label: 'Rename column', description: 'Queries, models, and relationship metadata' },
  { value: 'column-type-change', label: 'Change column type', description: 'Castability and matching foreign keys' },
  { value: 'column-nullability-change', label: 'Change nullability', description: 'Data backfill and optional relationships' },
];

const riskStyle: Record<ErdImpactRisk, { text: string; badge: string; bar: string }> = {
  low: { text: 'text-emerald-500', badge: 'border-emerald-500/30 bg-emerald-500/10', bar: 'bg-emerald-500' },
  medium: { text: 'text-sky-500', badge: 'border-sky-500/30 bg-sky-500/10', bar: 'bg-sky-500' },
  high: { text: 'text-amber-500', badge: 'border-amber-500/30 bg-amber-500/10', bar: 'bg-amber-500' },
  critical: { text: 'text-red-500', badge: 'border-red-500/30 bg-red-500/10', bar: 'bg-red-500' },
};

const columnIdFromHandle = (handle?: string | null) => handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') || '';

function reportAsText(report: ErdImpactReport) {
  const lines = [
    `ERD Impact Analysis — ${report.operation}`,
    `Target: ${report.root.table_name}${report.root.column_name ? `.${report.root.column_name}` : ''}`,
    `Risk: ${report.risk.toUpperCase()} (${report.risk_score}/100)`,
    report.summary,
    '',
    'Direct impact:',
    ...report.direct_tables.map(item => `- ${item.name}: ${item.reasons.join(' ')} Path: ${item.path_table_names.join(' -> ')}`),
    '',
    'Transitive impact:',
    ...(report.transitive_tables.length
      ? report.transitive_tables.map(item => `- ${item.name}: ${item.reasons.join(' ')} Path: ${item.path_table_names.join(' -> ')}`)
      : ['- None']),
    '',
    'Recommendations:',
    ...report.recommendations.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Assumptions:',
    ...report.assumptions.map(item => `- ${item}`),
  ];
  return lines.join('\n');
}

export function ErdImpactAnalysisPanel({ nodes, edges, selectedNodeIds, onClose, onSelectionChange }: Props) {
  const { fitView } = useReactFlow();
  const sortedNodes = React.useMemo(() => [...nodes].sort((a, b) => String(a.data.name).localeCompare(String(b.data.name))), [nodes]);
  const [tableId, setTableId] = React.useState(selectedNodeIds[0] || sortedNodes[0]?.id || '');
  const [operation, setOperation] = React.useState<ErdImpactOperation>('table-delete');
  const selectedTable = nodes.find(node => node.id === tableId);
  const sortedColumns = React.useMemo(() => [...(selectedTable?.data.columns || [])].sort((a, b) => a.name.localeCompare(b.name)), [selectedTable]);
  const [columnId, setColumnId] = React.useState(sortedColumns[0]?.id || '');
  const requiresColumn = operation.startsWith('column-');

  React.useEffect(() => {
    if (selectedNodeIds[0] && nodes.some(node => node.id === selectedNodeIds[0])) setTableId(selectedNodeIds[0]);
  }, [nodes, selectedNodeIds]);

  React.useEffect(() => {
    if (!nodes.some(node => node.id === tableId)) setTableId(sortedNodes[0]?.id || '');
  }, [nodes, sortedNodes, tableId]);

  React.useEffect(() => {
    if (!sortedColumns.some(column => column.id === columnId)) setColumnId(sortedColumns[0]?.id || '');
  }, [columnId, sortedColumns]);

  const impactRelationships = React.useMemo(() => edges.map(edge => ({
    id: edge.id,
    source_entity_id: edge.source,
    target_entity_id: edge.target,
    source_column_id: columnIdFromHandle(edge.sourceHandle),
    target_column_id: columnIdFromHandle(edge.targetHandle),
    constraint_name: (edge.data as any)?.constraint_name,
  })), [edges]);
  const report = React.useMemo(() => {
    if (!selectedTable || (requiresColumn && !columnId)) return null;
    try {
      return analyzeErdImpact(nodes.map(node => ({ id: node.id, name: node.data.name, columns: node.data.columns })), impactRelationships, {
        operation, table_id: tableId, ...(requiresColumn ? { column_id: columnId } : {}),
      });
    } catch {
      return null;
    }
  }, [columnId, impactRelationships, nodes, operation, requiresColumn, selectedTable, tableId]);

  React.useEffect(() => {
    if (!report) {
      onSelectionChange(null);
      return;
    }
    onSelectionChange({
      rootNodeId: report.root.table_id,
      nodeIds: new Set([report.root.table_id, ...report.affected_table_ids]),
      edgeIds: new Set(report.affected_relationship_ids),
      risk: report.risk,
    });
    return () => onSelectionChange(null);
  }, [onSelectionChange, report]);

  const focusPath = (path: string[]) => requestAnimationFrame(() => void fitView({
    nodes: path.map(id => ({ id })), padding: 0.65, duration: 300, minZoom: 0.15, maxZoom: 1.25,
  }));

  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportAsText(report));
      toast.success('Impact report copied');
    } catch {
      toast.error('Could not copy the impact report');
    }
  };

  const style = report ? riskStyle[report.risk] : riskStyle.low;
  return (
    <aside className="absolute right-4 top-20 z-30 w-[min(420px,calc(100vw-2rem))] max-h-[calc(100%-6rem)] overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl pointer-events-auto">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold"><Radar className="h-4 w-4 text-primary" /> Impact Analysis</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Simulate a schema change before writing a migration.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close impact analysis"><X className="h-4 w-4" /></Button>
      </div>

      <div className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-4 custom-scrollbar">
        <section className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Table
            <select value={tableId} onChange={event => setTableId(event.target.value)} className="h-9 w-full rounded-md border border-border bg-muted/30 px-2 text-xs font-normal normal-case text-foreground outline-none focus:border-primary">
              {sortedNodes.map(node => <option key={node.id} value={node.id}>{node.data.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Change
            <select value={operation} onChange={event => setOperation(event.target.value as ErdImpactOperation)} className="h-9 w-full rounded-md border border-border bg-muted/30 px-2 text-xs font-normal normal-case text-foreground outline-none focus:border-primary">
              {operations.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </section>
        <p className="-mt-2 text-[10px] text-muted-foreground">{operations.find(item => item.value === operation)?.description}</p>
        {requiresColumn && (
          <label className="block space-y-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Column
            <select value={columnId} onChange={event => setColumnId(event.target.value)} disabled={!sortedColumns.length} className="h-9 w-full rounded-md border border-border bg-muted/30 px-2 text-xs font-normal normal-case text-foreground outline-none focus:border-primary disabled:opacity-50">
              {!sortedColumns.length && <option value="">No columns</option>}
              {sortedColumns.map(column => <option key={column.id} value={column.id}>{column.name} · {column.type}</option>)}
            </select>
          </label>
        )}

        {!report ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Select a valid table and column to analyze.</div>
        ) : (
          <>
            <section className={cn('rounded-xl border p-3', style.badge)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><AlertTriangle className={cn('h-4 w-4', style.text)} /><span className={cn('text-xs font-black uppercase', style.text)}>{report.risk} risk</span></div>
                <span className="font-mono text-sm font-black">{report.risk_score}/100</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/70"><div className={cn('h-full rounded-full', style.bar)} style={{ width: `${report.risk_score}%` }} /></div>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{report.summary}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-sm font-black">{report.direct_tables.length}</div><div className="text-[9px] uppercase text-muted-foreground">Direct</div></div>
                <div><div className="text-sm font-black">{report.transitive_tables.length}</div><div className="text-[9px] uppercase text-muted-foreground">Transitive</div></div>
                <div><div className="text-sm font-black">{report.affected_relationship_ids.length}</div><div className="text-[9px] uppercase text-muted-foreground">Relations</div></div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>Dependency paths</span><span>{report.affected_table_ids.length}</span></div>
              {report.direct_tables.length + report.transitive_tables.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center"><CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500" /><p className="mt-1 text-[11px] font-bold">No modeled table dependencies</p></div>
              ) : [...report.direct_tables, ...report.transitive_tables].map(item => (
                <button key={item.id} onClick={() => focusPath(item.path_table_ids)} className="w-full rounded-xl border border-border/60 p-2.5 text-left hover:bg-muted/60">
                  <div className="flex items-center gap-2"><Route className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-xs font-bold">{item.name}</span><span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold">{item.depth === 1 ? 'DIRECT' : `HOP ${item.depth}`}</span></div>
                  <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground">{item.path_table_names.join(' → ')}</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.reasons[0]}</p>
                </button>
              ))}
            </section>

            <section className="space-y-2 border-t border-border/60 pt-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Migration checklist</div>
              <ol className="space-y-2">
                {report.recommendations.map((item, index) => <li key={item} className="flex gap-2 text-[10px] leading-4"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-black text-primary">{index + 1}</span><span>{item}</span></li>)}
              </ol>
            </section>
            <Button variant="outline" className="h-9 w-full gap-2 text-xs" onClick={copyReport}><Clipboard className="h-3.5 w-3.5" /> Copy impact report</Button>
          </>
        )}
      </div>
    </aside>
  );
}
