import React from 'react';
import type { Node } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { BookOpenCheck, Download, Save, Search, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Entity, ErdGovernanceMetadata } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  analyzeErdGovernance,
  exportErdDictionaryCsv,
  exportErdDictionaryMarkdown,
  governanceFrom,
  normalizeErdGovernance,
  type ErdDataClassification,
} from '../../../shared/erd-governance';

export type ErdGovernanceSelection = { nodeIds: Set<string>; classification?: ErdDataClassification };

type Props = {
  nodes: Node<Entity>[];
  diagramName: string;
  readOnly: boolean;
  selectedNodeIds: string[];
  onUpdate: (tableId: string, columnId: string | null, metadata: ErdGovernanceMetadata) => void;
  onSelectionChange: (selection: ErdGovernanceSelection | null) => void;
  onClose: () => void;
};

const classificationTone: Record<string, string> = {
  public: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
  internal: 'border-sky-500/30 bg-sky-500/10 text-sky-600',
  confidential: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  restricted: 'border-red-500/30 bg-red-500/10 text-red-600',
  unclassified: 'border-border bg-muted/40 text-muted-foreground',
};

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function listText(value?: string[]) { return (value || []).join(', '); }
function parseList(value: string) { return value.split(',').map(item => item.trim()).filter(Boolean); }

