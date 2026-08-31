import React from 'react';
import { Layers3, Loader2, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ErdPerspectiveData, ErdPerspectiveSection } from '../../../shared/erd-perspectives';

export type ErdPerspective = ErdPerspectiveData & {
  id: string;
  name: string;
  description: string;
  created_at?: string;
  updated_at?: string;
};

type Props = {
  diagramUid: string;
  selectedNodeIds: string[];
  nodeNames: Map<string, string>;
  activePerspective: ErdPerspective | null;
  readOnly?: boolean;
  onActivePerspectiveChange: (perspective: ErdPerspective | null) => void;
  onClose: () => void;
};

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#a855f7', '#ef4444'];

async function errorText(response: Response, fallback: string) {
  try { return (await response.json()).error || fallback; } catch { return fallback; }
}

export function ErdPerspectivePanel({ diagramUid, selectedNodeIds, nodeNames, activePerspective, readOnly = false, onActivePerspectiveChange, onClose }: Props) {
  const [items, setItems] = React.useState<ErdPerspective[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState('');
  const [sectionName, setSectionName] = React.useState('');
  const [color, setColor] = React.useState(COLORS[0]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/diagrams/${encodeURIComponent(diagramUid)}/perspectives`);
      if (!response.ok) throw new Error(await errorText(response, 'Could not load perspectives'));
      setItems((await response.json()).data || []);
    } catch (error: any) { toast.error('Perspectives unavailable', { description: error.message }); }
    finally { setLoading(false); }
  }, [diagramUid]);

  React.useEffect(() => { void load(); }, [load]);

  const activate = (perspective: ErdPerspective | null) => onActivePerspectiveChange(perspective);

  const create = async () => {
    if (!name.trim() || !selectedNodeIds.length) return;
    setSaving(true);
    try {
      const response = await apiFetch(`/api/diagrams/${encodeURIComponent(diagramUid)}/perspectives`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), sections: [{ name: sectionName.trim() || 'Core flow', color, node_ids: selectedNodeIds, order: 0 }] }),
      });
      if (!response.ok) throw new Error(await errorText(response, 'Could not create perspective'));
      const created = await response.json();
      setItems(current => [created, ...current]); setName(''); setSectionName(''); activate(created);
      toast.success(`Perspective “${created.name}” created`);
    } catch (error: any) { toast.error('Failed to create perspective', { description: error.message }); }
    finally { setSaving(false); }
  };

  const update = async (perspective: ErdPerspective, patch: Record<string, unknown>, endpoint = '') => {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/diagrams/${encodeURIComponent(diagramUid)}/perspectives/${encodeURIComponent(perspective.id)}${endpoint}`, {
        method: endpoint ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(await errorText(response, 'Could not save perspective'));
      const saved = await response.json() as ErdPerspective;
      setItems(current => current.map(item => item.id === saved.id ? saved : item));
      activate(saved);
      return saved;
    } catch (error: any) { toast.error('Failed to save perspective', { description: error.message }); return null; }
    finally { setSaving(false); }
  };

  const addSection = async () => {
    if (!activePerspective || !sectionName.trim() || !selectedNodeIds.length) return;
    const used = new Set(activePerspective.sections.flatMap(section => section.node_ids));
    const incoming = selectedNodeIds.filter(id => !used.has(id));
    if (!incoming.length) { toast.info('Selected tables are already in this perspective'); return; }
    const section: ErdPerspectiveSection = { id: crypto.randomUUID(), name: sectionName.trim(), color, node_ids: incoming, order: activePerspective.sections.length };
    const saved = await update(activePerspective, { sections: [...activePerspective.sections, section] });
    if (saved) { setSectionName(''); toast.success('Section added. Use Re-layout to arrange it.'); }
  };

  const autoLayout = async (perspective: ErdPerspective) => {
    const saved = await update(perspective, {}, '/auto-layout');
    if (saved) toast.success('Perspective re-laid out without changing the main ERD');
  };

  const remove = async (perspective: ErdPerspective) => {
    if (!window.confirm(`Delete perspective “${perspective.name}”? The ERD schema will not be deleted.`)) return;
    setSaving(true);
    try {
      const response = await apiFetch(`/api/diagrams/${encodeURIComponent(diagramUid)}/perspectives/${encodeURIComponent(perspective.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await errorText(response, 'Could not delete perspective'));
      setItems(current => current.filter(item => item.id !== perspective.id));
      if (activePerspective?.id === perspective.id) activate(null);
    } catch (error: any) { toast.error('Failed to delete perspective', { description: error.message }); }
    finally { setSaving(false); }
  };

  return <aside className="absolute right-4 top-20 z-30 w-[min(400px,calc(100vw-2rem))] max-h-[calc(100%-6rem)] overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl pointer-events-auto">
    <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
      <div><div className="flex items-center gap-2 text-sm font-bold"><Layers3 className="h-4 w-4 text-primary" /> Perspective Studio</div><p className="mt-0.5 text-[11px] text-muted-foreground">Colored section layouts without changing the canonical ERD.</p></div>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
    </div>
    <div className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-4 custom-scrollbar">
      <Button variant={!activePerspective ? 'secondary' : 'outline'} className="h-9 w-full justify-start text-xs" onClick={() => activate(null)}>All tables — canonical layout</Button>
      {!readOnly && <section className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{activePerspective ? 'Add section from selection' : 'Create perspective from selection'}</div>
        {!activePerspective && <input value={name} maxLength={100} onChange={event => setName(event.target.value)} placeholder="Perspective name, e.g. Admin Operations" className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary" />}
        <input value={sectionName} maxLength={100} onChange={event => setSectionName(event.target.value)} placeholder={activePerspective ? 'Section name, e.g. Approval' : 'First section, e.g. Employee Master'} className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary" />
        <div className="flex items-center gap-1.5">{COLORS.map(item => <button key={item} type="button" onClick={() => setColor(item)} className={cn('h-6 w-6 rounded-full border-2', color === item ? 'scale-110 border-foreground' : 'border-transparent')} style={{ backgroundColor: item }} />)}<span className="ml-auto text-[11px] text-muted-foreground">{selectedNodeIds.length} selected</span></div>
        <Button className="h-8 w-full text-xs" disabled={saving || !selectedNodeIds.length || !sectionName.trim() || (!activePerspective && !name.trim())} onClick={() => void (activePerspective ? addSection() : create())}>{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}{activePerspective ? 'Add section' : 'Create perspective'}</Button>
      </section>}
      <section className="space-y-2"><div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>Saved perspectives</span><span>{items.length}</span></div>
        {loading ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div> : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">Select tables, then create your first business perspective.</p> : items.map(item => <div key={item.id} className={cn('rounded-xl border p-2.5', activePerspective?.id === item.id ? 'border-primary/50 bg-primary/5' : 'border-border/60')}>
          <button className="w-full text-left" onClick={() => activate(item)}><div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{item.name}</span><span className="text-[10px] text-muted-foreground">{item.sections.length} sections</span></div>{item.description && <p className="mt-1 truncate text-[10px] text-muted-foreground">{item.description}</p>}</button>
          <div className="mt-2 flex flex-wrap gap-1"><Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => activate(item)}>Open</Button>{!readOnly && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" disabled={saving} onClick={() => void autoLayout(item)}><Save className="mr-1 h-3 w-3" />Re-layout</Button>}{!readOnly && <Button size="icon" variant="ghost" className="ml-auto h-7 w-7 text-destructive" disabled={saving} onClick={() => void remove(item)}><Trash2 className="h-3 w-3" /></Button>}</div>
          {activePerspective?.id === item.id && <div className="mt-2 flex flex-wrap gap-1">{item.sections.map(section => <span key={section.id} className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: `${section.color}80`, color: section.color }}>{section.name}: {section.node_ids.filter(id => nodeNames.has(id)).length}</span>)}</div>}
        </div>)}</section>
    </div>
  </aside>;
}
