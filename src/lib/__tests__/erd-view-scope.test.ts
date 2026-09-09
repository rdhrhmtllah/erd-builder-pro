import { describe, expect, it } from 'vitest';
import { describeErdViewScope, hiddenTablesSummary } from '../erd-view-scope';

const ids = (...values: string[]) => new Set(values);

describe('describeErdViewScope', () => {
  it('reports nothing when the whole ERD is on screen', () => {
    expect(describeErdViewScope({ totalTableCount: 20 })).toEqual({
      isScoped: false, hiddenTableCount: 0, totalTableCount: 20, label: null,
    });
  });

  it('counts the tables a Subject Area is hiding', () => {
    const scope = describeErdViewScope({
      totalTableCount: 20,
      visibleTableIds: ids('a', 'b', 'c'),
      areaName: 'Billing',
    });

    expect(scope).toMatchObject({ isScoped: true, hiddenTableCount: 17, label: 'Subject Area · Billing' });
  });

  it('still says which view is active when the area holds every table', () => {
    // Nothing is hidden, but Auto Layout and the edges still behave differently.
    const scope = describeErdViewScope({
      totalTableCount: 2,
      visibleTableIds: ids('a', 'b'),
      areaName: 'Everything',
    });

    expect(scope.isScoped).toBe(true);
    expect(scope.hiddenTableCount).toBe(0);
  });

  it('names a Perspective, which reshapes the canvas without hiding tables', () => {
    const scope = describeErdViewScope({ totalTableCount: 8, perspectiveName: 'Ops view' });
    expect(scope).toMatchObject({ isScoped: true, hiddenTableCount: 0, label: 'Perspective · Ops view' });
  });

  it('prefers the Area when both names somehow arrive', () => {
    // The two are mutually exclusive on the canvas; the label must not claim both.
    const scope = describeErdViewScope({ totalTableCount: 5, areaName: 'Billing', perspectiveName: 'Ops view' });
    expect(scope.label).toBe('Subject Area · Billing');
  });

  it('falls back to a generic label when tables are hidden by something unnamed', () => {
    const scope = describeErdViewScope({ totalTableCount: 5, visibleTableIds: ids('a') });
    expect(scope).toMatchObject({ isScoped: true, hiddenTableCount: 4, label: 'Filtered view' });
  });

  it('treats an empty name as no name rather than rendering a dangling separator', () => {
    expect(describeErdViewScope({ totalTableCount: 5, areaName: '' }).label).toBeNull();
  });

  it('never reports a negative count when more ids are visible than counted', () => {
    // Perspectives add section nodes, so the visible set can outgrow the tables.
    const scope = describeErdViewScope({ totalTableCount: 2, visibleTableIds: ids('a', 'b', 'section-1') });
    expect(scope.hiddenTableCount).toBe(0);
  });
});

describe('hiddenTablesSummary', () => {
  it('says nothing when no table is hidden', () => {
    expect(hiddenTablesSummary(describeErdViewScope({ totalTableCount: 4, perspectiveName: 'Ops' }))).toBeNull();
  });

  it('counts in plural', () => {
    const scope = describeErdViewScope({ totalTableCount: 20, visibleTableIds: ids('a'), areaName: 'Billing' });
    expect(hiddenTablesSummary(scope)).toBe('19 of 20 tables hidden');
  });

  it('keeps the noun plural with the total, not the hidden count', () => {
    const scope = describeErdViewScope({ totalTableCount: 2, visibleTableIds: ids('a'), areaName: 'Billing' });
    expect(hiddenTablesSummary(scope)).toBe('1 of 2 tables hidden');
  });

  it('is singular only when the diagram holds one table', () => {
    const scope = describeErdViewScope({ totalTableCount: 1, visibleTableIds: ids(), areaName: 'Billing' });
    expect(hiddenTablesSummary(scope)).toBe('1 of 1 table hidden');
  });
});