export function ErdDataDictionaryPanel({ nodes, diagramName, readOnly, selectedNodeIds, onUpdate, onSelectionChange, onClose }: Props) {
  const { fitView } = useReactFlow();
  const tables = React.useMemo(() => nodes.map(node => node.data), [nodes]);
  const report = React.useMemo(() => analyzeErdGovernance(tables), [tables]);
  const initialTableId = selectedNodeIds.find(id => nodes.some(node => node.id === id)) || nodes[0]?.id || '';
  const [tableId, setTableId] = React.useState(initialTableId);
  const [columnId, setColumnId] = React.useState<string>('');
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<'gaps' | 'sensitive' | 'all'>('gaps');
  const table = nodes.find(node => node.id === tableId)?.data;
  const column = table?.columns.find(item => item.id === columnId);
  const target = column || table;
  const [draft, setDraft] = React.useState<ErdGovernanceMetadata>(() => governanceFrom(target));

  React.useEffect(() => {
    if (!tableId || !nodes.some(node => node.id === tableId)) {
      setTableId(nodes[0]?.id || '');
      setColumnId('');
    }
  }, [nodes, tableId]);

  React.useEffect(() => setDraft(governanceFrom(target)), [target]);
  React.useEffect(() => () => onSelectionChange(null), [onSelectionChange]);

  const selectTarget = (nextTableId: string, nextColumnId = '', classification?: ErdDataClassification) => {
    setTableId(nextTableId);
    setColumnId(nextColumnId);
    onSelectionChange({ nodeIds: new Set([nextTableId]), classification });
    requestAnimationFrame(() => void fitView({ nodes: [{ id: nextTableId }], padding: 0.8, duration: 300, minZoom: 0.25, maxZoom: 1.25 }));
  };

  const entries = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const gapIds = new Set(report.gaps.map(item => item.id));
    return nodes.flatMap(node => {
      const tableMeta = governanceFrom(node.data);
      const values = [{
        id: `table:${node.id}`, tableId: node.id, columnId: '', label: node.data.name, kind: 'table',
        classification: tableMeta.classification,
      }, ...node.data.columns.map(item => {
        const meta = governanceFrom(item);
        return { id: `column:${node.id}:${item.id}`, tableId: node.id, columnId: item.id, label: `${node.data.name}.${item.name}`, kind: 'column', classification: meta.classification || tableMeta.classification };
      })];
      return values.filter(item => {
        if (normalizedQuery && !item.label.toLowerCase().includes(normalizedQuery)) return false;
        if (filter === 'gaps' && !gapIds.has(item.id)) return false;
        if (filter === 'sensitive' && item.classification !== 'confidential' && item.classification !== 'restricted') return false;
        return true;
      });
    });
  }, [filter, nodes, query, report.gaps]);

  const patch = (value: Partial<ErdGovernanceMetadata>) => setDraft(current => ({ ...current, ...value }));
  const save = () => {
    if (!table) return;
    try {
      const normalized = normalizeErdGovernance({
        ...draft,
        reviewed_at: draft.review_status === 'approved' ? draft.reviewed_at || new Date().toISOString() : draft.reviewed_at,
      });
      onUpdate(table.id, column?.id || null, normalized);
      setDraft(normalized);
      toast.success(`${column ? 'Column' : 'Table'} metadata saved`);
    } catch (error: any) { toast.error(error.message || 'Invalid governance metadata'); }
  };

  const filename = (diagramName || 'erd').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'erd';

  return (
    <aside className="absolute right-4 top-20 z-30 flex w-[min(440px,calc(100vw-2rem))] max-h-[calc(100%-6rem)] flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl pointer-events-auto">
      <div className="flex items-start justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold"><BookOpenCheck className="h-4 w-4 text-primary" /> Data Dictionary</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Business definitions, ownership, classification, and review.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="overflow-y-auto p-4 custom-scrollbar">
        <section className="grid grid-cols-4 gap-2">
          <div className="col-span-1 flex min-h-16 items-center justify-center rounded-xl border border-primary/25 bg-primary/5 text-xl font-black text-primary">{report.score}%</div>
          <div className="col-span-3 grid grid-cols-3 gap-2">
            {[['Documented', `${report.documented}/${report.total}`], ['Approved', report.approved], ['Sensitive', report.sensitive]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/60 bg-muted/20 p-2 text-center"><div className="text-sm font-black">{value}</div><div className="text-[9px] text-muted-foreground">{label}</div></div>
            ))}
          </div>
        </section>

        <section className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(report.classifications).map(([key, count]) => (
            <span key={key} className={cn('rounded-md border px-2 py-1 text-[9px] font-bold capitalize', classificationTone[key])}>{key} {count}</span>
          ))}
        </section>

        <section className="mt-4 rounded-xl border border-border/60 p-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search table or column" className="h-9 pl-8 text-xs" /></div>
            <select value={filter} onChange={event => setFilter(event.target.value as any)} className="h-9 rounded-md border border-input bg-background px-2 text-[10px]">
              <option value="gaps">Gaps ({report.gaps.length})</option><option value="sensitive">Sensitive</option><option value="all">All</option>
            </select>
          </div>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto custom-scrollbar">
            {entries.length === 0 ? <div className="py-4 text-center text-[10px] text-muted-foreground">No matching objects.</div> : entries.map(item => {
              const gap = report.gaps.find(value => value.id === item.id);
              return <button key={item.id} onClick={() => selectTarget(item.tableId, item.columnId, item.classification)} className={cn('flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[10px] hover:bg-muted/60', tableId === item.tableId && columnId === item.columnId ? 'border-primary/40 bg-primary/5' : 'border-border/50')}>
                {gap ? <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : <BookOpenCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
                {gap && <span className="text-[9px] text-muted-foreground">{gap.missing.join(', ')}</span>}
              </button>;
            })}
          </div>
        </section>

        {table && <section className="mt-4 space-y-3 rounded-xl border border-border/60 p-3">
          <div className="flex items-center gap-2">
            <select value={tableId} onChange={event => selectTarget(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs font-semibold">
              {nodes.map(node => <option key={node.id} value={node.id}>{node.data.name}</option>)}
            </select>
            <select value={columnId} onChange={event => selectTarget(tableId, event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Table metadata</option>{table.columns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Business name" value={draft.business_name || ''} onChange={value => patch({ business_name: value })} />
            <Field label="Domain" value={draft.domain || ''} onChange={value => patch({ domain: value })} />
            <Field label="Owner" value={draft.owner || ''} onChange={value => patch({ owner: value })} placeholder={column ? `Inherited: ${governanceFrom(table).owner || 'none'}` : ''} />
            <Field label="Steward" value={draft.steward || ''} onChange={value => patch({ steward: value })} />
          </div>
          <label className="block text-[10px] font-semibold text-muted-foreground">Description<Textarea value={draft.description || ''} onChange={event => patch({ description: event.target.value })} rows={3} className="mt-1 text-xs" placeholder={target?.comment || 'Business meaning, source, and usage'} /></label>
          <div className="grid grid-cols-3 gap-2">
            <SelectField label="Classification" value={draft.classification || ''} onChange={value => patch({ classification: value as any || undefined })} options={['public', 'internal', 'confidential', 'restricted']} />
            <SelectField label="Lifecycle" value={draft.lifecycle || ''} onChange={value => patch({ lifecycle: value as any || undefined })} options={['draft', 'active', 'deprecated']} />
            <SelectField label="Review" value={draft.review_status || ''} onChange={value => patch({ review_status: value as any || undefined })} options={['unreviewed', 'in-review', 'approved']} />
          </div>
          <Field label="Retention policy" value={draft.retention || ''} onChange={value => patch({ retention: value })} placeholder="e.g. 7 years after account closure" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Glossary terms" value={listText(draft.glossary_terms)} onChange={value => patch({ glossary_terms: parseList(value) })} placeholder="customer, identity" />
            <Field label="Tags" value={listText(draft.tags)} onChange={value => patch({ tags: parseList(value) })} placeholder="pii, core" />
          </div>
          {!readOnly && <Button className="h-9 w-full gap-2 text-xs" onClick={save}><Save className="h-3.5 w-3.5" /> Save metadata</Button>}
        </section>}

        <section className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-9 gap-2 text-[10px]" onClick={() => download(exportErdDictionaryMarkdown(diagramName, tables), `${filename}-dictionary.md`, 'text/markdown')}><Download className="h-3.5 w-3.5" /> Markdown</Button>
          <Button variant="outline" className="h-9 gap-2 text-[10px]" onClick={() => download(exportErdDictionaryCsv(tables), `${filename}-dictionary.csv`, 'text/csv')}><Download className="h-3.5 w-3.5" /> CSV</Button>
        </section>
      </div>
    </aside>
  );
}

function Field({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block text-[10px] font-semibold text-muted-foreground">{label}<Input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-1 h-8 text-[11px]" /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block text-[10px] font-semibold text-muted-foreground">{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-1.5 text-[10px] capitalize"><option value="">—</option>{options.map(item => <option key={item} value={item}>{item}</option>)}</select></label>;
}
