import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SchemaHealthIssue, SchemaHealthReport, SchemaHealthSeverity } from '@/lib/erd-schema-health';

export type SchemaHealthSelection = {
  severity: SchemaHealthSeverity;
  nodeIds: Set<string>;
  edgeIds: Set<string>;
};

type Props = {
  report: SchemaHealthReport;
  onClose: () => void;
  onSelectionChange: (selection: SchemaHealthSelection | null) => void;
};

const severityMeta = {
  error: { label: 'Errors', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/25' },
  warning: { label: 'Warnings', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/25' },
  info: { label: 'Info', icon: Info, color: 'text-sky-500', bg: 'bg-sky-500/10 border-sky-500/25' },
} satisfies Record<SchemaHealthSeverity, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }>;

export function healthScoreTone(score: number) {
  if (score >= 90) return 'text-emerald-500';
  if (score >= 70) return 'text-amber-500';
  return 'text-red-500';
}

export function ErdSchemaHealthPanel({ report, onClose, onSelectionChange }: Props) {
  const { fitView } = useReactFlow();
  const [filter, setFilter] = React.useState<SchemaHealthSeverity | 'all'>('all');
  const [selectedIssueId, setSelectedIssueId] = React.useState<string | null>(null);
  const visibleIssues = filter === 'all' ? report.issues : report.issues.filter(issue => issue.severity === filter);

  React.useEffect(() => {
    if (selectedIssueId && !report.issues.some(item => item.id === selectedIssueId)) {
      setSelectedIssueId(null);
      onSelectionChange(null);
    }
  }, [onSelectionChange, report.issues, selectedIssueId]);

  React.useEffect(() => () => onSelectionChange(null), [onSelectionChange]);

  const selectIssue = (item: SchemaHealthIssue) => {
    if (selectedIssueId === item.id) {
      setSelectedIssueId(null);
      onSelectionChange(null);
      return;
    }
    setSelectedIssueId(item.id);
    onSelectionChange({ severity: item.severity, nodeIds: new Set(item.nodeIds), edgeIds: new Set(item.edgeIds) });
    if (item.nodeIds.length) {
      requestAnimationFrame(() => void fitView({
        nodes: item.nodeIds.map(id => ({ id })), padding: 0.75, duration: 300, minZoom: 0.15, maxZoom: 1.25,
      }));
    }
  };

  return (
    <aside className="absolute right-4 top-20 z-30 w-[min(410px,calc(100vw-2rem))] max-h-[calc(100%-6rem)] overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl pointer-events-auto">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-primary" /> Schema Health</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Live structural and relationship quality checks.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close schema health"><X className="h-4 w-4" /></Button>
      </div>

      <div className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-4 custom-scrollbar">
        <section className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-current text-xl font-black', healthScoreTone(report.score))}>{report.score}</div>
          <div className="min-w-0">
            <div className="text-sm font-bold">{report.score >= 90 ? 'Healthy schema' : report.score >= 70 ? 'Needs attention' : 'High-risk schema'}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Checked {report.checkedTables} tables and {report.checkedRelationships} relationships.</p>
            <div className="mt-2 flex gap-2 text-[10px] font-semibold">
              <span className="text-red-500">{report.counts.error} errors</span>
              <span className="text-amber-500">{report.counts.warning} warnings</span>
              <span className="text-sky-500">{report.counts.info} info</span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted/60 p-1">
          {(['all', 'error', 'warning', 'info'] as const).map(value => (
            <button key={value} onClick={() => setFilter(value)} className={cn(
              'rounded-md px-1 py-1.5 text-[10px] font-semibold capitalize transition-colors',
              filter === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}>{value === 'all' ? `All (${report.issues.length})` : `${severityMeta[value].label} (${report.counts[value]})`}</button>
          ))}
        </div>

        {visibleIssues.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-5 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
            <p className="mt-2 text-xs font-bold">No issues in this category</p>
          </div>
        ) : (
          <section className="space-y-2">
            {visibleIssues.map(item => {
              const meta = severityMeta[item.severity];
              const Icon = meta.icon;
              return (
                <button key={item.id} onClick={() => selectIssue(item)} className={cn(
                  'w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/60',
                  selectedIssueId === item.id ? meta.bg : 'border-border/60',
                )}>
                  <div className="flex items-start gap-2.5">
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold leading-5">{item.title}</div>
                      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{item.description}</p>
                      <p className="mt-1.5 text-[10px] leading-4"><span className="font-bold">Fix:</span> {item.recommendation}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        )}
      </div>
    </aside>
  );
}
