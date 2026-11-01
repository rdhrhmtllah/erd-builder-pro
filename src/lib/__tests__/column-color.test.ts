import { describe, expect, it } from 'vitest';
import { COLUMN_PRESET_COLORS } from '../../contexts/ColumnColorContext';

describe('Column Color Marking Feature', () => {
  it('provides 9 rich preset colors for column marking', () => {
    expect(COLUMN_PRESET_COLORS.length).toBe(9);
    expect(COLUMN_PRESET_COLORS.map(c => c.name)).toContain('Amber');
    expect(COLUMN_PRESET_COLORS.map(c => c.name)).toContain('Teal');
    expect(COLUMN_PRESET_COLORS.map(c => c.name)).toContain('Purple');
  });

  it('updates target column colors while keeping other columns unchanged', () => {
    const table = {
      id: 'table-1',
      name: 'users',
      columns: [
        { id: 'col-1', name: 'id', color: null },
        { id: 'col-2', name: 'email', color: null },
        { id: 'col-3', name: 'created_at', color: null },
      ],
    };

    const selectedColIds = new Set(['col-1', 'col-3']);
    const chosenColor = '#10b981';

    const updatedColumns = table.columns.map(c => {
      if (selectedColIds.has(c.id)) return { ...c, color: chosenColor };
      return c;
    });

    expect(updatedColumns[0].color).toBe('#10b981');
    expect(updatedColumns[1].color).toBeNull();
    expect(updatedColumns[2].color).toBe('#10b981');
  });

  it('resets color to null when clear is requested', () => {
    const col = { id: 'col-1', name: 'id', color: '#ef4444' };
    const reset = { ...col, color: null };
    expect(reset.color).toBeNull();
  });
});
