/**
 * Whether the canvas is showing the whole ERD or a narrowed view of it.
 *
 * A Subject Area hides the tables outside it and a Perspective re-lays the
 * diagram out; both are easy to leave running and then wonder where the tables
 * went. This turns that state into something the canvas can say out loud.
 */
export interface ErdViewScope {
  /** True when a named view is shaping the canvas, hidden tables or not. */
  isScoped: boolean;
  hiddenTableCount: number;
  totalTableCount: number;
  /** What is narrowing the view, ready to render. Null when nothing is. */
  label: string | null;
}

export interface ErdViewScopeInput {
  totalTableCount: number;
  /** Ids still on screen. Null when nothing is filtering tables. */
  visibleTableIds?: Set<string> | null;
  areaName?: string | null;
  perspectiveName?: string | null;
}

export function describeErdViewScope(input: ErdViewScopeInput): ErdViewScope {
  const { totalTableCount, visibleTableIds, areaName, perspectiveName } = input;

  const hiddenTableCount = visibleTableIds
    ? Math.max(0, totalTableCount - visibleTableIds.size)
    : 0;

  // An Area and a Perspective are mutually exclusive on the canvas, but a stray
  // name should never produce a label that claims both.
  const label = areaName !== null && areaName !== undefined && areaName !== ''
    ? `Subject Area · ${areaName}`
    : perspectiveName !== null && perspectiveName !== undefined && perspectiveName !== ''
      ? `Perspective · ${perspectiveName}`
      : visibleTableIds && hiddenTableCount > 0
        ? 'Filtered view'
        : null;

  return { isScoped: label !== null, hiddenTableCount, totalTableCount, label };
}

/** The sentence shown beside the label; null when no table is actually hidden. */
export function hiddenTablesSummary(scope: ErdViewScope): string | null {
  if (scope.hiddenTableCount === 0) return null;
  const noun = scope.totalTableCount === 1 ? 'table' : 'tables';
  return `${scope.hiddenTableCount} of ${scope.totalTableCount} ${noun} hidden`;
}
