/**
 * Mobile Action Bottom Sheet for Touch Devices.
 * Opens on long-press (500ms) or via table options.
 * Exposes all actions (Edit, Duplicate, Sample Data, Mock Data, Delete).
 */
import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Entity } from '@/types';
import { Pencil, Copy, Database, Sparkles, Trash2, X } from 'lucide-react';

interface MobileActionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity | null;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onOpenSampleData?: () => void;
  onDownloadMockSQL?: () => void;
  onDownloadMockJSON?: () => void;
  isReadOnly?: boolean;
}

export function MobileActionDrawer({
  open,
  onOpenChange,
  entity,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenSampleData,
  onDownloadMockSQL,
  onDownloadMockJSON,
  isReadOnly = false,
}: MobileActionDrawerProps) {
  if (!entity) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-4 pb-8 max-w-lg mx-auto rounded-t-2xl z-[100]">
        <SheetHeader className="px-0 pb-3 text-left border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div
              className="size-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-xs uppercase shrink-0"
              style={{ backgroundColor: entity.color || '#6366f1' }}
            >
              {entity.name.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-bold uppercase tracking-wider text-foreground truncate">
                {entity.name}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {entity.columns?.length || 0} columns · Table Actions
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2 py-4">
          {!isReadOnly && onEdit && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
              className="h-12 flex items-center justify-start gap-2.5 px-3 text-xs font-semibold cursor-pointer"
            >
              <Pencil className="size-4 text-primary shrink-0" />
              <span>Edit Structure</span>
            </Button>
          )}

          {onOpenSampleData && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onOpenSampleData();
              }}
              className="h-12 flex items-center justify-start gap-2.5 px-3 text-xs font-semibold cursor-pointer"
            >
              <Database className="size-4 text-primary shrink-0" />
              <span>Sample Data</span>
            </Button>
          )}

          {!isReadOnly && onDuplicate && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onDuplicate();
              }}
              className="h-12 flex items-center justify-start gap-2.5 px-3 text-xs font-semibold cursor-pointer"
            >
              <Copy className="size-4 text-muted-foreground shrink-0" />
              <span>Duplicate</span>
            </Button>
          )}

          {onDownloadMockSQL && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onDownloadMockSQL();
              }}
              className="h-12 flex items-center justify-start gap-2.5 px-3 text-xs font-semibold cursor-pointer"
            >
              <Sparkles className="size-4 text-amber-500 shrink-0" />
              <span>Mock (SQL)</span>
            </Button>
          )}

          {onDownloadMockJSON && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onDownloadMockJSON();
              }}
              className="h-12 flex items-center justify-start gap-2.5 px-3 text-xs font-semibold cursor-pointer"
            >
              <Sparkles className="size-4 text-emerald-500 shrink-0" />
              <span>Mock (JSON)</span>
            </Button>
          )}

          {!isReadOnly && onDelete && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onDelete();
              }}
              className="h-12 flex items-center justify-start gap-2.5 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 border-destructive/30 cursor-pointer"
            >
              <Trash2 className="size-4 shrink-0" />
              <span>Delete</span>
            </Button>
          )}
        </div>

        <SheetFooter className="px-0 pt-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full h-10 text-xs">
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
