import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';

const START_X = 50;
const START_Y = 50;
const BASE_TABLE_WIDTH = 220;
const HORIZONTAL_GAP = 280;
const VERTICAL_GAP = 90;
const TRACK_GAP = 220;
const MAX_TRACK_HEIGHT = 1900;
const COMPONENT_GAP = 240;
const ROUTE_CLEARANCE = 36;
const ROUTE_LANE_GAP = 44;

const HEADER_H = 44;
const ROW_H = 36;

type Footprint = { width: number; height: number };

function positiveSize(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Prefer the size React Flow measured in the browser. The fallback estimates
 * the widest piece of content so a long table/column cannot overlap its next
 * neighbour before React Flow has measured the node.
 */
function estimateNodeWidth(node: Node<Entity>): number {
  const measuredWidth = positiveSize(node.measured?.width) || positiveSize(node.width);
  if (measuredWidth) return Math.max(BASE_TABLE_WIDTH, measuredWidth);

  const tableName = String(node.data.name || node.id || '');
  const headerWidth = 24 + 18 + 12 + tableName.length * 8 + 34;
  const columnWidth = (node.data.columns || []).reduce((max, column) => {
    const nameWidth = String(column.name || '').length * 7.5;
    const typeWidth = String(column.type || '').length * 7;
    const badgesWidth = (column.is_pk ? 22 : 0) + (column._is_fk ? 22 : 0);
    return Math.max(max, 24 + nameWidth + typeWidth + badgesWidth + 24);
  }, 0);

  return Math.max(BASE_TABLE_WIDTH, Math.ceil(headerWidth), Math.ceil(columnWidth));
}

function estimateNodeHeight(node: Node<Entity>): number {
  const measuredHeight = positiveSize(node.measured?.height) || positiveSize(node.height);
  if (measuredHeight) return measuredHeight;

  const columnCount = node.data.columns?.length || 0;
  return HEADER_H + (columnCount ? columnCount * ROW_H : 0) + 4;
}

function footprint(node: Node<Entity>): Footprint {
  return {
    width: estimateNodeWidth(node),
    height: estimateNodeHeight(node),
  };
}

function nodeName(node: Node<Entity>): string {
  return String(node.data.name || node.id || '').trim().toLocaleLowerCase();
}

function sortByName(ids: string[], nodesById: Map<string, Node<Entity>>): string[] {
  return [...ids].sort((a, b) => {
    const nameCompare = nodeName(nodesById.get(a)!)
      .localeCompare(nodeName(nodesById.get(b)!));
    return nameCompare || a.localeCompare(b);
  });
}

function columnIdFromHandle(handle?: string | null): string | null {
  if (!handle) return null;
  return handle
    .replace(/^col-/, '')
    .replace(/-(source|target)(-(l|r))?$/, '');
}

/** Relative vertical position of a relationship handle inside a table. */
function columnFraction(node: Node<Entity>, handle?: string | null): number {
  const columns = [...(node.data.columns || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  if (columns.length === 0) return 0.5;
  const id = columnIdFromHandle(handle);
  const index = columns.findIndex(column => String(column.id) === id);
  return (index < 0 ? columns.length / 2 : index + 0.5) / columns.length;
}

function columnAnchorOffset(node: Node<Entity>, handle?: string | null): number {
  const columns = [...(node.data.columns || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  if (columns.length === 0) return footprint(node).height / 2;
  const id = columnIdFromHandle(handle);
  const index = columns.findIndex(column => String(column.id) === id);
  return HEADER_H + (Math.max(0, index) + 0.5) * ROW_H;
}

/** Tarjan SCCs let cyclic schemas share a stable rank instead of expanding forever. */
function stronglyConnectedComponents(
  ids: string[],
  outgoing: Map<string, Set<string>>,
): string[][] {
  let nextIndex = 0;
  const indexById = new Map<string, number>();
  const lowLinkById = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (id: string) => {
    indexById.set(id, nextIndex);
    lowLinkById.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);

    for (const next of outgoing.get(id) || []) {
      if (!indexById.has(next)) {
        visit(next);
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, lowLinkById.get(next)!));
      } else if (onStack.has(next)) {
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, indexById.get(next)!));
      }
    }

    if (lowLinkById.get(id) !== indexById.get(id)) return;

    const component: string[] = [];
    let current = '';
    do {
      current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
    } while (current !== id);
    components.push(component);
  };

  for (const id of ids) {
    if (!indexById.has(id)) visit(id);
  }

  return components;
}

