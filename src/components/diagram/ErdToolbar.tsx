import React from 'react';
import type { Node } from '@xyflow/react';
import {
  BookOpenCheck, Database, Download, FilePlus2, FolderKanban, GitBranch, GitCompareArrows,
  LayoutGrid, Layers3, MoreHorizontal, Plus, Radar, RefreshCw, Redo2, ShieldCheck, Undo2,
  Upload, WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { JumpToNode } from '../JumpToNode';
import { healthScoreTone } from './ErdSchemaHealthPanel';
import { cn } from '@/lib/utils';

/** Every side panel the ERD canvas can show. Only one is open at a time. */
export type ErdPanelId =
  | 'organizer' | 'templates' | 'explorer' | 'areas' | 'perspectives'
  | 'health' | 'impact' | 'migrate' | 'dictionary';

type PanelMeta = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
};

export const ERD_PANEL_META: Record<ErdPanelId, PanelMeta> = {
  organizer: { label: 'Organize', icon: WandSparkles, description: 'Group related tables into Subject Areas' },
  templates: { label: 'Templates', icon: FilePlus2, description: 'Start from a proven schema pattern' },
  explorer: { label: 'Explorer', icon: GitBranch, description: 'Trace upstream and downstream relationships' },
  areas: { label: 'Areas', icon: FolderKanban, description: 'Open saved module views' },
  perspectives: { label: 'Perspectives', icon: Layers3, description: 'Colored business-flow section layouts' },
  health: { label: 'Health', icon: ShieldCheck, description: 'Audit keys, relationships, indexes, naming' },
  impact: { label: 'Impact', icon: Radar, description: 'Simulate the blast radius of a change' },
  migrate: { label: 'Migrate', icon: GitCompareArrows, description: 'Compare versions and generate SQL' },
  dictionary: { label: 'Dictionary', icon: BookOpenCheck, description: 'Business definitions and ownership' },
};

