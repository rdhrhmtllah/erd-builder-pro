import { MobileActionDrawer } from '@/components/diagram/MobileActionDrawer';
import { TableSampleDataModal } from '@/components/modals/TableSampleDataModal';
import { TableDialog } from '@/components/modals/TableDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import React, { memo, useState, useEffect, useMemo, useRef, CSSProperties } from 'react';
import { Handle, Position, NodeProps, Node, useUpdateNodeInternals } from '@xyflow/react';
import { MoreHorizontal, Pencil, Sparkles, Check, Trash2, Database, AlertTriangle, Copy, MessageSquare, Shield, FileText } from 'lucide-react';
import { Entity } from '../../types';
import { cn } from '../../lib/utils';
import { formatColumnType } from '../../lib/column-metadata';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CopyQuerySubMenu, copyToClipboard } from './CopyQuerySubMenu';
import { buildCopyText, type CopyKind, type QueryOptions } from '@/lib/erd-query-builder';
import { useEntityNodeRuntime } from '@/contexts/EntityNodeRuntimeContext';
import { useColumnColor } from '@/contexts/ColumnColorContext';
import { generateTableMockJSON, generateTableMockSQL } from '@/lib/mock-data-generator';
import { toast } from 'sonner';
import { governanceFrom } from '../../../shared/erd-governance';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogBody,
} from "@/components/ui/alert-dialog";

const COPY_LABELS: Record<CopyKind, string> = {
  select: 'SELECT', insert: 'INSERT', update: 'UPDATE', delete: 'DELETE',
  columns: 'Column list', ddl: 'CREATE TABLE',
};

type EntityNodeProps = NodeProps<Node<Entity>>;

interface ColumnRowProps {
  col: any;
  entityId: string;
  borderColor: string;
  typeColor: string;
  hideHandles?: boolean;
  isReadOnly?: boolean;
  onDoubleClick?: (event: React.MouseEvent) => void;
  tableClassification?: string;
}

const handleBaseClass = '!w-3 !h-3 sm:!w-2 sm:!h-2 !border-none cursor-crosshair opacity-75 sm:opacity-0 transition-opacity duration-150 group-hover:!opacity-100 group-focus-within:!opacity-100 touch-none';
const readOnlyHandleClass = '!w-2 !h-2 !border-none !opacity-0 !pointer-events-none';

