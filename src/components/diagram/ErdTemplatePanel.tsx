import React from 'react';
import { Check, Database, FilePlus2, Loader2, Trash2, X } from 'lucide-react';
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { Button } from '@/components/ui/button';
import { BUILTIN_ERD_TEMPLATES, parseErdTemplate, type ErdTemplate } from '@/lib/erd-templates';
import { erdToDBML } from '@/lib/dbml-converter';
import { cn } from '@/lib/utils';
import { autoLayoutERD } from '@/lib/autoLayoutERD';
import { toast } from 'sonner';

type Props = {
  nodes: Node<Entity>[];
  edges: Edge[];
  readOnly?: boolean;
  onPreview: (nodes: Node<Entity>[], edges: Edge[]) => void;
  onClose: () => void;
};

const STORAGE_KEY = 'erd-builder-pro.templates';
function loadSaved(): ErdTemplate[] {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function saveSaved(items: ErdTemplate[]) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* storage unavailable */ } }

export function ErdTemplatePanel({ nodes, edges, readOnly = false, onPreview, onClose }: Props) {
  const [saved, setSaved] = React.useState<ErdTemplate[]>(loadSaved);
  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const apply = (template: ErdTemplate) => {
    try {
      const parsed = parseErdTemplate(template);
      const laidOut = autoLayoutERD(parsed.nodes, parsed.edges);
      onPreview(laidOut, parsed.edges);
      toast.info(`${template.name} loaded into schema preview`);
    } catch (error) { toast.error('Template could not be loaded', { description: error instanceof Error ? error.message : 'Invalid template' }); }
  };

  const saveCurrent = () => {
    if (!name.trim() || !nodes.length) return;
    setSaving(true);
    const template: ErdTemplate = {
      id: crypto.randomUUID(), name: name.trim(), description: `${nodes.length} tables · ${edges.length} relationships`,
      dbml: erdToDBML(nodes, edges),
    };
    const next = [template, ...saved];
    saveSaved(next); setSaved(next); setName(''); setSaving(false);
    toast.success('Template saved in this browser');
  };

  const remove = (id: string) => {
    const next = saved.filter(item => item.id !== id); saveSaved(next); setSaved(next);
  };

  const renderTemplate = (template: ErdTemplate) => <div key={template.id} className="rounded-xl border border-border/60 p-3">
    <div className="flex items-start gap-2"><Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="text-xs font-bold">{template.name}</div><p className="mt-1 text-[10px] text-muted-foreground">{template.description}</p></div><Button size="sm" className="h-7 px-2 text-[10px]" onClick={() => apply(template)}><Check className="mr-1 h-3 w-3" /> Preview</Button>{!template.builtin && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(template.id)} title="Delete template"><Trash2 className="h-3 w-3" /></Button>}</div>
  </div>;

  return <aside className="absolute bottom-4 right-4 top-20 z-30 flex w-[min(420px,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl pointer-events-auto">
    <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3"><div><div className="flex items-center gap-2 text-sm font-bold"><FilePlus2 className="h-4 w-4 text-primary" /> ERD Templates</div><p className="mt-0.5 text-[11px] text-muted-foreground">Load a design pattern into the existing diff/merge preview.</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button></div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar"><section className="space-y-2"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Built-in patterns</div>{BUILTIN_ERD_TEMPLATES.map(renderTemplate)}</section>{saved.length > 0 && <section className="space-y-2"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Saved in this browser</div>{saved.map(renderTemplate)}</section>}{!readOnly && <section className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Save current ERD</div><input value={name} maxLength={100} onChange={event => setName(event.target.value)} placeholder="Template name" className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary" /><Button className="h-8 w-full text-xs" disabled={saving || !name.trim() || !nodes.length} onClick={saveCurrent}>{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />} Save template</Button></section>}</div>
    <div className="border-t border-border/60 p-3"><p className={cn('text-[10px] leading-4 text-muted-foreground')}>Preview replaces current canvas in the existing schema diff. Nothing saves until you approve the merge.</p></div>
  </aside>;
}