function dictionaryScoreTone(score: number) {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

type Props = {
  nodes: Node[];
  isReadOnly: boolean;
  isProductionDb: boolean;
  isPublicView: boolean;
  hasDiagramFile: boolean;
  activePanel: ErdPanelId | null;
  onPanelChange: (panel: ErdPanelId | null) => void;
  activeAreaName?: string;
  activePerspectiveName?: string;
  healthScore: number;
  dictionaryScore: number;
  isSyncing: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onAddTable: () => void;
  onImportSQL?: () => void;
  onOpenDbml: () => void;
  onAutoLayout: () => void;
  onSync: () => void;
  onExportImage: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
};

export function ErdToolbar({
  nodes,
  isReadOnly,
  isProductionDb,
  isPublicView,
  hasDiagramFile,
  activePanel,
  onPanelChange,
  activeAreaName,
  activePerspectiveName,
  healthScore,
  dictionaryScore,
  isSyncing,
  canUndo,
  canRedo,
  onAddTable,
  onImportSQL,
  onOpenDbml,
  onAutoLayout,
  onSync,
  onExportImage,
  onUndo,
  onRedo,
}: Props) {
  const canEditDiagram = !isReadOnly && !isProductionDb;
  const hasSavedViews = hasDiagramFile && !isPublicView && !isProductionDb;
  const togglePanel = (panel: ErdPanelId) => onPanelChange(activePanel === panel ? null : panel);

  // Areas and Perspectives keep showing the applied view in the button label,
  // so the user can tell a filtered canvas from the canonical one at a glance.
  const panelLabel = (panel: ErdPanelId) => {
    if (panel === 'areas' && activeAreaName) return activeAreaName;
    if (panel === 'perspectives' && activePerspectiveName) return activePerspectiveName;
    if (panel === 'health') return `Health ${healthScore}`;
    if (panel === 'dictionary') return `Dictionary ${dictionaryScore}`;
    return ERD_PANEL_META[panel].label;
  };

  const createItems = [
    onImportSQL && !isReadOnly && { key: 'import', label: 'Import SQL', icon: Upload, onSelect: onImportSQL },
    !isProductionDb && { key: 'dbml', label: 'Edit as DBML', icon: Database, onSelect: onOpenDbml },
    canEditDiagram && { key: 'templates' as const, panel: 'templates' as ErdPanelId },
  ].filter(Boolean) as Array<{ key: string; label?: string; icon?: any; onSelect?: () => void; panel?: ErdPanelId }>;

  const viewPanels: ErdPanelId[] = ['explorer', ...(hasSavedViews ? (['areas', 'perspectives'] as ErdPanelId[]) : [])];
  const analyzePanels: ErdPanelId[] = ['health', 'impact', 'migrate', ...(isProductionDb ? [] : (['dictionary'] as ErdPanelId[]))];

  const renderPanelItem = (panel: ErdPanelId) => {
    const meta = ERD_PANEL_META[panel];
    const Icon = meta.icon;
    const isActive = activePanel === panel;
    const tone = panel === 'health' ? healthScoreTone(healthScore)
      : panel === 'dictionary' ? dictionaryScoreTone(dictionaryScore)
      : '';
    const badge = panel === 'health' ? String(healthScore)
      : panel === 'dictionary' ? String(dictionaryScore)
      : panel === 'areas' ? activeAreaName
      : panel === 'perspectives' ? activePerspectiveName
      : undefined;
    return (
      <DropdownMenuItem
        key={panel}
        onClick={() => togglePanel(panel)}
        className={cn('cursor-pointer gap-2 px-2 py-1.5', isActive && 'bg-accent/60')}
      >
        <Icon className={cn('h-3.5 w-3.5', tone || 'text-muted-foreground')} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{meta.label}</div>
          <div className="truncate text-[10px] text-muted-foreground">{meta.description}</div>
        </div>
        {badge && <span className={cn('max-w-[84px] shrink-0 truncate rounded border border-border/60 px-1.5 py-0.5 text-[9px] font-bold', tone)}>{badge}</span>}
      </DropdownMenuItem>
    );
  };

  // The open panel stays reachable outside the menu — closing it should never
  // require re-opening the menu it was launched from.
  const pinnedPanel = activePanel && activePanel !== 'organizer' ? activePanel : null;
  const PinnedIcon = pinnedPanel ? ERD_PANEL_META[pinnedPanel].icon : null;

  return (
    <div className="flex items-center gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto no-scrollbar">
      <JumpToNode nodes={nodes} label="Table" />
      <div className="w-px h-6 bg-border mx-0.5" />

      {!isReadOnly && (
        <Button onClick={onAddTable} size="sm" className="h-9 px-3 sm:px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer">
          <Plus className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Add Table</span>
        </Button>
      )}

      <Button
        onClick={onAutoLayout}
        variant="outline"
        size="sm"
        className="h-9 px-3 border-border hover:bg-muted bg-muted/50 text-xs font-semibold cursor-pointer"
        title={activePerspectiveName ? 'Re-layout current perspective without changing the main ERD' : 'Auto-layout canonical ERD'}
      >
        <LayoutGrid className="w-3.5 h-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">{activePerspectiveName ? 'Re-layout' : 'Auto Layout'}</span>
      </Button>

      {canEditDiagram && hasDiagramFile && !isPublicView && (
        <Button
          onClick={() => togglePanel('organizer')}
          variant={activePanel === 'organizer' ? 'default' : 'outline'}
          size="sm"
          className="h-9 px-3 text-xs font-semibold cursor-pointer"
          title="Analyze and group related tables into saved Subject Areas"
        >
          <WandSparkles className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Organize</span>
        </Button>
      )}

      {isProductionDb && (
        <Button onClick={onSync} variant="outline" size="sm" className="h-9 px-3 border-amber-500/50 hover:bg-amber-500/10 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs font-semibold cursor-pointer" disabled={isSyncing}>
          <RefreshCw className={cn('w-3.5 h-3.5 sm:mr-1.5', isSyncing && 'animate-spin')} />
          <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
        </Button>
      )}

      {pinnedPanel && PinnedIcon && (
        <Button
          onClick={() => onPanelChange(null)}
          variant="default"
          size="sm"
          className="h-9 px-3 text-xs font-semibold cursor-pointer"
          title={`Close ${ERD_PANEL_META[pinnedPanel].label}`}
        >
          <PinnedIcon className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline max-w-[140px] truncate">{panelLabel(pinnedPanel)}</span>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-semibold cursor-pointer"
              title="More ERD tools"
            >
              <MoreHorizontal className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">More</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-[290px] p-1.5">
          {createItems.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 text-[10px] font-bold uppercase tracking-wider">Create</DropdownMenuLabel>
              {createItems.map(item => {
                if (item.panel) return renderPanelItem(item.panel);
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.key} onClick={item.onSelect} className="cursor-pointer gap-2 px-2 py-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold">{item.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          )}

          {createItems.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 text-[10px] font-bold uppercase tracking-wider">Navigate &amp; views</DropdownMenuLabel>
            {viewPanels.map(renderPanelItem)}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 text-[10px] font-bold uppercase tracking-wider">Analyze</DropdownMenuLabel>
            {analyzePanels.map(renderPanelItem)}
          </DropdownMenuGroup>

          {isProductionDb && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExportImage} className="cursor-pointer gap-2 px-2 py-1.5">
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">Export SVG</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {!isReadOnly && (
        <div className="flex items-center gap-0.5 ml-auto">
          <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Redo (Ctrl+Y)">
            <Redo2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
