/**
 * A Perspective is a saved, non-destructive way of looking at an ERD.  The
 * canonical diagram remains the source of truth; this file only stores visual
 * grouping, local positions, and relationship presentation preferences.
 */

export const ERD_PERSPECTIVE_DIRECTIONS = ['left-to-right', 'top-to-bottom'] as const;
export const ERD_PERSPECTIVE_EDGE_MODES = ['all', 'internal', 'cross-section'] as const;
export type ErdPerspectiveDirection = (typeof ERD_PERSPECTIVE_DIRECTIONS)[number];
export type ErdPerspectiveEdgeMode = (typeof ERD_PERSPECTIVE_EDGE_MODES)[number];

export type ErdPerspectivePosition = { x: number; y: number };
export type ErdPerspectiveViewport = { x: number; y: number; zoom: number };
export type ErdPerspectiveSection = {
  id: string;
  name: string;
  color: string;
  description?: string;
  node_ids: string[];
  order: number;
  collapsed?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};
export type ErdPerspectiveData = {
  sections: ErdPerspectiveSection[];
  node_positions: Record<string, ErdPerspectivePosition>;
  viewport: ErdPerspectiveViewport;
  direction: ErdPerspectiveDirection;
  edge_mode: ErdPerspectiveEdgeMode;
};

export type ErdPerspectiveLayoutNode = { id: string; width?: number; height?: number; columnCount?: number };
export type ErdPerspectiveLayoutEdge = { id?: string; source: string; target: string };
export type ErdPerspectiveEdgeRoute = { axis: 'x' | 'y'; value: number; cross_section: boolean };
export type ErdPerspectiveLayout = ErdPerspectiveData & {
  unassigned_node_ids: string[];
  edge_routes: Record<string, ErdPerspectiveEdgeRoute>;
};

const DEFAULT_VIEWPORT: ErdPerspectiveViewport = { x: 0, y: 0, zoom: 1 };
const DEFAULT_COLOR = '#6366f1';
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_COORDINATE = 1_000_000;

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE ? value : fallback;
}

export function normalizePerspectiveColor(value: unknown, fallback = DEFAULT_COLOR) {
  return typeof value === 'string' && COLOR_PATTERN.test(value) ? value.toLowerCase() : fallback;
}

export function normalizePerspectiveNodeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string').map(id => id.trim()).filter(Boolean))];
}

export function normalizePerspectiveData(value: unknown, validNodeIds?: Iterable<string>): ErdPerspectiveData {
  const raw = value && typeof value === 'object' ? value as Record<string, any> : {};
  const allowed = validNodeIds ? new Set(validNodeIds) : null;
  const used = new Set<string>();
  const rawSections = Array.isArray(raw.sections) ? raw.sections.slice(0, 40) : [];
  const sections = rawSections.map((item: any, index: number): ErdPerspectiveSection | null => {
    if (!item || typeof item !== 'object') return null;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 160) : `section-${index + 1}`;
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 100) : `Section ${index + 1}`;
    const nodeIds = normalizePerspectiveNodeIds(item.node_ids).filter(nodeId => {
      if ((allowed && !allowed.has(nodeId)) || used.has(nodeId)) return false;
      used.add(nodeId);
      return true;
    });
    return {
      id,
      name,
      color: normalizePerspectiveColor(item.color, ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#a855f7', '#ef4444'][index % 6]),
      ...(typeof item.description === 'string' && item.description.trim() ? { description: item.description.trim().slice(0, 500) } : {}),
      node_ids: nodeIds,
      order: Math.max(0, Math.min(999, Math.floor(finite(item.order, index)))),
      collapsed: item.collapsed === true,
      x: finite(item.x, 0), y: finite(item.y, 0),
      width: Math.max(220, finite(item.width, 360)), height: Math.max(130, finite(item.height, 220)),
    };
  }).filter((section): section is ErdPerspectiveSection => !!section).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const positions: Record<string, ErdPerspectivePosition> = {};
  if (raw.node_positions && typeof raw.node_positions === 'object') {
    for (const [nodeId, position] of Object.entries(raw.node_positions)) {
      if ((allowed && !allowed.has(nodeId)) || !position || typeof position !== 'object') continue;
      positions[nodeId] = { x: finite((position as any).x, 0), y: finite((position as any).y, 0) };
    }
  }
  const viewport = raw.viewport && typeof raw.viewport === 'object' ? raw.viewport : DEFAULT_VIEWPORT;
  return {
    sections,
    node_positions: positions,
    viewport: { x: finite(viewport.x, 0), y: finite(viewport.y, 0), zoom: Math.min(4, Math.max(0.05, finite(viewport.zoom, 1))) },
    direction: ERD_PERSPECTIVE_DIRECTIONS.includes(raw.direction) ? raw.direction : 'left-to-right',
    edge_mode: ERD_PERSPECTIVE_EDGE_MODES.includes(raw.edge_mode) ? raw.edge_mode : 'all',
  };
}