const EntityColumnRow = memo(({ col, entityId, borderColor, typeColor, hideHandles, isReadOnly = false, onDoubleClick, tableClassification }: ColumnRowProps) => {
  const { isColumnSelected, toggleColumnSelection } = useColumnColor();
  const { updateColumnComment } = useEntityNodeRuntime();
  const isSelected = isColumnSelected(entityId, col.id);
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(col.comment || "");

  useEffect(() => {
    setCommentDraft(col.comment || "");
  }, [col.comment]);

  const handleSaveComment = () => {
    setIsCommentOpen(false);
    const cleaned = commentDraft.trim();
    if (cleaned !== (col.comment || "")) {
      updateColumnComment?.(entityId, col.id, cleaned || null);
    }
  };
  const isFk = col._is_fk;
  const diffState = col.diffState as 'new' | 'deleted' | undefined;
  const classification = governanceFrom(col).classification || tableClassification;

  const leftStyle: CSSProperties = useMemo(() => ({
    top: '50%', left: '-4px', transform: 'translate(-50%, -50%)', backgroundColor: borderColor, zIndex: 50,
  }), [borderColor]);

  const rightStyle: CSSProperties = useMemo(() => ({
    top: '50%', right: '-4px', transform: 'translate(50%, -50%)', backgroundColor: borderColor, zIndex: 50,
  }), [borderColor]);

  const rowBgClass = useMemo(() => {
    if (diffState === 'new') return 'bg-emerald-500/10 hover:bg-emerald-500/15 border-b border-emerald-500/20';
    if (diffState === 'deleted') return 'bg-red-500/10 hover:bg-red-500/15 line-through opacity-50 border-b border-red-500/20';
    if (isSelected) return 'bg-primary/20 hover:bg-primary/25 border-b border-primary/40 ring-1 ring-inset ring-primary/40';
    return 'border-border/50 hover:bg-muted';
  }, [diffState, isSelected]);

  const customColorStyle = useMemo(() => {
    if (!col.color) return undefined;
    return {
      backgroundColor: isSelected ? undefined : `${col.color}26`, // 15% tint
      borderLeft: `3px solid ${col.color}`,
    };
  }, [col.color, isSelected]);

  const handleRowClick = (e: React.MouseEvent) => {
    // In Hand Tool (Pan) mode or read-only mode, column selection is completely disabled!
    if (hideHandles || isReadOnly) return;

    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      toggleColumnSelection(entityId, col.id, true);
    } else {
      toggleColumnSelection(entityId, col.id, false);
    }
  };

  return (
    <div
      className={cn("erd-column-row group relative px-3 py-2 flex items-center justify-between transition-colors border-b last:border-b-0", (hideHandles || isReadOnly) ? "cursor-default" : "cursor-pointer", rowBgClass)}
      style={customColorStyle}
      data-erd-column-id={col.id}
      title={col.comment || undefined}
      onClick={handleRowClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Handles must ALWAYS remain in the DOM so React Flow edges never disappear or lose connection */}
      <Handle type="target" position={Position.Left} id={`col-${col.id}-target`} className={hideHandles ? readOnlyHandleClass : handleBaseClass} style={leftStyle} />
      <Handle type="source" position={Position.Left} id={`col-${col.id}-source-l`} className={hideHandles ? readOnlyHandleClass : handleBaseClass} style={leftStyle} />
      <Handle type="source" position={Position.Right} id={`col-${col.id}-source`} className={hideHandles ? readOnlyHandleClass : handleBaseClass} style={rightStyle} />
      <Handle type="target" position={Position.Right} id={`col-${col.id}-target-r`} className={hideHandles ? readOnlyHandleClass : handleBaseClass} style={rightStyle} />

      <div className="flex items-center gap-2">
        {col.color && (
          <span
            className="size-2 rounded-full shrink-0 shadow-xs"
            style={{ backgroundColor: col.color }}
            title={`Marked: ${col.color}`}
          />
        )}
        <span className={cn(
          "text-sm font-medium", 
          col.is_pk ? "text-foreground" : "text-foreground/80",
          diffState === 'new' && "text-emerald-400 font-semibold",
          diffState === 'deleted' && "text-red-400/80 line-through"
        )}>
          {diffState === 'new' ? `+ ${col.name}` : diffState === 'deleted' ? `- ${col.name}` : col.name}
        </span>
      </div>

      <div className="flex flex-col items-end gap-0.5 max-w-35">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono font-semibold" style={{ color: diffState === 'new' ? '#10b981' : diffState === 'deleted' ? '#ef4444' : typeColor }}>
            {formatColumnType(col.type, col.max_length, col.numeric_precision, col.numeric_scale).toLowerCase()}
          </span>
          <Popover open={isCommentOpen} onOpenChange={setIsCommentOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCommentOpen(true);
                  }}
                  className={cn(
                    "size-4 rounded flex items-center justify-center transition-all cursor-pointer",
                    col.comment
                      ? "text-primary hover:bg-primary/20"
                      : "text-muted-foreground/30 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 sm:opacity-0 focus:opacity-100"
                  )}
                  title={col.comment ? `Comment: ${col.comment}` : "Add comment to column"}
                >
                  <MessageSquare className={cn("w-3 h-3", col.comment ? "fill-primary/20 text-primary" : "")} />
                </button>
              }
            />
            <PopoverContent
              align="end"
              side="bottom"
              className="w-72 p-3 space-y-2.5 z-[1200] bg-popover text-popover-foreground shadow-2xl border border-border rounded-xl"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MessageSquare className="size-3.5 text-primary shrink-0" />
                  <span className="text-xs font-bold truncate">{col.name}</span>
                  <span className="text-[10px] text-muted-foreground">· Comment</span>
                </div>
                {col.comment && !isReadOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setCommentDraft("");
                      updateColumnComment?.(entityId, col.id, null);
                      setIsCommentOpen(false);
                    }}
                    className="text-[10px] text-destructive hover:underline cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>

              {isReadOnly ? (
                <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed min-h-8 py-1">
                  {col.comment || <span className="text-muted-foreground/50 italic">No comment added</span>}
                </p>
              ) : (
                <>
                  <Textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Add documentation or business notes for this column..."
                    className="min-h-[70px] text-xs resize-y bg-background/60 leading-relaxed"
                    autoFocus
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        handleSaveComment();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-muted-foreground">Ctrl+Enter to save</span>
                    <Button size="sm" onClick={handleSaveComment} className="h-7 px-3 text-xs font-semibold cursor-pointer">
                      Save
                    </Button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
          {(classification === 'confidential' || classification === 'restricted') && <Shield className={cn('h-3 w-3', classification === 'restricted' ? 'text-red-500' : 'text-amber-500')} aria-label={`${classification} data`} />}
          {(col.is_pk || isFk) && (
            <div className="flex items-center gap-1">
              {col.is_pk && <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-tighter">pk</span>}
              {isFk && <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-tighter">fk</span>}
            </div>
          )}
        </div>
        {col.type.toUpperCase() === 'ENUM' && col.enum_values && (
          <span className="font-mono italic text-right leading-tight wrap-break-word max-w-full text-[8.5px] text-muted-foreground">
            ({col.enum_values})
          </span>
        )}
      </div>
    </div>
  );
});

const EntityNode = ({ data, id, selected }: EntityNodeProps) => {
  const { isReadOnly: workspaceReadOnly, hideHandles, duplicateEntity, setSelectedNodeId, openProperties } = useEntityNodeRuntime();
  const isReadOnly = workspaceReadOnly || !!data.isDiffMode || !!(data as any).isReadOnly;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSampleDataOpen, setIsSampleDataOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
      setIsMobileDrawerOpen(true);
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const [isDescOpen, setIsDescOpen] = useState(false);
  const [isDataBubbleOpen, setIsDataBubbleOpen] = useState(false);
  const sampleRows: Record<string, any>[] = useMemo(() => {
    const raw = data.sample_data || (data as any).sampleData;
    return Array.isArray(raw) ? raw : [];
  }, [data.sample_data, (data as any).sampleData]);
  const sampleCount = sampleRows.length;
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState(data.comment || "");
  const { updateEntityComment, updateEntitySampleData } = useEntityNodeRuntime();

  useEffect(() => {
    setCommentDraft(data.comment || "");
  }, [data.comment]);

  const handleSaveComment = (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsEditingComment(false);
    const cleaned = commentDraft.trim();
    if (cleaned !== (data.comment || "")) {
      updateEntityComment?.(id, cleaned || null);
    }
  };

  const updateNodeInternals = useUpdateNodeInternals();

  const columnOrderHash = useMemo(() => 
    data.columns.map(c => `${c.id}-${c.name}-${c.sort_order}`).join(','),
    [data.columns]
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, columnOrderHash, updateNodeInternals]);

  const handleEdit = (e?: React.MouseEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (isReadOnly) return;
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsEditDialogOpen(true);
      return;
    }
    setSelectedNodeId(id);
    openProperties();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReadOnly) return;
    setShowDeleteConfirm(true);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReadOnly) return;
    duplicateEntity(id);
  };

  const handleCopy = (kind: CopyKind, options: QueryOptions) => {
    void copyToClipboard(buildCopyText(kind, data, options), `${data.name} · ${COPY_LABELS[kind]}`);
  };

  const handleDownloadMockData = (format: 'json' | 'sql', count: number = 10) => {
    try {
      const content = format === 'json' ? generateTableMockJSON(data, count) : generateTableMockSQL(data, count);
      const ext = format === 'json' ? '.json' : '_seed.sql';
      const filename = `${data.name.toLowerCase()}_mock_${count}${ext}`;
      const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded mock data: ${filename}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate mock data');
    }
  };

  const confirmDelete = () => {
    window.dispatchEvent(new CustomEvent('deleteEntity', { detail: id }));
    setShowDeleteConfirm(false);
  };

  const diffState = data.diffState as 'new' | 'deleted' | 'modified' | undefined;
  const tableGovernance = governanceFrom(data);

  const { borderColor, headerBg, typeColor } = useMemo(() => {
    if (diffState === 'new') {
      return {
        borderColor: '#10b981',
        headerBg: 'rgba(16, 185, 129, 0.15)',
        typeColor: '#10b981',
      };
    }
    if (diffState === 'deleted') {
      return {
        borderColor: '#ef4444',
        headerBg: 'rgba(239, 68, 68, 0.15)',
        typeColor: '#ef4444',
      };
    }
    if (diffState === 'modified') {
      return {
        borderColor: '#f59e0b',
        headerBg: 'rgba(245, 158, 11, 0.15)',
        typeColor: '#f59e0b',
      };
    }
    return {
      borderColor: data.color,
      headerBg: `${data.color}20`,
      typeColor: data.color,
    };
  }, [data.color, diffState]);

  const containerClasses = useMemo(() => cn(
    "bg-card text-foreground rounded-lg border-2 min-w-[220px] erd-node-container",
    selected && "ring-2 ring-primary/50",
    diffState === 'new' && "shadow-[0_0_20px_rgba(16,185,129,0.35)] border-emerald-500/50",
    diffState === 'deleted' && "opacity-40 shadow-[0_0_15px_rgba(239,68,68,0.25)] border-red-500/50",
    diffState === 'modified' && "shadow-[0_0_20px_rgba(245,158,11,0.3)] border-amber-500/50"
  ), [selected, diffState]);

  const sortedColumns = useMemo(() => 
    [...data.columns].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [data.columns]
  );

  return (
    <>
      <div 
        className={containerClasses}
        style={{ borderColor: borderColor, overflow: 'visible' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsMobileDrawerOpen(true);
        }}
      >
        <div 
          className="px-3 py-2 flex items-center justify-between border-b-2 cursor-pointer group/header"
          style={{ backgroundColor: headerBg, borderColor: borderColor }}
          onDoubleClick={isReadOnly ? undefined : handleEdit}
          title={isReadOnly ? undefined : "Double-click to edit table"}
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 transition-transform group-hover/header:rotate-12" style={{ color: borderColor }} />
            <span className={cn(
              "font-bold text-sm tracking-wide uppercase",
              diffState === 'deleted' && "line-through text-red-400"
            )}>
              {data.name}
            </span>
            {tableGovernance.classification && <span className={cn(
              'rounded border px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide',
              tableGovernance.classification === 'restricted' ? 'border-red-500/40 bg-red-500/10 text-red-500'
                : tableGovernance.classification === 'confidential' ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : tableGovernance.classification === 'internal' ? 'border-sky-500/40 bg-sky-500/10 text-sky-500'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
            )}>{tableGovernance.classification}</span>}
            {diffState === 'new' && (
              <span className="px-1 py-0.5 text-[8px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-wider">NEW</span>
            )}
            {diffState === 'deleted' && (
              <span className="px-1 py-0.5 text-[8px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded uppercase tracking-wider">DEL</span>
            )}
            {diffState === 'modified' && (
              <span className="px-1 py-0.5 text-[8px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded uppercase tracking-wider">MOD</span>
            )}

            {/* Compact Table Description Bubble Button */}
            <Popover open={isDescOpen} onOpenChange={setIsDescOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDescOpen(true);
                    }}
                    className={cn(
                      "nodrag nopan flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-all cursor-pointer select-none",
                      data.comment
                        ? "bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 shadow-xs"
                        : "opacity-0 group-hover/header:opacity-100 hover:bg-muted/70 text-muted-foreground/70 border border-dashed border-border/70"
                    )}
                    title={data.comment ? `Description: ${data.comment}` : "Add table description"}
                  >
                    <FileText className="w-3 h-3" />
                    {data.comment ? (
                      <span className="text-[9px] font-semibold">Info</span>
                    ) : (
                      <span className="text-[9px]">+Desc</span>
                    )}
                  </button>
                }
              />
              <PopoverContent
                align="start"
                side="bottom"
                className="w-80 p-3 space-y-2.5 z-[1200] bg-popover text-popover-foreground shadow-2xl border border-border rounded-xl"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="size-3.5 text-primary shrink-0" />
                    <span className="text-xs font-bold uppercase truncate">{data.name}</span>
                    <span className="text-[10px] text-muted-foreground">· Description</span>
                  </div>
                  {data.comment && !isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setCommentDraft("");
                        updateEntityComment?.(id, null);
                        setIsDescOpen(false);
                      }}
                      className="text-[10px] text-destructive hover:underline cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {isReadOnly ? (
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed min-h-8 py-1">
                    {data.comment || <span className="text-muted-foreground/50 italic">No description provided</span>}
                  </p>
                ) : (
                  <>
                    <Textarea
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      placeholder="Describe what this table stores or business logic..."
                      className="min-h-[80px] text-xs resize-y bg-background/60 leading-relaxed"
                      autoFocus
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                          handleSaveComment();
                          setIsDescOpen(false);
                        }
                      }}
                    />
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-muted-foreground">Ctrl+Enter to save</span>
                      <Button
                        size="sm"
                        onClick={() => {
                          handleSaveComment();
                          setIsDescOpen(false);
                        }}
                        className="h-7 px-3 text-xs font-semibold cursor-pointer"
                      >
                        Save
                      </Button>
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>

            {/* Interactive Mock Data Bubble Button */}
            <Popover open={isDataBubbleOpen} onOpenChange={setIsDataBubbleOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDataBubbleOpen(true);
                    }}
                    className={cn(
                      "nodrag nopan flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-all cursor-pointer select-none",
                      sampleCount > 0
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 shadow-xs"
                        : "opacity-0 group-hover/header:opacity-100 hover:bg-muted/70 text-muted-foreground/70 border border-dashed border-border/70"
                    )}
                    title={sampleCount > 0 ? `Sample mock data: ${sampleCount} records` : "View or generate sample data"}
                  >
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                    {sampleCount > 0 ? (
                      <span className="text-[9px] font-semibold">{sampleCount} rows</span>
                    ) : (
                      <span className="text-[9px]">+Mock</span>
                    )}
                  </button>
                }
              />
              <PopoverContent
                align="start"
                side="bottom"
                className="w-88 p-3 space-y-3 z-[1200] bg-popover text-popover-foreground shadow-2xl border border-border rounded-xl"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="size-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold uppercase truncate">{data.name}</span>
                    <span className="text-[10px] text-muted-foreground">· Mock Data ({sampleCount})</span>
                  </div>
                  {sampleCount > 0 && !isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        updateEntitySampleData?.(id, []);
                      }}
                      className="text-[10px] text-destructive hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {sampleCount === 0 ? (
                  <div className="text-center py-4 px-2 space-y-2 bg-muted/30 rounded-lg border border-dashed border-border/60">
                    <p className="text-xs text-muted-foreground">No sample data attached yet.</p>
                    {!isReadOnly && (
                      <Button
                        size="sm"
                        onClick={() => {
                          try {
                            const generated = JSON.parse(generateTableMockJSON(data, 5));
                            updateEntitySampleData?.(id, generated);
                          } catch (err) {
                            toast.error("Failed to generate sample data");
                          }
                        }}
                        className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 mr-1.5" />
                        Generate 5 Mock Records
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="max-h-48 overflow-auto rounded border border-border/60 bg-muted/20 custom-scrollbar text-[10px]">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-muted/80 sticky top-0 border-b border-border/60">
                          <tr>
                            <th className="px-2 py-1 text-muted-foreground font-mono">#</th>
                            {data.columns.slice(0, 4).map(c => (
                              <th key={c.id} className="px-2 py-1 font-semibold text-foreground truncate max-w-[100px]">
                                {c.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sampleRows.slice(0, 4).map((row, idx) => (
                            <tr key={idx} className="border-b border-border/30 last:border-b-0 hover:bg-muted/40">
                              <td className="px-2 py-1 text-muted-foreground font-mono">{idx + 1}</td>
                              {data.columns.slice(0, 4).map(c => (
                                <td key={c.id} className="px-2 py-1 font-mono text-muted-foreground truncate max-w-[100px]">
                                  {String(row[c.name] ?? row[c.name.toLowerCase()] ?? "-")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const generated = JSON.parse(generateTableMockJSON(data, 5));
                              updateEntitySampleData?.(id, generated);
                            } catch (err) {
                              toast.error("Failed to regenerate mock data");
                            }
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Sparkles className="size-2.5 text-emerald-500" />
                          Regenerate
                        </button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsDataBubbleOpen(false);
                          setIsSampleDataOpen(true);
                        }}
                        className="h-7 px-2.5 text-xs font-semibold ml-auto cursor-pointer"
                      >
                        Open Full View
                      </Button>
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          
          {!isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger 
                className="nodrag nopan p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-44 bg-popover border-border text-popover-foreground z-1000" 
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={handleEdit} className="cursor-pointer hover:bg-muted focus:bg-muted">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDuplicate} className="cursor-pointer hover:bg-muted focus:bg-muted">
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <CopyQuerySubMenu label="Copy query" onCopy={handleCopy} />
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem onClick={() => setIsSampleDataOpen(true)} className="cursor-pointer hover:bg-muted focus:bg-muted font-medium text-foreground">
                  <Database className="w-4 h-4 mr-2 text-primary" />
                  <span>View / Edit Sample Data</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem onClick={() => handleDownloadMockData('sql', 10)} className="cursor-pointer hover:bg-muted focus:bg-muted">
                  <Sparkles className="w-4 h-4 mr-2 text-primary" />
                  <span>Mock Data (10 SQL)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownloadMockData('json', 10)} className="cursor-pointer hover:bg-muted focus:bg-muted">
                  <Sparkles className="w-4 h-4 mr-2 text-primary" />
                  <span>Mock Data (10 JSON)</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem onClick={handleDeleteClick} className="cursor-pointer text-destructive focus:text-destructive hover:bg-destructive/10 focus:bg-destructive/10">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Table
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Columns */}
        <div
          className={cn("flex flex-col", !isReadOnly && "cursor-pointer")}
          onDoubleClick={isReadOnly ? undefined : handleEdit}
          title={isReadOnly ? undefined : "Double-click to edit table"}
        >
          {sortedColumns.map((col: any) => (
            <EntityColumnRow
              key={col.id}
              col={col}
              entityId={id}
              borderColor={borderColor}
              typeColor={typeColor}
              hideHandles={hideHandles}
              isReadOnly={isReadOnly}
              onDoubleClick={isReadOnly ? undefined : handleEdit}
              tableClassification={tableGovernance.classification}
            />
          ))}
        </div>
      </div>

      <MobileActionDrawer
        open={isMobileDrawerOpen}
        onOpenChange={setIsMobileDrawerOpen}
        entity={data}
        isReadOnly={isReadOnly}
        onEdit={() => setIsEditDialogOpen(true)}
        onDuplicate={handleDuplicate}
        onDelete={handleDeleteClick}
        onOpenSampleData={() => setIsSampleDataOpen(true)}
        onDownloadMockSQL={() => handleDownloadMockData('sql', 10)}
        onDownloadMockJSON={() => handleDownloadMockData('json', 10)}
        onShare={() => window.dispatchEvent(new CustomEvent('open-share-modal'))}
      />

      <TableSampleDataModal
        open={isSampleDataOpen}
        onOpenChange={setIsSampleDataOpen}
        entity={data}
        isReadOnly={isReadOnly}
        onSaveSampleData={(entityId, sampleRows) => {
          updateEntitySampleData?.(entityId, sampleRows);
        }}
      />

      <TableDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        entity={data}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent size="sm" className="max-w-100">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete Table</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              Are you sure you want to delete the table <strong>{data.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.stopPropagation();
                confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
};

export default memo(EntityNode);
