/**
 * Interactive Sample Data Viewer & Editor Modal for ERD Tables.
 * Allows viewing, adding, editing, and auto-generating mock records per table.
 */
import React, { useState, useEffect } from 'react';
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
import { Entity, Column } from '@/types';
import { generateTableMockJSON } from '@/lib/mock-data-generator';
import { Table, Plus, Trash2, Sparkles, Copy, Check, Download, AlertCircle } from 'lucide-react';
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
    setRows((prev) => prev.filter((_, idx) => idx !== rowIndex));
  };

  const handleAutoFill = () => {
    if (isReadOnly) return;
    try {
      const mockStr = generateTableMockJSON(entity, 5);
      const parsed = JSON.parse(mockStr);
      setRows(parsed);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="size-8 rounded-lg flex items-center justify-center text-white shadow-xs"
                style={{ backgroundColor: entity.color || '#6366f1' }}
              >
                <Table className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  Sample Data: <span className="uppercase font-mono text-primary">{entity.name}</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {isReadOnly ? 'Viewing example records for this table' : 'Input or generate example data to preview realistic records'}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mr-6">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyJSON}
                disabled={rows.length === 0}
                className="h-8 text-xs gap-1 cursor-pointer"
              >
                {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                <span>Copy JSON</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJSON}
                disabled={rows.length === 0}
                className="h-8 text-xs gap-1 cursor-pointer"
              >
                <Download className="size-3.5" />
                <span>Export</span>
              </Button>
              {!isReadOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFill}
                  className="h-8 text-xs gap-1 text-primary hover:bg-primary/10 border-primary/40 cursor-pointer"
                  title="Auto-generate 5 realistic rows based on column types"
                >
                  <Sparkles className="size-3.5" />
                  <span>Auto-Fill (5 Rows)</span>
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="flex-1 p-0 overflow-auto">
          {columns.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground text-sm gap-2">
              <AlertCircle className="size-6 opacity-40" />
              <span>This table has no columns defined yet. Add columns first.</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground text-sm gap-3">
              <Table className="size-8 opacity-30 text-primary" />
              <div className="text-center">
                <p className="font-semibold text-foreground">No sample data added yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add custom rows or click Auto-Fill to populate example records based on column types.
                </p>
              </div>
              {!isReadOnly && (
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" onClick={handleAutoFill} className="gap-1.5 cursor-pointer">
                    <Sparkles className="size-3.5" />
                    Auto-Fill 5 Mock Rows
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleAddRow} className="gap-1.5 cursor-pointer">
                    <Plus className="size-3.5" />
                    Add Empty Row
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="min-w-full overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/60 border-b border-border/80 sticky top-0 z-10 backdrop-blur">
                    <th className="w-10 px-3 py-2.5 text-center font-mono text-[10px] text-muted-foreground border-r border-border/50">
                      #
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col.id}
                        className="px-3.5 py-2.5 font-semibold text-foreground border-r border-border/50 whitespace-nowrap min-w-[120px]"
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
                      <td className="px-3 py-2 text-center font-mono text-[10px] text-muted-foreground/60 border-r border-border/50 select-none">
                        {rIdx + 1}
                      </td>
                      {columns.map((col) => {
                        const cellVal = row[col.name] ?? '';
                        return (
                          <td key={col.id} className="p-1 border-r border-border/50">
                            {isReadOnly ? (
                              <div className="px-2.5 py-1 text-xs truncate max-w-[240px]" title={String(cellVal)}>
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
                                className="w-full bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/30 focus:bg-background focus:ring-1 focus:ring-primary rounded outline-none transition-all"
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

        <DialogFooter className="px-6 py-3 border-t border-border/60 bg-muted/20 shrink-0 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground font-medium">
            {rows.length} row{rows.length === 1 ? '' : 's'} recorded
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && rows.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleAddRow} className="gap-1 h-8 text-xs cursor-pointer">
                <Plus className="size-3.5" />
                Add Row
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs cursor-pointer">
              {isReadOnly ? 'Close' : 'Cancel'}
            </Button>
            {!isReadOnly && (
              <Button size="sm" onClick={handleSave} className="h-8 text-xs font-semibold cursor-pointer">
                Save Sample Data
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
