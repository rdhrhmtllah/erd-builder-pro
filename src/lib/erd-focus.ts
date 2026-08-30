import type { Edge } from '@xyflow/react';

export type ErdTraceDirection = 'upstream' | 'downstream' | 'both';
export type ErdTraceDepth = 1 | 2 | 'all';

export type ErdTraceResult = {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
};

type Step = { nodeId: string; edgeId: string };

function adjacencyFor(edges: Edge[], direction: ErdTraceDirection) {
  const adjacency = new Map<string, Step[]>();
  const add = (from: string, step: Step) => adjacency.set(from, [...(adjacency.get(from) || []), step]);

  for (const edge of edges) {
    if (direction === 'upstream' || direction === 'both') {
      add(edge.source, { nodeId: edge.target, edgeId: edge.id });
    }
    if (direction === 'downstream' || direction === 'both') {
      add(edge.target, { nodeId: edge.source, edgeId: edge.id });
    }
  }
  return adjacency;
}

export function traceErdRelations(
  edges: Edge[],
  rootIds: Iterable<string>,
  direction: ErdTraceDirection,
  depth: ErdTraceDepth,
): ErdTraceResult {
  const adjacency = adjacencyFor(edges, direction);
  const nodeIds = new Set(rootIds);
  const edgeIds = new Set<string>();
  const queue = [...nodeIds].map(nodeId => ({ nodeId, distance: 0 }));
  const maxDepth = depth === 'all' ? Number.POSITIVE_INFINITY : depth;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.distance >= maxDepth) continue;
    for (const step of adjacency.get(current.nodeId) || []) {
      edgeIds.add(step.edgeId);
      if (nodeIds.has(step.nodeId)) continue;
      nodeIds.add(step.nodeId);
      queue.push({ nodeId: step.nodeId, distance: current.distance + 1 });
    }
  }
  return { nodeIds, edgeIds };
}

export function findErdRelationPath(
  edges: Edge[],
  startId: string,
  endId: string,
  direction: ErdTraceDirection = 'both',
): { nodeIds: string[]; edgeIds: string[] } | null {
  if (!startId || !endId) return null;
  if (startId === endId) return { nodeIds: [startId], edgeIds: [] };

  const adjacency = adjacencyFor(edges, direction);
  const visited = new Set([startId]);
  const queue = [startId];
  const previous = new Map<string, { nodeId: string; edgeId: string }>();

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const step of adjacency.get(current) || []) {
      if (visited.has(step.nodeId)) continue;
      visited.add(step.nodeId);
      previous.set(step.nodeId, { nodeId: current, edgeId: step.edgeId });
      if (step.nodeId === endId) {
        const nodeIds = [endId];
        const edgeIds: string[] = [];
        let nodeId = endId;
        while (nodeId !== startId) {
          const prior = previous.get(nodeId)!;
          edgeIds.push(prior.edgeId);
          nodeId = prior.nodeId;
          nodeIds.push(nodeId);
        }
        return { nodeIds: nodeIds.reverse(), edgeIds: edgeIds.reverse() };
      }
      queue.push(step.nodeId);
    }
  }
  return null;
}