function buildRanks(
  ids: string[],
  outgoing: Map<string, Set<string>>,
): Map<string, number> {
  const components = stronglyConnectedComponents(ids, outgoing);
  const componentOf = new Map<string, number>();
  components.forEach((component, index) => {
    component.forEach(id => componentOf.set(id, index));
  });

  // Rank 0 is a referenced/root table. A FK holder is placed to its right,
  // which matches the editor's left/right relationship handles.
  const componentDependencies = new Map<number, Set<number>>();
  components.forEach((_, index) => componentDependencies.set(index, new Set()));
  for (const source of ids) {
    const sourceComponent = componentOf.get(source)!;
    for (const target of outgoing.get(source) || []) {
      const targetComponent = componentOf.get(target)!;
      if (sourceComponent !== targetComponent) {
        componentDependencies.get(sourceComponent)!.add(targetComponent);
      }
    }
  }

  const rankByComponent = new Map<number, number>();
  const rankOf = (component: number): number => {
    const cached = rankByComponent.get(component);
    if (cached !== undefined) return cached;

    const dependencies = componentDependencies.get(component) || new Set<number>();
    const rank = dependencies.size === 0
      ? 0
      : Math.max(...[...dependencies].map(rankOf)) + 1;
    rankByComponent.set(component, rank);
    return rank;
  };

  for (let component = 0; component < components.length; component += 1) {
    rankOf(component);
  }

  return new Map(ids.map(id => [id, rankByComponent.get(componentOf.get(id)!) || 0]));
}

function layerHeight(
  ids: string[],
  nodesById: Map<string, Node<Entity>>,
): number {
  return ids.reduce((total, id) => total + footprint(nodesById.get(id)!).height, 0)
    + Math.max(0, ids.length - 1) * VERTICAL_GAP;
}

function applyPosition(
  node: Node<Entity>,
  x: number,
  y: number,
): Node<Entity> {
  return {
    ...node,
    position: { x, y },
    data: { ...node.data, x, y },
  };
}

function layoutDisconnected(
  result: Node<Entity>[],
  nodesById: Map<string, Node<Entity>>,
): Node<Entity>[] {
  const sorted = sortByName(result.map(node => node.id), nodesById);
  // Keep small schemas in one readable row. Larger standalone sets become a
  // compact grid instead of one extremely tall column.
  const columnCount = sorted.length <= 4 ? sorted.length : Math.ceil(Math.sqrt(sorted.length));
  const columnWidths = Array.from({ length: columnCount }, () => 0);
  const rowHeights: number[] = [];

  sorted.forEach((id, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const node = nodesById.get(id)!;
    columnWidths[column] = Math.max(columnWidths[column], footprint(node).width);
    rowHeights[row] = Math.max(rowHeights[row] || 0, footprint(node).height);
  });

  const xByColumn: number[] = [];
  columnWidths.forEach((_, index) => {
    xByColumn[index] = index === 0
      ? START_X
      : xByColumn[index - 1] + columnWidths[index - 1] + HORIZONTAL_GAP;
  });

  const yByRow: number[] = [];
  rowHeights.forEach((_, index) => {
    yByRow[index] = START_Y + (index === 0 ? 0 : yByRow[index - 1] + rowHeights[index - 1] + VERTICAL_GAP);
  });

  const positioned = new Map<string, Node<Entity>>();
  sorted.forEach((id, index) => {
    positioned.set(id, applyPosition(
      nodesById.get(id)!,
      xByColumn[index % columnCount],
      yByRow[Math.floor(index / columnCount)],
    ));
  });

  return result.map(node => positioned.get(node.id)!);
}

