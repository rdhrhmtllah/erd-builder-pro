import React from 'react';
import type { Edge, Node } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { AlertTriangle, CheckCircle2, Clipboard, Code2, Download, GitCompareArrows, Loader2, Play, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import type { Entity } from '@/types';
import { dbmlToERD, erdToDBML } from '@/lib/dbml-converter';
import { canvasToMigrationSchema, historySnapshotToMigrationSchema } from '@/lib/erd-migration-adapter';
import {
  planErdMigration,
  type ErdMigrationDialect,
  type ErdMigrationPlan,
  type ErdMigrationRisk,
  type ErdMigrationStep,
} from '../../../shared/erd-migration-planner';
import { cn } from '@/lib/utils';

export type ErdMigrationSelection = {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  risk: ErdMigrationRisk;
};

type Revision = { id: string; version: number; change_type: string; created_at: string };
type Props = {
  nodes: Node<Entity>[];
  edges: Edge[];
  diagramUid?: string | null;
  onClose: () => void;
  onSelectionChange: (selection: ErdMigrationSelection | null) => void;
};

const riskStyle: Record<ErdMigrationRisk, string> = {
  safe: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  caution: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  breaking: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
};

function downloadText(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/sql;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ErdMigrationPlannerPanel({ nodes, edges, diagramUid, onClose, onSelectionChange }: Props) {
  const { fitView } = useReactFlow();
  const currentSchema = React.useMemo(() => canvasToMigrationSchema(nodes, edges), [nodes, edges]);
  const [mode, setMode] = React.useState<'proposal' | 'history'>('proposal');
  const [proposalDbml, setProposalDbml] = React.useState(() => erdToDBML(nodes, edges));
  const [plan, setPlan] = React.useState<ErdMigrationPlan>(() => planErdMigration(currentSchema, currentSchema));
  const [error, setError] = React.useState<string | null>(null);
  const [dialect, setDialect] = React.useState<ErdMigrationDialect>('postgresql');
  const [direction, setDirection] = React.useState<'forward' | 'rollback'>('forward');
  const [selectedStepId, setSelectedStepId] = React.useState<string | null>(null);
  const [revisions, setRevisions] = React.useState<Revision[]>([]);
  const [revisionId, setRevisionId] = React.useState('');
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  React.useEffect(() => () => onSelectionChange(null), [onSelectionChange]);

  React.useEffect(() => {
    if (mode !== 'history' || !diagramUid) return;
    let cancelled = false;
    setLoadingHistory(true);
    apiFetch(`/api/entity-changes/diagrams/${encodeURIComponent(diagramUid)}?limit=100`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Failed to load diagram history');
        if (cancelled) return;
        const items = (body.revisions || []) as Revision[];
        setRevisions(items);
        setRevisionId(value => items.some(item => item.id === value) ? value : items[0]?.id || '');
      })
      .catch(cause => { if (!cancelled) setError(cause.message); })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [diagramUid, mode]);

  const analyzeProposal = () => {
    try {
      const proposed = dbmlToERD(proposalDbml);
      setPlan(planErdMigration(currentSchema, canvasToMigrationSchema(proposed.nodes as Node<Entity>[], proposed.edges)));
      setError(null);
      setSelectedStepId(null);
      onSelectionChange(null);
    } catch (cause: any) {
      setError(cause?.message || 'Invalid DBML proposal');
    }
  };

  const analyzeHistory = async () => {
    if (!diagramUid || !revisionId) return;
    setLoadingHistory(true);
    try {
      const response = await apiFetch(`/api/entity-changes/diagrams/${encodeURIComponent(diagramUid)}/${encodeURIComponent(revisionId)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to load historical schema');
      setPlan(planErdMigration(historySnapshotToMigrationSchema(body.snapshot || {}), currentSchema));
      setError(null);
      setSelectedStepId(null);
      onSelectionChange(null);
    } catch (cause: any) {
      setError(cause?.message || 'Failed to compare historical schema');
    } finally {
      setLoadingHistory(false);
    }
  };

  const selectStep = (item: ErdMigrationStep) => {
    if (selectedStepId === item.id) {
      setSelectedStepId(null);
      onSelectionChange(null);
      return;
    }
    setSelectedStepId(item.id);
    const existingNodeIds = item.affected_table_ids.filter(id => nodes.some(node => node.id === id));
    const existingEdgeIds = item.affected_relationship_ids.filter(id => edges.some(edge => edge.id === id));
    onSelectionChange({ nodeIds: new Set(existingNodeIds), edgeIds: new Set(existingEdgeIds), risk: item.risk });
    if (existingNodeIds.length) requestAnimationFrame(() => void fitView({
      nodes: existingNodeIds.map(id => ({ id })), padding: 0.75, duration: 300, minZoom: 0.15, maxZoom: 1.25,
    }));
  };

  const sql = plan.sql[dialect][direction];
  const copySql = async () => {
    try { await navigator.clipboard.writeText(sql); toast.success(`${direction === 'forward' ? 'Forward' : 'Rollback'} SQL copied`); }
    catch { toast.error('Could not copy SQL'); }
  };

  return (
    <aside className="absolute right-4 top-20 z-30 w-[min(470px,calc(100vw-2rem))] max-h-[calc(100%-6rem)] overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl pointer-events-auto">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold"><GitCompareArrows className="h-4 w-4 text-primary" /> Migration Planner</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Ordered schema diff with forward and rollback SQL.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close migration planner"><X className="h-4 w-4" /></Button>
      </div>

      <div className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
          <button onClick={() => { setMode('proposal'); setError(null); }} className={cn('rounded-md px-2 py-1.5 text-[11px] font-semibold', mode === 'proposal' ? 'bg-background shadow-sm' : 'text-muted-foreground')}>Current → Proposal</button>
          <button disabled={!diagramUid} onClick={() => { setMode('history'); setError(null); }} className={cn('rounded-md px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40', mode === 'history' ? 'bg-background shadow-sm' : 'text-muted-foreground')}>History → Current</button>
        </div>

        {mode === 'proposal' ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target DBML</span><button className="text-[10px] font-semibold text-primary" onClick={() => setProposalDbml(erdToDBML(nodes, edges))}>Reset to current</button></div>
            <textarea value={proposalDbml} onChange={event => setProposalDbml(event.target.value)} spellCheck={false} className="h-36 w-full resize-y rounded-lg border border-border bg-muted/20 p-2.5 font-mono text-[10px] leading-4 outline-none focus:border-primary" />
            <Button className="h-9 w-full gap-2 text-xs" onClick={analyzeProposal}><Play className="h-3.5 w-3.5" /> Analyze proposal</Button>
          </section>
        ) : (
          <section className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Historical baseline</div>
            <SearchableSelect value={revisionId} onValueChange={setRevisionId} disabled={loadingHistory || !revisions.length} className="h-9 text-xs" searchPlaceholder="Search version..." options={revisions.length ? revisions.map(item => ({ value: item.id, label: `v${item.version} · ${new Date(item.created_at).toLocaleString()} · ${item.change_type}` })) : [{ value: '', label: 'No saved versions' }]} />
            <Button className="h-9 w-full gap-2 text-xs" disabled={!revisionId || loadingHistory} onClick={() => void analyzeHistory()}>{loadingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompareArrows className="h-3.5 w-3.5" />} Compare version to current</Button>
          </section>
        )}

        {error && <div className="whitespace-pre-wrap rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-[10px] leading-4 text-red-600 dark:text-red-400">{error}</div>}

        <section className="grid grid-cols-4 gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 text-center">
          <div><div className="text-sm font-black">{plan.summary.total}</div><div className="text-[9px] uppercase text-muted-foreground">Steps</div></div>
          <div><div className="text-sm font-black text-emerald-500">{plan.summary.safe}</div><div className="text-[9px] uppercase text-muted-foreground">Safe</div></div>
          <div><div className="text-sm font-black text-amber-500">{plan.summary.caution}</div><div className="text-[9px] uppercase text-muted-foreground">Caution</div></div>
          <div><div className="text-sm font-black text-red-500">{plan.summary.breaking}</div><div className="text-[9px] uppercase text-muted-foreground">Breaking</div></div>
        </section>

        {plan.summary.total === 0 ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500" /><p className="mt-1 text-xs font-bold">Schemas are equivalent</p><p className="mt-1 text-[10px] text-muted-foreground">Analyze a changed proposal or historical version to generate a plan.</p></div>
        ) : (
          <section className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ordered execution plan</div>
            {plan.steps.map((item, index) => (
              <button key={item.id} onClick={() => selectStep(item)} className={cn('w-full rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/60', selectedStepId === item.id ? riskStyle[item.risk] : 'border-border/60')}>
                <div className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-black">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-bold">{item.title}</span><span className={cn('rounded border px-1.5 py-0.5 text-[8px] font-black uppercase', riskStyle[item.risk])}>{item.risk}</span></div>
                <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground">{item.object}</p>
                {item.warnings[0] && <p className="mt-1 flex gap-1 text-[9px] leading-3 text-muted-foreground"><AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />{item.warnings[0]}</p>}
              </button>
            ))}
          </section>
        )}

        {plan.summary.total > 0 && (
          <section className="space-y-2 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Code2 className="h-3.5 w-3.5" /> Migration SQL</div><span className="text-[9px] text-muted-foreground">{plan.summary.reversible}/{plan.summary.total} reversible</span></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">{(['postgresql', 'mysql'] as const).map(item => <button key={item} onClick={() => setDialect(item)} className={cn('rounded px-1 py-1 text-[9px] font-bold uppercase', dialect === item ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{item}</button>)}</div>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">{(['forward', 'rollback'] as const).map(item => <button key={item} onClick={() => setDirection(item)} className={cn('rounded px-1 py-1 text-[9px] font-bold uppercase', direction === item ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{item}</button>)}</div>
            </div>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-slate-950 p-3 font-mono text-[9px] leading-4 text-slate-100 custom-scrollbar">{sql}</pre>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-8 gap-2 text-[10px]" onClick={() => void copySql()}><Clipboard className="h-3.5 w-3.5" /> Copy SQL</Button>
              <Button variant="outline" className="h-8 gap-2 text-[10px]" onClick={() => downloadText(sql, `${direction}-${dialect}-migration.sql`)}><Download className="h-3.5 w-3.5" /> Download</Button>
            </div>
            {plan.warnings.map(item => <p key={item} className="flex gap-1.5 text-[9px] leading-4 text-muted-foreground"><RotateCcw className="mt-0.5 h-3 w-3 shrink-0" />{item}</p>)}
          </section>
        )}
      </div>
    </aside>
  );
}
