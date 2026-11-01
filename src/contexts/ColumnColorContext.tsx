import React, { createContext, useContext, useState, useCallback } from 'react';

export const COLUMN_PRESET_COLORS = [
  { name: 'Red', hex: '#ef4444', bg: 'rgba(239, 68, 68, 0.18)', border: '#ef4444' },
  { name: 'Orange', hex: '#f97316', bg: 'rgba(249, 115, 22, 0.18)', border: '#f97316' },
  { name: 'Amber', hex: '#f59e0b', bg: 'rgba(245, 158, 11, 0.18)', border: '#f59e0b' },
  { name: 'Green', hex: '#10b981', bg: 'rgba(16, 185, 129, 0.18)', border: '#10b981' },
  { name: 'Teal', hex: '#14b8a6', bg: 'rgba(20, 184, 166, 0.18)', border: '#14b8a6' },
  { name: 'Blue', hex: '#3b82f6', bg: 'rgba(59, 130, 246, 0.18)', border: '#3b82f6' },
  { name: 'Indigo', hex: '#6366f1', bg: 'rgba(99, 102, 241, 0.18)', border: '#6366f1' },
  { name: 'Purple', hex: '#a855f7', bg: 'rgba(168, 85, 247, 0.18)', border: '#a855f7' },
  { name: 'Pink', hex: '#ec4899', bg: 'rgba(236, 72, 153, 0.18)', border: '#ec4899' },
];

export interface SelectedColumnKey {
  entityId: string;
  columnId: string;
}

interface ColumnColorContextType {
  selectedColumns: Map<string, SelectedColumnKey>;
  isColumnSelected: (entityId: string, columnId: string) => boolean;
  toggleColumnSelection: (entityId: string, columnId: string, multi: boolean) => void;
  clearColumnSelection: () => void;
  applyColorToSelectedColumns: (colorHex: string | null) => void;
}

const ColumnColorContext = createContext<ColumnColorContextType | null>(null);

export function ColumnColorProvider({
  children,
  onApplyColor,
}: {
  children: React.ReactNode;
  onApplyColor?: (selected: SelectedColumnKey[], colorHex: string | null) => void;
}) {
  const [selectedColumns, setSelectedColumns] = useState<Map<string, SelectedColumnKey>>(new Map());

  const isColumnSelected = useCallback(
    (entityId: string, columnId: string) => selectedColumns.has(`${entityId}:${columnId}`),
    [selectedColumns]
  );

  const toggleColumnSelection = useCallback((entityId: string, columnId: string, multi: boolean) => {
    const key = `${entityId}:${columnId}`;
    setSelectedColumns((prev) => {
      const next = new Map(multi ? prev : []);
      if (prev.has(key) && multi) {
        next.delete(key);
      } else {
        next.set(key, { entityId, columnId });
      }
      return next;
    });
  }, []);

  const clearColumnSelection = useCallback(() => {
    setSelectedColumns(new Map());
  }, []);

  const applyColorToSelectedColumns = useCallback(
    (colorHex: string | null) => {
      if (selectedColumns.size === 0) return;
      const list = Array.from(selectedColumns.values());
      onApplyColor?.(list, colorHex);
    },
    [selectedColumns, onApplyColor]
  );

  return (
    <ColumnColorContext.Provider
      value={{
        selectedColumns,
        isColumnSelected,
        toggleColumnSelection,
        clearColumnSelection,
        applyColorToSelectedColumns,
      }}
    >
      {children}
    </ColumnColorContext.Provider>
  );
}

export function useColumnColor(): ColumnColorContextType {
  const ctx = useContext(ColumnColorContext);
  if (!ctx) {
    return {
      selectedColumns: new Map(),
      isColumnSelected: () => false,
      toggleColumnSelection: () => {},
      clearColumnSelection: () => {},
      applyColorToSelectedColumns: () => {},
    };
  }
  return ctx;
}