function layoutConnected(
  result: Node<Entity>[],
  validEdges: Edge[],
  nodesById: Map<string, Node<Entity>>,
): Node<Entity>[] {
  const ids = result.map(node => node.id);
  const outgoing = new Map(ids.map(id => [id, new Set<string>()]));
  const incidentEdges = new Map(ids.map(id => [id, [] as Edge[]]));

  for (const edge of validEdges) {
    if (edge.source === edge.target) continue;
    outgoing.get(edge.source)!.add(edge.target);
    incidentEdges.get(edge.source)!.push(edge);
    incidentEdges.get(edge.target)!.push(edge);
  }

  const baseRank = buildRanks(ids, outgoing);
  const rankOf = new Map(baseRank);

  // A root referenced directly by a deep leaf is promoted next to that leaf.
  // This removes skip-rank edges (the main cause of lines running through an
  // intervening column) while keeping ordinary parent/child chains intact.
  for (const target of ids) {
    if ((baseRank.get(target) || 0) !== 0) continue;
    const deepestChild = validEdges
      .filter(edge => edge.target === target && edge.source !== target)
      .reduce((max, edge) => Math.max(max, baseRank.get(edge.source) || 0), 0);
    rankOf.set(target, Math.max(0, deepestChild - 1));
  }
  // Co-parents of the same table belong in the same visual column. This also
  // prevents a newly promoted parent from making its sibling edge skip a rank.
  for (const source of ids) {
    const rootTargets = [...(outgoing.get(source) || [])]
      .filter(target => (baseRank.get(target) || 0) === 0);
    const sharedRank = Math.max(...rootTargets.map(target => rankOf.get(target) || 0), 0);
    if (sharedRank > 0) rootTargets.forEach(target => rankOf.set(target, sharedRank));
  }
  for (const source of [...ids].sort((a, b) => (baseRank.get(a) || 0) - (baseRank.get(b) || 0))) {
    if ((baseRank.get(source) || 0) === 0) continue;
    const dependencyRanks = [...(outgoing.get(source) || [])]
      .filter(target => target !== source && (baseRank.get(target) || 0) < (baseRank.get(source) || 0))
      .map(target => rankOf.get(target) || 0);
    if (dependencyRanks.length) rankOf.set(source, Math.max(...dependencyRanks) + 1);
  }

  const maxRank = Math.max(...rankOf.values(), 0);
  const layers = new Map<number, string[]>();
  for (const id of ids) {
    const rank = rankOf.get(id) || 0;
    layers.set(rank, [...(layers.get(rank) || []), id]);
  }
  for (let rank = 0; rank <= maxRank; rank += 1) {
    layers.set(rank, sortByName(layers.get(rank) || [], nodesById));
  }

  // Barycentric sweeps substantially reduce crossings at joins and forks,
  // while the name/id tie-breaker keeps the result deterministic.
  for (let pass = 0; pass < 8; pass += 1) {
    const ranks = pass % 2 === 0
      ? Array.from({ length: maxRank + 1 }, (_, index) => index)
      : Array.from({ length: maxRank + 1 }, (_, index) => maxRank - index);
    for (const rank of ranks) {
      const current = layers.get(rank) || [];
      const order = new Map<string, number>();
      for (let index = 0; index < current.length; index += 1) order.set(current[index], index);

      const allOrders = new Map<number, Map<string, number>>();
      for (let otherRank = 0; otherRank <= maxRank; otherRank += 1) {
        allOrders.set(otherRank, new Map((layers.get(otherRank) || []).map((id, index) => [id, index])));
      }

      current.sort((a, b) => {
        const score = (id: string): number | null => {
          const node = nodesById.get(id)!;
          const values = (incidentEdges.get(id) || [])
            .map(edge => {
              const isSource = edge.source === id;
              const neighbourId = isSource ? edge.target : edge.source;
              const neighbourRank = rankOf.get(neighbourId);
              const neighbourOrder = neighbourRank === undefined
                ? null
                : allOrders.get(neighbourRank)?.get(neighbourId) ?? null;
              if (neighbourOrder === null) return null;

              // Include the actual row anchor, not just the table index. This
              // keeps a table's FK rows aligned with the referenced PK rows.
              const neighbour = nodesById.get(neighbourId)!;
              const neighbourHandle = isSource ? edge.targetHandle : edge.sourceHandle;
              const ownHandle = isSource ? edge.sourceHandle : edge.targetHandle;
              return neighbourOrder + columnFraction(neighbour, neighbourHandle)
                - columnFraction(node, ownHandle) * 0.35;
            })
            .filter((value): value is number => value !== null);
          return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        };
        const aScore = score(a);
        const bScore = score(b);
        if (aScore !== null && bScore !== null && aScore !== bScore) return aScore - bScore;
        if (aScore !== null && bScore === null) return -1;
        if (aScore === null && bScore !== null) return 1;
        const oldOrder = (order.get(a) || 0) - (order.get(b) || 0);
        if (oldOrder) return oldOrder;
        return nodeName(nodesById.get(a)!).localeCompare(nodeName(nodesById.get(b)!)) || a.localeCompare(b);
      });
      layers.set(rank, current);
    }
  }

  const tracksByRank = new Map<number, string[][]>();
  for (let rank = 0; rank <= maxRank; rank += 1) {
    const idsInLayer = layers.get(rank) || [];
    if (layerHeight(idsInLayer, nodesById) <= MAX_TRACK_HEIGHT) {
      tracksByRank.set(rank, [idsInLayer]);
      continue;
    }

    const outer = idsInLayer.filter(id => validEdges.some(edge =>
      edge.target === id && (rankOf.get(edge.source) || 0) > rank,
    ));
    const outerSet = new Set(outer);
    const inner = idsInLayer.filter(id => !outerSet.has(id));
    const tracks: string[][] = [];
    const appendPacked = (trackIds: string[]) => {
      let current: string[] = [];
      for (const id of trackIds) {
        const next = [...current, id];
        if (current.length && layerHeight(next, nodesById) > MAX_TRACK_HEIGHT) {
          tracks.push(current);
          current = [id];
        } else {
          current = next;
        }
      }
      if (current.length) tracks.push(current);
    };
    // Supporting tables stay on the inner side; tables referenced by the next
    // rank occupy the outermost track, closest to their children.
    appendPacked(inner);
    appendPacked(outer);
    tracksByRank.set(rank, tracks.length ? tracks : [idsInLayer]);
  }

  const trackEntries: Array<{ rank: number; track: number; ids: string[]; width: number; height: number; x: number }> = [];
  let rankX = START_X;
  for (let rank = 0; rank <= maxRank; rank += 1) {
    const tracks = tracksByRank.get(rank) || [[]];
    let trackX = rankX;
    tracks.forEach((trackIds, track) => {
      const width = Math.max(...trackIds.map(id => footprint(nodesById.get(id)!).width), BASE_TABLE_WIDTH);
      trackEntries.push({ rank, track, ids: trackIds, width, height: layerHeight(trackIds, nodesById), x: trackX });
      trackX += width + TRACK_GAP;
    });
    rankX = trackX - TRACK_GAP + HORIZONTAL_GAP;
  }

  const maxHeight = Math.max(...trackEntries.map(entry => entry.height), 0);
  const positioned = new Map<string, Node<Entity>>();
  for (const entry of trackEntries) {
    let y = START_Y + (maxHeight - entry.height) / 2;
    for (const id of entry.ids) {
      const node = nodesById.get(id)!;
      positioned.set(id, applyPosition(node, entry.x, y));
      y += footprint(node).height + VERTICAL_GAP;
    }
  }

  // Align actual FK/PK rows, not just table centres. Repeated constrained
  // sweeps pull related rows together while preserving a generous gap between
  // tables in the same column.
  for (let pass = 0; pass < 10; pass += 1) {
    const entries = pass % 2 === 0 ? [...trackEntries].reverse() : trackEntries;
    for (const entry of entries) {
      const idsInLayer = entry.ids;
      if (!idsInLayer.length) continue;
      const desired = idsInLayer.map(id => {
        const node = positioned.get(id)!;
        const values = (incidentEdges.get(id) || []).flatMap(edge => {
          if (edge.source === edge.target) return [];
          const isSource = edge.source === id;
          const neighbour = positioned.get(isSource ? edge.target : edge.source);
          if (!neighbour) return [];
          const ownHandle = isSource ? edge.sourceHandle : edge.targetHandle;
          const neighbourHandle = isSource ? edge.targetHandle : edge.sourceHandle;
          return [neighbour.position.y + columnAnchorOffset(neighbour, neighbourHandle)
            - columnAnchorOffset(node, ownHandle)];
        });
        if (!values.length) return node.position.y;
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        return node.position.y * 0.35 + average * 0.65;
      });

      const nextY = [...desired];
      for (let index = 1; index < nextY.length; index += 1) {
        const previous = positioned.get(idsInLayer[index - 1])!;
        nextY[index] = Math.max(
          nextY[index],
          nextY[index - 1] + footprint(previous).height + VERTICAL_GAP,
        );
      }
      for (let index = nextY.length - 2; index >= 0; index -= 1) {
        const current = positioned.get(idsInLayer[index])!;
        nextY[index] = Math.min(
          nextY[index],
          nextY[index + 1] - footprint(current).height - VERTICAL_GAP,
        );
      }
      const shift = Math.max(0, START_Y - Math.min(...nextY));
      idsInLayer.forEach((id, index) => {
        const node = positioned.get(id)!;
        positioned.set(id, applyPosition(node, node.position.x, nextY[index] + shift));
      });
    }
  }

  return result.map(node => positioned.get(node.id)!);
}

