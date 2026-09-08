export type NoteTreeItem = {
  id: number | string;
  uid?: string | null;
  parent_id?: number | string | null;
  parentId?: number | string | null;
  title?: string | null;
  name?: string | null;
};

export type FlattenedNote<T extends NoteTreeItem> = T & { depth: number };

function idOf(item: NoteTreeItem): string {
  return String(item.id);
}

function parentIdOf(item: NoteTreeItem): string | null {
  const parent = item.parent_id ?? item.parentId ?? null;
  return parent === null || parent === undefined || parent === '' ? null : String(parent);
}

function labelOf(item: NoteTreeItem): string {
  return String(item.title ?? item.name ?? '');
}

/**
 * Order a flat page list depth-first so the sidebar can indent it as a tree.
 *
 * The list arrives flat from the API, and sorting by depth alone would separate
 * a page from its parent. Pages whose parent is missing — filtered out, in the
 * trash, or part of a corrupt loop — are kept as roots so they stay reachable
 * rather than vanishing from the sidebar.
 */
export function flattenNoteTree<T extends NoteTreeItem>(items: T[]): FlattenedNote<T>[] {
  const byId = new Map(items.map(item => [idOf(item), item]));
  const children = new Map<string, T[]>();
  const roots: T[] = [];

  for (const item of items) {
    const parent = parentIdOf(item);
    if (parent !== null && parent !== idOf(item) && byId.has(parent)) {
      children.set(parent, [...(children.get(parent) || []), item]);
    } else {
      roots.push(item);
    }
  }

  const byLabel = (a: T, b: T) => labelOf(a).localeCompare(labelOf(b)) || idOf(a).localeCompare(idOf(b));
  const result: FlattenedNote<T>[] = [];
  const visited = new Set<string>();

  const visit = (item: T, depth: number) => {
    const key = idOf(item);
    if (visited.has(key)) return;
    visited.add(key);
    result.push({ ...item, depth });
    for (const child of [...(children.get(key) || [])].sort(byLabel)) visit(child, depth + 1);
  };

  for (const root of [...roots].sort(byLabel)) visit(root, 0);
  // Anything trapped in a cycle still deserves a place in the list.
  for (const item of [...items].sort(byLabel)) if (!visited.has(idOf(item))) visit(item, 0);

  return result;
}

/** Ancestors of a page, outermost first, for a breadcrumb. */
export function noteAncestors<T extends NoteTreeItem>(items: T[], id: number | string): T[] {
  const byId = new Map(items.map(item => [idOf(item), item]));
  const trail: T[] = [];
  const seen = new Set<string>();

  let cursor = byId.get(String(id));
  while (cursor) {
    const parent = parentIdOf(cursor);
    if (parent === null || seen.has(parent)) break;
    seen.add(parent);
    const next = byId.get(parent);
    if (!next) break;
    trail.unshift(next);
    cursor = next;
  }
  return trail;
}
