/**
 * Interactive Sample Data Viewer & Editor Modal for ERD Tables.
 * Fully responsive: Supports Table (Grid) View & Card (Mobile Form) View.
 * Seamless on mobile phones with zero horizontal overflow, touch-friendly inputs,
 * and intuitive record-by-record stepper navigation.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Entity } from '@/types';
import { generateTableMockJSON } from '@/lib/mock-data-generator';
import {
  Table as TableIcon,
  Plus,
  Trash2,
  Sparkles,
  Copy,
  Check,
  Download,
  AlertCircle,
  LayoutGrid,
  CreditCard,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

interface TableSampleDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity | null;
  onSaveSampleData?: (entityId: string, sampleRows: Record<string, any>[]) => void;
  isReadOnly?: boolean;
}

export function TableSampleDataModal({
  open,
  onOpenChange,
  entity,
  onSaveSampleData,
  isReadOnly = false,
}: TableSampleDataModalProps) {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) return 'card';
    return 'table';
  });
  const [activeRecordIndex, setActiveRecordIndex] = useState(0);

  useEffect(() => {
    if (!entity) {
      setRows([]);
      return;
    }
    const existing = entity.sample_data || (entity as any).sampleData;
    if (Array.isArray(existing) && existing.length > 0) {
      setRows(existing);
    } else {
      setRows([]);
    }
    setActiveRecordIndex(0);
  }, [entity]);

  if (!entity) return null;

  const columns = entity.columns || [];

  const handleAddRow = () => {
    if (isReadOnly) return;
    const newRow: Record<string, any> = {};
    columns.forEach((c) => {
      newRow[c.name] = '';
    });
    setRows((prev) => [...prev, newRow]);
    setActiveRecordIndex(rows.length);
  };

  const handleCellChange = (rowIndex: number, colName: string, value: any) => {
    if (isReadOnly) return;
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [colName]: value };
      return next;
    });
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (isReadOnly) return;
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== rowIndex);
      if (activeRecordIndex >= next.length && next.length > 0) {
        setActiveRecordIndex(next.length - 1);
      }
      return next;
    });
  };

  const handleAutoFill = () => {
    if (isReadOnly) return;
    try {
      const mockStr = generateTableMockJSON(entity, 5);
      const parsed = JSON.parse(mockStr);
      setRows(parsed);
      setActiveRecordIndex(0);
      toast.success('Generated 5 realistic sample records!');
    } catch (e: any) {
      toast.error('Could not generate sample data');
    }
  };

  const handleSave = () => {
    onSaveSampleData?.(entity.id, rows);
    toast.success(`Saved ${rows.length} sample row${rows.length === 1 ? '' : 's'} for table "${entity.name}"`);
    onOpenChange(false);
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
    setCopied(true);
    toast.success('Sample data copied to clipboard as JSON');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entity.name.toLowerCase()}_sample_data.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported sample JSON file');
  };

  const currentRecord = rows[activeRecordIndex] || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="w-[96vw] max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl">
        {/* Responsive Header */}
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-border/60 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Title & Icon */}
            <div className="flex items-center gap-2.5 min-w-0 pr-8 sm:pr-0">
              <div
                className="size-8 sm:size-9 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
                style={{ backgroundColor: entity.color || '#6366f1' }}
              >
                <TableIcon className="size-4 sm:size-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-sm sm:text-base font-bold flex items-center gap-2 truncate">
                  Sample Data: <span className="uppercase font-mono text-primary truncate">{entity.name}</span>
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">
                  {isReadOnly ? 'Viewing example records for this table' : 'Preview and edit realistic data records'}
                </DialogDescription>
              </div>
            </div>

            {/* Action Bar & View Switcher */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* View Switcher: Card vs Grid */}
              <div className="flex items-center rounded-lg border border-border/70 p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    viewMode === 'card' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Card view (optimized for mobile)"
                >
                  <CreditCard className="size-3" />
                  <span>Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    viewMode === 'table' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Grid spreadsheet view"
                >
                  <LayoutGrid className="size-3" />
                  <span>Grid</span>
                </button>
              </div>

              {!isReadOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFill}
                  className="h-7 sm:h-8 text-[11px] sm:text-xs px-2 sm:px-2.5 gap-1 text-primary hover:bg-primary/10 border-primary/40 cursor-pointer"
                  title="Auto-fill 5 realistic records"
                >
                  <Sparkles className="size-3" />
                  <span>Auto-Fill</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyJSON}
                disabled={rows.length === 0}
                className="h-7 sm:h-8 text-[11px] sm:text-xs px-2 sm:px-2.5 gap-1 cursor-pointer"
                title="Copy as JSON"
              >
                {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                <span className="hidden xs:inline">JSON</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJSON}
                disabled={rows.length === 0}
                className="h-7 sm:h-8 text-[11px] sm:text-xs px-2 sm:px-2.5 gap-1 cursor-pointer"
                title="Download JSON file"
              >
                <Download className="size-3" />
                <span className="hidden xs:inline">Export</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <DialogBody className="flex-1 p-0 overflow-auto bg-muted/10">
          {columns.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-muted-foreground text-sm gap-2">
              <AlertCircle className="size-6 opacity-40 text-amber-500" />
              <span>This table has no columns defined yet. Add columns first.</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-muted-foreground text-sm gap-3">
              <TableIcon className="size-8 opacity-30 text-primary" />
              <div className="text-center px-4">
                <p className="font-semibold text-foreground text-sm sm:text-base">No sample data added yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Click Auto-Fill to populate realistic records based on column types, or add empty rows manually.
                </p>
              </div>
              {!isReadOnly && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  <Button size="sm" onClick={handleAutoFill} className="gap-1.5 h-8 text-xs cursor-pointer">
                    <Sparkles className="size-3.5" />
                    Auto-Fill 5 Mock Rows
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleAddRow} className="gap-1.5 h-8 text-xs cursor-pointer">
                    <Plus className="size-3.5" />
                    Add Empty Row
                  </Button>
                </div>
              )}
            </div>
          ) : viewMode === 'card' ? (
            /* ============================================================== */
            /* MOBILE-FIRST CARD VIEW (Record by Record Stepper)              */
            /* ============================================================== */
            <div className="p-3 sm:p-5 flex flex-col items-center max-w-lg mx-auto w-full">
              {/* Stepper Navigation */}
              <div className="w-full flex items-center justify-between p-2 rounded-xl bg-background border border-border/80 shadow-xs mb-3">
                <button
                  type="button"
                  onClick={() => setActiveRecordIndex((i) => Math.max(0, i - 1))}
                  disabled={activeRecordIndex === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/60 text-xs font-semibold hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                >
                  <ChevronLeft className="size-3.5" />
                  <span>Prev</span>
                </button>

                <div className="flex flex-col items-center select-none">
                  <span className="text-xs font-bold text-foreground">
                    Record {activeRecordIndex + 1} of {rows.length}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Swipe or use arrows</span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveRecordIndex((i) => Math.min(rows.length - 1, i + 1))}
                  disabled={activeRecordIndex === rows.length - 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/60 text-xs font-semibold hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="size-3.5" />
                </button>
              </div>

              {/* Active Record Card Form */}
              {currentRecord && (
                <div className="w-full rounded-2xl border border-border bg-card shadow-sm p-3.5 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-primary" />
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Fields ({columns.length})
                      </span>
                    </div>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(activeRecordIndex)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                        title="Delete this record"
                      >
                        <Trash2 className="size-3" />
                        <span>Delete Record</span>
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-border/40 space-y-2">
                    {columns.map((col) => {
                      const cellVal = currentRecord[col.name] ?? '';
                      return (
                        <div key={col.id} className="pt-2 first:pt-0">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                              {col.color && (
                                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                              )}
                              <span className={col.is_pk ? 'text-primary font-bold' : ''}>{col.name}</span>
                              {col.is_pk && (
                                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-primary/10 text-primary font-bold">
                                  PK
                                </span>
                              )}
                            </label>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">
                              {col.type}
                            </span>
                          </div>

                          {isReadOnly ? (
                            <div className="px-3 py-2 rounded-lg bg-muted/40 text-xs font-mono break-all border border-border/40 select-all">
                              {cellVal === '' ? <span className="text-muted-foreground/50 italic">null</span> : String(cellVal)}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={cellVal}
                              onChange={(e) => handleCellChange(activeRecordIndex, col.name, e.target.value)}
                              placeholder="null"
                              className="w-full bg-background border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/30 outline-none transition-all shadow-2xs"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ============================================================== */
            /* TABLE / SPREADSHEET GRID VIEW (Optimized with smooth scroll)   */
            /* ============================================================== */
            <div className="min-w-full overflow-x-auto touch-pan-x">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/70 border-b border-border/80 sticky top-0 z-10 backdrop-blur">
                    <th className="w-10 px-3 py-2.5 text-center font-mono text-[10px] text-muted-foreground border-r border-border/50 sticky left-0 bg-muted/90 z-20">
                      #
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col.id}
                        className="px-3.5 py-2.5 font-semibold text-foreground border-r border-border/50 whitespace-nowrap min-w-[130px]"
                      >
                        <div className="flex items-center gap-1.5">
                          {col.color && (
                            <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                          )}
                          <span className={col.is_pk ? 'font-bold text-primary underline' : ''}>{col.name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground font-normal">
                            ({col.type})
                          </span>
                        </div>
                      </th>
                    ))}
                    {!isReadOnly && <th className="w-12 px-2 py-2.5 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-center font-mono text-[10px] text-muted-foreground/60 border-r border-border/50 select-none sticky left-0 bg-background/95 z-10">
                        {rIdx + 1}
                      </td>
                      {columns.map((col) => {
                        const cellVal = row[col.name] ?? '';
                        return (
                          <td key={col.id} className="p-1 border-r border-border/50">
                            {isReadOnly ? (
                              <div className="px-2.5 py-1 text-xs truncate max-w-[200px]" title={String(cellVal)}>
                                {cellVal === '' ? (
                                  <span className="text-muted-foreground/40 italic">null</span>
                                ) : (
                                  String(cellVal)
                                )}
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={cellVal}
                                onChange={(e) => handleCellChange(rIdx, col.name, e.target.value)}
                                placeholder="null"
                                className="w-full bg-transparent px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground/30 focus:bg-background focus:ring-1 focus:ring-primary rounded outline-none transition-all"
                              />
                            )}
                          </td>
                        );
                      })}
                      {!isReadOnly && (
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(rIdx)}
                            className="p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            title="Delete row"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogBody>

        {/* Responsive Footer */}
        <DialogFooter className="px-4 sm:px-6 py-2.5 sm:py-3 border-t border-border/60 bg-muted/20 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="text-[11px] text-muted-foreground font-medium text-center sm:text-left">
            {rows.length} record{rows.length === 1 ? '' : 's'} in mock dataset
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isReadOnly && rows.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleAddRow} className="gap-1 h-8 text-xs cursor-pointer flex-1 sm:flex-none">
                <Plus className="size-3.5" />
                Add Record
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs cursor-pointer flex-1 sm:flex-none">
              {isReadOnly ? 'Close' : 'Cancel'}
            </Button>
            {!isReadOnly && (
              <Button size="sm" onClick={handleSave} className="h-8 text-xs font-semibold cursor-pointer w-full sm:w-auto">
                Save Sample Data
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