/** Keep unrelated schema islands compact and away from the main relation graph. */
function weakComponents(ids: string[], edges: Edge[]): string[][] {
  const neighbours = new Map(ids.map(id => [id, new Set<string>()]));
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    neighbours.get(edge.source)?.add(edge.target);
    neighbours.get(edge.target)?.add(edge.source);
  }

  const unseen = new Set(ids);
  const components: string[][] = [];
  while (unseen.size) {
    const first = unseen.values().next().value as string;
    const queue = [first];
    const component: string[] = [];
    unseen.delete(first);
    while (queue.length) {
      const id = queue.shift()!;
      component.push(id);
      for (const neighbour of neighbours.get(id) || []) {
        if (!unseen.delete(neighbour)) continue;
        queue.push(neighbour);
      }
    }
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function layoutByComponent(
  result: Node<Entity>[],
  validEdges: Edge[],
  nodesById: Map<string, Node<Entity>>,
): Node<Entity>[] {
  const components = weakComponents(result.map(node => node.id), validEdges);
  if (components.length === 1) return layoutConnected(result, validEdges, nodesById);

  const laidOut = components.map(ids => {
    const idSet = new Set(ids);
    const componentNodes = result.filter(node => idSet.has(node.id));
    const componentEdges = validEdges.filter(edge => idSet.has(edge.source) && idSet.has(edge.target));
    const positioned = componentEdges.length
      ? layoutConnected(componentNodes, componentEdges, nodesById)
      : layoutDisconnected(componentNodes, nodesById);
    const minX = Math.min(...positioned.map(node => node.position.x));
    const minY = Math.min(...positioned.map(node => node.position.y));
    const maxX = Math.max(...positioned.map(node => node.position.x + footprint(node).width));
    const maxY = Math.max(...positioned.map(node => node.position.y + footprint(node).height));
    return { positioned, minX, minY, width: maxX - minX, height: maxY - minY };
  });

  const mainWidth = laidOut[0].width;
  const totalArea = laidOut.reduce((sum, component) => sum + component.width * component.height, 0);
  // Aim for a landscape-balanced packing area. Small disconnected groups can
  // then share one row instead of creating a mostly empty row per component.
  const shelfWidth = Math.max(mainWidth, Math.sqrt(totalArea) * 1.35, 1200);
  const positionedById = new Map<string, Node<Entity>>();
  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];

  laidOut.forEach((component, index) => {
    let componentX = START_X;
    let componentY = START_Y;
    if (index > 0) {
      const candidateXs = [...new Set([
        START_X,
        ...placed.map(item => item.x),
        ...placed.map(item => item.x + item.width + COMPONENT_GAP),
      ])].sort((a, b) => a - b);
      const candidateYs = [...new Set([
        START_Y,
        ...placed.map(item => item.y + item.height + COMPONENT_GAP),
      ])].sort((a, b) => a - b);
      const fits = (x: number, y: number) => x + component.width <= START_X + shelfWidth
        && placed.every(item =>
          x + component.width + COMPONENT_GAP <= item.x
          || x >= item.x + item.width + COMPONENT_GAP
          || y + component.height + COMPONENT_GAP <= item.y
          || y >= item.y + item.height + COMPONENT_GAP,
        );
      const candidates = candidateYs.flatMap(y => candidateXs.map(x => ({ x, y })))
        .filter(candidate => fits(candidate.x, candidate.y))
        .sort((a, b) => a.y - b.y || a.x - b.x);
      if (candidates.length) {
        componentX = candidates[0].x;
        componentY = candidates[0].y;
      } else {
        componentY = Math.max(...placed.map(item => item.y + item.height)) + COMPONENT_GAP;
      }
    }
    for (const node of component.positioned) {
      positionedById.set(node.id, applyPosition(
        node,
        componentX + node.position.x - component.minX,
        componentY + node.position.y - component.minY,
      ));
    }
    placed.push({ x: componentX, y: componentY, width: component.width, height: component.height });
  });

  return result.map(node => positionedById.get(node.id)!);
}

