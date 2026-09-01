import React from 'react';
import { useReactFlow, type Edge, type Node } from '@xyflow/react';
import { Check, ChevronRight, FolderKanban, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { flattenSubjectAreaTree, getSubjectAreaBoundary, getSubjectAreaDescendantIds, type ErdSubjectArea } from '@/lib/erd-subject-areas';

type Props = {
  diagramUid: string;
  selectedNodeIds: string[];
  nodeNames: Map<string, string>;
  nodes: Node[];
  edges: Edge[];
  activeArea: ErdSubjectArea | null;
  readOnly?: boolean;
  onActiveAreaChange: (area: ErdSubjectArea | null) => void;
  onClose: () => void;
};

const colors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7'];

async function responseError(response: Response, fallback: string): Promise<string> {
  try { return (await response.json()).error || fallback; } catch { return fallback; }
}

export function ErdSubjectAreaPanel({
  diagramUid,
  selectedNodeIds,
  nodeNames,
  nodes,
  edges,
  activeArea,
  readOnly = false,
  onActiveAreaChange,
  onClose,
}: Props) {
  const { getViewport, fitView } = useReactFlow();
  const [areas, setAreas] = React.useState<ErdSubjectArea[]>([]);
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState(colors[0]);
  const [parentId, setParentId] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');

  const load = React.useCallback(async (silent = false): Promise<ErdSubjectArea[]> => {
    if (!silent) setLoading(true);
    try {
      const response = await apiFetch(`/api/diagrams/${encodeURIComponent(diagramUid)}/subject-areas`);
      if (!response.ok) throw new Error(await responseError(response, 'Could not load subject areas'));
      const payload = await response.json();
      const nextAreas = payload.data || [];
      setAreas(nextAreas);
      return nextAreas;
    } catch (error: any) {
      toast.error('Subject areas unavailable', { description: error.message });
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, [diagramUid]);

  React.useEffect(() => { void load(); }, [load]);

  const orderedAreas = React.useMemo(() => flattenSubjectAreaTree(areas), [areas]);

  const activeBoundary = React.useMemo(() => activeArea
    ? getSubjectAreaBoundary(nodes, edges, activeArea.effective_node_ids || activeArea.node_ids)
    : null, [activeArea, nodes, edges]);

  const applyArea = React.useCallback((area: ErdSubjectArea | null) => {
    onActiveAreaChange(area);
    if (area) {
      const ids = area.effective_node_ids || area.node_ids;
      requestAnimationFrame(() => void fitView({ nodes: ids.map(id => ({ id })), padding: 0.24, duration: 360, minZoom: 0.18, maxZoom: 1.15 }));
    }
  }, [onActiveAreaChange, fitView]);

  const openBoundaryNeighbour = React.useCallback((nodeId: string) => {
    const ids = activeArea ? [...(activeArea.effective_node_ids || activeArea.node_ids), nodeId] : [nodeId];
    onActiveAreaChange(null);
    requestAnimationFrame(() => void fitView({ nodes: ids.map(id => ({ id })), padding: 0.24, duration: 320, minZoom: 0.18, maxZoom: 1.15 }));
  }, [activeArea, onActiveAreaChange, fitView]);

  const createArea = async () => {
    if (!name.trim() || !selectedNodeIds.length) return;
    setSaving(true);
    try {
      const viewport = getViewport();
      const response = await apiFetch(`/api/diagrams/${encodeURIComponent(diagramUid)}/subject-areas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), color, node_ids: selectedNodeIds, parent_id: parentId || null,
          viewport_x: viewport.x, viewport_y: viewport.y, viewport_zoom: viewport.zoom,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not create subject area'));
      const created: ErdSubjectArea = await response.json();
      const refreshed = await load(true);
      setName('');
      setParentId('');
      applyArea(refreshed.find(item => item.id === created.id) || created);
      toast.success(`Subject area “${created.name}” saved`);
    } catch (error: any) {
      toast.error('Failed to save subject area', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const updateArea = async (area: ErdSubjectArea, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/diagrams/${encodeURIComponent(diagramUid)}/subject-areas/${encodeURIComponent(area.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not update subject area'));
      const updated: ErdSubjectArea = await response.json();
      const refreshed = await load(true);
      const currentArea = refreshed.find(item => item.id === updated.id) || updated;
      if (activeArea?.id === updated.id) onActiveAreaChange(currentArea);
      return currentArea;
    } catch (error: any) {
      toast.error('Failed to update subject area', { description: error.message });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveCurrentView = async (area: ErdSubjectArea) => {
    const viewport = getViewport();
    const updated = await updateArea(area, {
      viewport_x: viewport.x, viewport_y: viewport.y, viewport_zoom: viewport.zoom,
    });
    if (updated) toast.success('Saved current viewport');
  };

  const replaceTables = async (area: ErdSubjectArea) => {
    if (!selectedNodeIds.length) return;
    const updated = await updateArea(area, { node_ids: selectedNodeIds });
    if (updated) { applyArea(updated); toast.success('Subject area tables updated'); }
  };

  const renameArea = async (area: ErdSubjectArea) => {
    if (!renameValue.trim()) return;
    const updated = await updateArea(area, { name: renameValue.trim() });
    if (updated) setRenamingId(null);
  };

  const removeArea = async (area: ErdSubjectArea) => {
    if (!window.confirm(`Delete subject area “${area.name}”? The ERD tables will not be deleted.`)) return;
    setSaving(true);
    try {
      const response = await apiFetch(`/api/diagrams/${encodeURIComponent(diagramUid)}/subject-areas/${encodeURIComponent(area.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await responseError(response, 'Could not delete subject area'));
      await load(true);
      if (activeArea?.id === area.id) onActiveAreaChange(null);
      toast.success('Subject area deleted');
    } catch (error: any) {
      toast.error('Failed to delete subject area', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="absolute bottom-4 right-4 top-20 z-30 flex w-[min(380px,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl pointer-events-auto">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold"><FolderKanban className="h-4 w-4 text-primary" /> Subject Areas</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Saved module views without duplicating the schema.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close subject areas"><X className="h-4 w-4" /></Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-8 custom-scrollbar">
        <Button variant={activeArea ? 'outline' : 'secondary'} className="h-9 w-full justify-start text-xs" onClick={() => applyArea(null)}>
          {!activeArea && <Check className="mr-2 h-3.5 w-3.5" />} All tables
        </Button>

        {activeArea && activeBoundary && (
          <section className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>Area relations</span><span>{activeBoundary.internal_relations} internal · {activeBoundary.external_relations} cross-area</span></div>
            {activeBoundary.neighbours.length ? <div className="space-y-1">
              {activeBoundary.neighbours.slice(0, 6).map(item => <button key={item.node_id} onClick={() => openBoundaryNeighbour(item.node_id)} className="flex w-full items-center justify-between rounded-md border border-border/50 px-2 py-1.5 text-left text-[11px] hover:bg-background" title="Open this external table with the current Area">
                <span className="truncate">↗ {nodeNames.get(item.node_id) || item.node_id}</span><span className="ml-2 shrink-0 text-muted-foreground">{item.relation_count} · {item.direction}</span>
              </button>)}
            </div> : <p className="text-[11px] text-muted-foreground">No relationships leave this Area.</p>}
          </section>
        )}

        {!readOnly && (
          <section className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Create from selection</div>
            <input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="Area name, e.g. Payroll" className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary" />
            <SearchableSelect
              value={parentId}
              onValueChange={setParentId}
              className="h-8 text-xs"
              placeholder="Top-level area"
              searchPlaceholder="Search parent area..."
              options={[
                { value: '', label: 'Top-level area' },
                ...orderedAreas.map(area => ({ value: area.id, label: `${'— '.repeat(area.depth || 0)}${area.name}`, searchText: area.name })),
              ]}
            />
            <div className="flex items-center gap-1.5">
              {colors.map(item => <button key={item} type="button" aria-label={`Use color ${item}`} onClick={() => setColor(item)} className={cn('h-6 w-6 rounded-full border-2 transition-transform', color === item ? 'scale-110 border-foreground' : 'border-transparent')} style={{ backgroundColor: item }} />)}
              <span className="ml-auto text-[11px] text-muted-foreground">{selectedNodeIds.length} selected</span>
            </div>
            <Button className="h-8 w-full text-xs" disabled={saving || !name.trim() || !selectedNodeIds.length} onClick={createArea}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />} Save subject area
            </Button>
            {!selectedNodeIds.length && <p className="text-[10px] text-muted-foreground">Select one table, or Ctrl/Cmd-click several tables first.</p>}
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>Saved areas</span><span>{areas.length}</span></div>
          {loading ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div> : areas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">No saved subject areas yet.</p>
          ) : orderedAreas.map(area => (
            <div key={area.id} style={{ marginLeft: `${Math.min(area.depth || 0, 4) * 14}px` }} className={cn('rounded-xl border p-2.5', activeArea?.id === area.id ? 'border-primary/50 bg-primary/5' : 'border-border/60')}>
              <div className="flex items-center gap-2">
                {(area.depth || 0) > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <button className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: area.color }} onClick={() => applyArea(area)} aria-label={`Open ${area.name}`} />
                {renamingId === area.id ? (
                  <form className="flex min-w-0 flex-1 gap-1" onSubmit={event => { event.preventDefault(); void renameArea(area); }}>
                    <input autoFocus value={renameValue} maxLength={80} onChange={event => setRenameValue(event.target.value)} className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs" />
                    <Button type="submit" size="icon" className="h-7 w-7"><Check className="h-3.5 w-3.5" /></Button>
                  </form>
                ) : <button className="min-w-0 flex-1 truncate text-left text-xs font-semibold" onClick={() => applyArea(area)}>{area.name}</button>}
                <span className="text-[10px] text-muted-foreground">{(area.effective_node_ids || area.node_ids).filter(id => nodeNames.has(id)).length} tables</span>
              </div>
              {(area.depth || 0) > 0 && <div className="mt-1 truncate pl-5 text-[9px] text-muted-foreground">inside {areas.find(item => item.id === area.parent_id)?.name || 'parent area'}</div>}
              {!readOnly && (() => {
                const blocked = getSubjectAreaDescendantIds(areas, area.id);
                return <SearchableSelect
                  ariaLabel={`Parent area for ${area.name}`}
                  value={area.parent_id || ''}
                  disabled={saving}
                  onValueChange={value => void updateArea(area, { parent_id: value || null })}
                  className="mt-2 h-7 text-[10px]"
                  searchPlaceholder="Search parent area..."
                  options={[
                    { value: '', label: 'Top-level area' },
                    ...orderedAreas.filter(candidate => candidate.id !== area.id && !blocked.has(candidate.id)).map(candidate => ({ value: candidate.id, label: `${'— '.repeat(candidate.depth || 0)}${candidate.name}`, searchText: candidate.name })),
                  ]}
                />;
              })()}
              <div className="mt-2 flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => applyArea(area)}>Open</Button>
                {!readOnly && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" disabled={saving} onClick={() => void saveCurrentView(area)}><Save className="mr-1 h-3 w-3" /> Viewport</Button>}
                {!readOnly && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" disabled={saving || !selectedNodeIds.length} onClick={() => void replaceTables(area)}>Use selection</Button>}
                {!readOnly && <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => { setRenamingId(area.id); setRenameValue(area.name); }} title="Rename"><Pencil className="h-3 w-3" /></Button>}
                {!readOnly && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={saving} onClick={() => void removeArea(area)} title="Delete"><Trash2 className="h-3 w-3" /></Button>}
              </div>
            </div>
          ))}
        </section>
      </div>
    </aside>
  );
}