function sectionRanks(sections: ErdPerspectiveSection[], edges: ErdPerspectiveLayoutEdge[]) {
  const byNode = new Map<string, string>();
  sections.forEach(section => section.node_ids.forEach(nodeId => byNode.set(nodeId, section.id)));
  const rank = new Map(sections.map((section, index) => [section.id, index]));
  const outgoing = new Map(sections.map(section => [section.id, new Set<string>()]));
  for (const edge of edges) {
    const source = byNode.get(edge.source);
    const target = byNode.get(edge.target);
    if (source && target && source !== target) outgoing.get(source)?.add(target);
  }
  // A bounded relaxation creates useful flow ranks while safely tolerating FK cycles.
  for (let pass = 0; pass < sections.length; pass += 1) {
    let changed = false;
    for (const section of sections) {
      const current = rank.get(section.id) || 0;
      for (const target of outgoing.get(section.id) || []) {
        const targetRank = rank.get(target) || 0;
        if (targetRank <= current && current - targetRank < sections.length) {
          rank.set(target, current + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const minimum = Math.min(0, ...rank.values());
  for (const [id, value] of rank) rank.set(id, Math.max(0, value - minimum));
  return rank;
}

/**
 * Two-level layout: tables are packed inside their section, then sections are
 * arranged according to cross-section dependency flow. It intentionally keeps
 * generous gutters: a readable sparse ERD is preferable to a compact knot.
 */
export function layoutErdPerspective(
  inputNodes: ErdPerspectiveLayoutNode[],
  inputEdges: ErdPerspectiveLayoutEdge[],
  input: unknown,
): ErdPerspectiveLayout {
  const nodeById = new Map(inputNodes.map(node => [node.id, node]));
  const data = normalizePerspectiveData(input, nodeById.keys());
  const assigned = new Set(data.sections.flatMap(section => section.node_ids));
  const unassigned = inputNodes.map(node => node.id).filter(id => !assigned.has(id));
  const sections = data.sections.map(section => ({ ...section, node_ids: [...section.node_ids] }));
  if (unassigned.length) {
    sections.push({ id: '__unassigned__', name: 'Shared / Unassigned', color: '#64748b', node_ids: unassigned, order: 999, description: 'Tables not assigned to a section.' });
  }
  if (!sections.length) return { ...data, sections: [], node_positions: {}, unassigned_node_ids: [], edge_routes: {} };

  const rankBySection = sectionRanks(sections, inputEdges);
  const grouped = new Map<number, ErdPerspectiveSection[]>();
  sections.forEach(section => {
    const rank = rankBySection.get(section.id) || 0;
    grouped.set(rank, [...(grouped.get(rank) || []), section]);
  });
  const ranks = [...grouped.keys()].sort((a, b) => a - b);
  const positions: Record<string, ErdPerspectivePosition> = {};
  const placedSections: ErdPerspectiveSection[] = [];
  const sectionGap = 150;
  const rowGap = 110;
  let axisOffset = 0;

  for (const rank of ranks) {
    const column = (grouped.get(rank) || []).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    let crossOffset = 0;
    let maxAxisSize = 0;
    for (const section of column) {
      const members = section.node_ids.map(id => nodeById.get(id)).filter((node): node is ErdPerspectiveLayoutNode => !!node);
      const columns = members.length > 10 ? 3 : members.length > 3 ? 2 : 1;
      const cellWidth = Math.max(280, ...members.map(node => node.width || 300));
      const cellHeights = members.map(node => Math.max(110, node.height || 110 + Math.min(12, node.columnCount || 0) * 24));
      const rows = Math.max(1, Math.ceil(members.length / columns));
      const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(110, ...cellHeights.filter((_, index) => Math.floor(index / columns) === row)));
      const width = Math.max(360, columns * cellWidth + (columns - 1) * 74 + 72);
      const height = Math.max(170, rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, rows - 1) * 60 + 104);
      const x = data.direction === 'left-to-right' ? axisOffset : crossOffset;
      const y = data.direction === 'left-to-right' ? crossOffset : axisOffset;
      let cursorY = y + 68;
      members.forEach((node, index) => {
        const row = Math.floor(index / columns);
        const col = index % columns;
        if (col === 0 && index > 0) cursorY += rowHeights[row - 1] + 60;
        positions[node.id] = {
          x: x + 36 + col * (cellWidth + 74),
          y: cursorY,
        };
      });
      placedSections.push({ ...section, x, y, width, height });
      crossOffset += (data.direction === 'left-to-right' ? height : width) + rowGap;
      maxAxisSize = Math.max(maxAxisSize, data.direction === 'left-to-right' ? width : height);
    }
    axisOffset += maxAxisSize + sectionGap;
  }

  const sectionByNode = new Map<string, ErdPerspectiveSection>();
  placedSections.forEach(section => section.node_ids.forEach(id => sectionByNode.set(id, section)));
  const edgeRoutes: Record<string, ErdPerspectiveEdgeRoute> = {};
  let lane = 0;
  for (const edge of inputEdges) {
    if (!edge.id) continue;
    const sourceSection = sectionByNode.get(edge.source);
    const targetSection = sectionByNode.get(edge.target);
    if (!sourceSection || !targetSection || sourceSection.id === targetSection.id) {
      edgeRoutes[edge.id] = { axis: data.direction === 'left-to-right' ? 'x' : 'y', value: 0, cross_section: false };
      continue;
    }
    const offset = (lane++ % 9) * 14 - 56;
    if (data.direction === 'left-to-right') {
      const sourceRight = (sourceSection.x || 0) + (sourceSection.width || 0);
      const targetLeft = targetSection.x || 0;
      edgeRoutes[edge.id] = { axis: 'x', value: (sourceRight + targetLeft) / 2 + offset, cross_section: true };
    } else {
      const sourceBottom = (sourceSection.y || 0) + (sourceSection.height || 0);
      const targetTop = targetSection.y || 0;
      edgeRoutes[edge.id] = { axis: 'y', value: (sourceBottom + targetTop) / 2 + offset, cross_section: true };
    }
  }
  return {
    ...data,
    sections: placedSections,
    node_positions: positions,
    unassigned_node_ids: unassigned,
    edge_routes: edgeRoutes,
  };
}