export function autoLayoutERD(
  nodes: Node<Entity>[],
  edges: Edge[],
): Node<Entity>[] {
  if (nodes.length === 0) return nodes;

  const result = nodes.map(node => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  }));
  const nodesById = new Map(result.map(node => [node.id, node]));
  const validEdges = edges.filter(edge => nodesById.has(edge.source) && nodesById.has(edge.target));

  return validEdges.length === 0
    ? layoutDisconnected(result, nodesById)
    : layoutByComponent(result, validEdges, nodesById);
}

/** Recalculate left/right row handles after a layout changes relative X order. */
export function syncERDEdgeHandles(
  nodes: Node<Entity>[],
  edges: Edge[],
): Edge[] {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const componentIds = weakComponents(nodes.map(node => node.id), edges);
  const componentByNode = new Map<string, string[]>();
  componentIds.forEach(ids => ids.forEach(id => componentByNode.set(id, ids)));
  const usedLongRouteYs: number[] = [];

  const handledEdges = edges.map(edge => {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    const sourceColumn = columnIdFromHandle(edge.sourceHandle);
    const targetColumn = columnIdFromHandle(edge.targetHandle);
    if (!source || !target || !sourceColumn || !targetColumn) return edge;

    if (edge.source === edge.target) {
      return {
        ...edge,
        sourceHandle: `col-${sourceColumn}-source`,
        targetHandle: `col-${targetColumn}-target-r`,
      };
    }
    const sourceBeforeTarget = source.position.x < target.position.x
      || (source.position.x === target.position.x && source.position.y <= target.position.y);
    const sourceSuffix = sourceBeforeTarget ? '-source' : '-source-l';
    const targetSuffix = sourceBeforeTarget ? '-target' : '-target-r';
    return {
      ...edge,
      sourceHandle: `col-${sourceColumn}${sourceSuffix}`,
      targetHandle: `col-${targetColumn}${targetSuffix}`,
    };
  });

  // Allocate a separate vertical lane to every relationship in a corridor.
  // Lines may share their final short segment at a PK, but never the long
  // middle segment where they need to be visually traceable.
  const corridorGroups = new Map<string, Edge[]>();
  for (const edge of handledEdges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target || source.id === target.id) continue;
    const leftX = Math.min(source.position.x, target.position.x);
    const rightX = Math.max(source.position.x, target.position.x);
    const hasIntermediateColumn = nodes.some(node =>
      node.id !== source.id
      && node.id !== target.id
      && node.position.x > leftX + 1
      && node.position.x < rightX - 1,
    );
    if (hasIntermediateColumn) continue;
    const key = `${Math.round(leftX)}:${Math.round(rightX)}`;
    corridorGroups.set(key, [...(corridorGroups.get(key) || []), edge]);
  }

  const routeXByEdge = new Map<string, number>();
  for (const [key, corridorEdges] of corridorGroups) {
    const [leftX, rightX] = key.split(':').map(Number);
    const leftBoundary = Math.max(
      ...nodes.filter(node => Math.abs(node.position.x - leftX) < 2)
        .map(node => node.position.x + footprint(node).width),
    );
    const available = rightX - leftBoundary;
    if (available < 100) continue;
    const sorted = [...corridorEdges].sort((a, b) => {
      const anchorAverage = (edge: Edge) => {
        const source = nodesById.get(edge.source)!;
        const target = nodesById.get(edge.target)!;
        return (source.position.y + columnAnchorOffset(source, edge.sourceHandle)
          + target.position.y + columnAnchorOffset(target, edge.targetHandle)) / 2;
      };
      return anchorAverage(a) - anchorAverage(b) || a.id.localeCompare(b.id);
    });
    sorted.forEach((edge, index) => {
      routeXByEdge.set(edge.id, leftBoundary + available * (index + 1) / (sorted.length + 1));
    });
  }

  return handledEdges.map(edge => {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) return edge;
    const nextData = { ...(edge.data || {}) } as Record<string, unknown>;
    delete nextData.layoutRouteX;
    delete nextData.layoutRouteY;

    if (source.id === target.id) {
      nextData.layoutRouteX = source.position.x + footprint(source).width + 90;
      return { ...edge, data: nextData };
    }

    const minEndpointX = Math.min(source.position.x, target.position.x);
    const maxEndpointX = Math.max(source.position.x, target.position.x);
    const component = componentByNode.get(source.id) || [source.id, target.id];
    const intermediateNodes = component
      .map(id => nodesById.get(id))
      .filter((node): node is Node<Entity> => Boolean(node) && node!.id !== source.id && node!.id !== target.id)
      .filter(node => node.position.x > minEndpointX + 1 && node.position.x < maxEndpointX - 1);

    let layoutRouteY: number | undefined;
    if (intermediateNodes.length) {
      const sourceAnchorY = source.position.y + columnAnchorOffset(source, edge.sourceHandle);
      const targetAnchorY = target.position.y + columnAnchorOffset(target, edge.targetHandle);
      const midpoint = (sourceAnchorY + targetAnchorY) / 2;
      const blockedIntervals = intermediateNodes.map(node => ({
        min: node.position.y - ROUTE_CLEARANCE,
        max: node.position.y + footprint(node).height + ROUTE_CLEARANCE,
      }));
      const candidates = [
        sourceAnchorY,
        targetAnchorY,
        midpoint,
        ...blockedIntervals.flatMap(interval => [interval.min, interval.max]),
      ].sort((a, b) => {
        const score = (value: number) => Math.abs(value - sourceAnchorY)
          + Math.abs(value - targetAnchorY)
          + Math.abs(value - midpoint) * 0.2;
        return score(a) - score(b);
      });
      const isFree = (value: number) => blockedIntervals.every(interval => value <= interval.min || value >= interval.max)
        && usedLongRouteYs.every(used => Math.abs(value - used) >= ROUTE_LANE_GAP);
      layoutRouteY = candidates.find(isFree);
      if (layoutRouteY === undefined) {
        layoutRouteY = Math.min(...blockedIntervals.map(interval => interval.min)) - ROUTE_LANE_GAP;
        while (!isFree(layoutRouteY)) layoutRouteY -= ROUTE_LANE_GAP;
      }
      usedLongRouteYs.push(layoutRouteY);
    }

    if (layoutRouteY !== undefined) nextData.layoutRouteY = layoutRouteY;
    else {
      const layoutRouteX = routeXByEdge.get(edge.id);
      if (layoutRouteX !== undefined) nextData.layoutRouteX = layoutRouteX;
    }

    return {
      ...edge,
      data: nextData,
    };
  });
}
