import React from 'react';
import { Check, LayoutGrid, Loader2, Sparkles, WandSparkles, X } from 'lucide-react';
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { Button } from '@/components/ui/button';
import { suggestErdOrganizations, type ErdOrganizationSuggestion } from '@/lib/erd-organizer';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];

type Props = {
  diagramUid: string;
  nodes: Node<Entity>[];
  edges: Edge[];
  readOnly?: boolean;
  onAutoLayout: () => void;
  onClose: () => void;
};

async function errorText(response: Response, fallback: string) {
  try { return (await response.json()).error || fallback; } catch { return fallback; }
}

export function ErdOrganizerPanel({ diagramUid, nodes, edges, readOnly = false, onAutoLayout, onClose }: Props) {
  const [suggestions, setSuggestions] = React.useState<ErdOrganizationSuggestion[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [names, setNames] = React.useState<Record<string, string>>({});
  const [colors, setColors] = React.useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const analyze = React.useCallback(() => {
    setAnalyzing(true);
    setError('');
    try {
      const next = suggestErdOrganizations(nodes, edges);
      setSuggestions(next);
      setSelected(new Set(next.map(item => item.id)));
      setNames(Object.fromEntries(next.map(item => [item.id, item.name])));
      setColors(Object.fromEntries(next.map(item => [item.id, item.color])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not analyze this ERD');
    } finally {
      setAnalyzing(false);
    }
  }, [nodes, edges]);

  React.useEffect(() => { analyze(); }, [analyze]);

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const apply = async (withLayout: boolean) => {
    const chosen = suggestions.filter(item => selected.has(item.id) && item.node_ids.length);
    if (!chosen.length) return;
    setSaving(true);
    setError('');
    try {
      for (const item of chosen) {
        const response = await apiFetch(`/api/diagrams/${encodeURIComponent(diagramUid)}/subject-areas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: (names[item.id] || item.name).trim(),
            color: colors[item.id] || item.color,
            node_ids: item.node_ids,
            parent_id: null,
            viewport_x: 0,
            viewport_y: 0,
            viewport_zoom: 1,
          }),
        });
        if (!response.ok) throw new Error(await errorText(response, `Could not create ${item.name}`));
      }
      if (withLayout) onAutoLayout();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save organization');
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="absolute bottom-4 right-4 top-20 z-30 flex w-[min(440px,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl pointer-events-auto">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold"><WandSparkles className="h-4 w-4 text-primary" /> Organize ERD</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Group related tables into saved Subject Areas without changing schema.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close organizer"><X className="h-4 w-4" /></Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pb-8 custom-scrollbar">
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="text-[11px] leading-4 text-muted-foreground">Suggestions use table names, existing domain metadata, and foreign-key connections. Review names and membership before saving.</div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><div className="text-base font-black">{nodes.length}</div><div className="text-[9px] uppercase text-muted-foreground">Tables</div></div>
            <div><div className="text-base font-black">{edges.length}</div><div className="text-[9px] uppercase text-muted-foreground">Relations</div></div>
            <div><div className="text-base font-black">{suggestions.length}</div><div className="text-[9px] uppercase text-muted-foreground">Groups</div></div>
          </div>
        </section>

        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[11px] text-destructive">{error}</p>}
        {analyzing ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : suggestions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Add tables and relationships before organizing this ERD.</div>
        ) : (
          <section className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>Suggested Subject Areas</span><span>{selected.size} selected</span></div>
            {suggestions.map((item, index) => {
              const active = selected.has(item.id);
              return <div key={item.id} className={cn('rounded-xl border p-3 transition-colors', active ? 'border-primary/40 bg-primary/5' : 'border-border/60')}>
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => toggle(item.id)} className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border')} aria-label={`${active ? 'Remove' : 'Select'} ${item.name}`}>
                    {active && <Check className="h-3 w-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <input value={names[item.id] || item.name} disabled={readOnly} onChange={event => setNames(current => ({ ...current, [item.id]: event.target.value }))} className="h-7 w-full rounded-md border border-transparent bg-transparent px-1 text-xs font-bold outline-none focus:border-primary focus:bg-background" />
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.reasons.join(' · ')}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.node_ids.slice(0, 12).map(id => <span key={id} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{nodes.find(node => node.id === id)?.data.name || id}</span>)}
                      {item.node_ids.length > 12 && <span className="px-1 py-0.5 text-[9px] text-muted-foreground">+{item.node_ids.length - 12} more</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[9px] text-muted-foreground"><span>{item.node_ids.length} tables</span><span>·</span><span>{item.internal_relations} internal</span><span>·</span><span>{item.external_relations} cross-area</span><span className="ml-auto rounded border border-border/60 px-1.5 py-0.5 uppercase">{item.confidence}</span></div>
                  </div>
                  <div className="flex gap-1">
                    {COLORS.map(color => <button key={color} type="button" disabled={readOnly} onClick={() => setColors(current => ({ ...current, [item.id]: color }))} className={cn('h-3.5 w-3.5 rounded-full border', (colors[item.id] || item.color) === color ? 'border-foreground scale-110' : 'border-transparent')} style={{ backgroundColor: color }} aria-label={`Use ${color}`} />)}
                  </div>
                </div>
              </div>;
            })}
          </section>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border/60 p-3">
        <Button variant="outline" className="h-9 flex-1 text-xs" onClick={analyze} disabled={analyzing || saving}><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Re-analyze</Button>
        {!readOnly && <Button className="h-9 flex-1 text-xs" onClick={() => void apply(false)} disabled={saving || analyzing || !selected.size}>{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />} Save areas</Button>}
        {!readOnly && <Button className="h-9 px-3 text-xs" onClick={() => void apply(true)} disabled={saving || analyzing || !selected.size} title="Save areas and apply canonical auto-layout"><LayoutGrid className="h-3.5 w-3.5" /></Button>}
      </div>
    </aside>
  );
}
