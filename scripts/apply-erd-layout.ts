import { prisma } from '../server/lib/prisma.js';
import { captureEntityRevisionSafely } from '../server/lib/entity-history.js';
import { autoLayoutERD, syncERDEdgeHandles } from '../src/lib/autoLayoutERD.js';
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '../src/types.js';
import { writeFile } from 'node:fs/promises';

const diagramUid = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const svgPath = process.argv.find(argument => argument.startsWith('--svg='))?.slice('--svg='.length);
if (!diagramUid) throw new Error('Usage: tsx scripts/apply-erd-layout.ts <diagram-uid> [--dry-run] [--svg=path]');
if (!prisma) throw new Error('Database connection is unavailable');

const diagram = await prisma.diagram.findUnique({ where: { uid: diagramUid } });
if (!diagram) throw new Error(`Diagram ${diagramUid} was not found`);
if (!diagram.userId) throw new Error('Diagram has no owner');

const entities = await prisma.entity.findMany({
  where: { diagramId: diagram.id },
  include: { columns: { orderBy: { sortOrder: 'asc' } } },
});
const relationships = await prisma.relationship.findMany({ where: { diagramId: diagram.id } });

const nodes: Node<Entity>[] = entities.map(entity => ({
  id: entity.id,
  type: 'entity',
  position: { x: entity.x, y: entity.y },
  data: {
    id: entity.id,
    name: entity.name,
    x: entity.x,
    y: entity.y,
    color: entity.color || '#6366f1',
    comment: entity.comment || undefined,
    columns: entity.columns.map(column => ({
      id: column.id,
      name: column.name,
      type: column.type,
      is_pk: Boolean(column.isPk),
      is_nullable: Boolean(column.isNullable),
      is_unique: Boolean(column.isUnique),
      sort_order: column.sortOrder || 0,
    })) as Entity['columns'],
  },
}));

const edges: Edge[] = relationships.map(relationship => ({
  id: relationship.id,
  source: relationship.sourceEntityId!,
  target: relationship.targetEntityId!,
  sourceHandle: relationship.sourceHandle || `col-${relationship.sourceColumnId}-source`,
  targetHandle: relationship.targetHandle || `col-${relationship.targetColumnId}-target`,
  type: 'erdRelation',
}));

const snapshot = (positionedNodes: Node<Entity>[], positionedEdges: Edge[]) => ({
  name: diagram.name,
  source_type: diagram.sourceType || 'blank',
  entities: entities.map(entity => {
    const node = positionedNodes.find(item => item.id === entity.id)!;
    return { ...entity, x: node.position.x, y: node.position.y };
  }),
  relationships: relationships.map(relationship => {
    const edge = positionedEdges.find(item => item.id === relationship.id)!;
    return { ...relationship, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle };
  }),
  viewport: { x: 80, y: 60, zoom: 0.28 },
});

if (!dryRun) await captureEntityRevisionSafely({
  entityType: 'diagrams',
  entityId: diagram.id,
  userId: diagram.userId,
  snapshot: snapshot(nodes, edges),
  source: 'manual',
  force: true,
});

const positionedNodes = autoLayoutERD(nodes, edges);
const positionedEdges = syncERDEdgeHandles(positionedNodes, edges);

const nodeWidth = (node: Node<Entity>) => Math.max(220, node.data.name.length * 8 + 88,
  ...(node.data.columns || []).map(column => column.name.length * 7.5 + column.type.length * 7 + 70));
const nodeHeight = (node: Node<Entity>) => 48 + (node.data.columns?.length || 0) * 36;
const handleY = (node: Node<Entity>, handle?: string | null) => {
  const id = String(handle || '').replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
  const index = node.data.columns.findIndex(column => String(column.id) === id);
  return node.position.y + 44 + (Math.max(0, index) + 0.5) * 36;
};
const escapeXml = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
} as Record<string, string>)[character]!);

if (svgPath) {
  const byId = new Map(positionedNodes.map(node => [node.id, node]));
  const edgeMarkup = positionedEdges.map(edge => {
    const source = byId.get(edge.source)!;
    const target = byId.get(edge.target)!;
    const sourceX = edge.sourceHandle?.endsWith('-l') ? source.position.x : source.position.x + nodeWidth(source);
    const targetX = edge.targetHandle?.endsWith('-r') ? target.position.x + nodeWidth(target) : target.position.x;
    const sourceY = handleY(source, edge.sourceHandle);
    const targetY = handleY(target, edge.targetHandle);
    const routeX = typeof edge.data?.layoutRouteX === 'number' ? edge.data.layoutRouteX : (sourceX + targetX) / 2;
    const routeY = typeof edge.data?.layoutRouteY === 'number' ? edge.data.layoutRouteY : null;
    const path = routeY === null
      ? `M ${sourceX} ${sourceY} L ${routeX} ${sourceY} L ${routeX} ${targetY} L ${targetX} ${targetY}`
      : `M ${sourceX} ${sourceY} L ${sourceX + (sourceX < targetX ? 24 : -24)} ${sourceY} L ${sourceX + (sourceX < targetX ? 24 : -24)} ${routeY} L ${targetX + (sourceX < targetX ? -24 : 24)} ${routeY} L ${targetX + (sourceX < targetX ? -24 : 24)} ${targetY} L ${targetX} ${targetY}`;
    return `<path d="${path}" fill="none" stroke="#475569" stroke-width="3" marker-end="url(#arrow)"/>`;
  }).join('\n');
  const nodeMarkup = positionedNodes.map(node => {
    const width = nodeWidth(node);
    const height = nodeHeight(node);
    const rows = node.data.columns.map((column, index) =>
      `<text x="${node.position.x + 14}" y="${node.position.y + 68 + index * 36}" font-size="13" fill="#334155">${escapeXml(column.name)}</text>`,
    ).join('');
    return `<g><rect x="${node.position.x}" y="${node.position.y}" width="${width}" height="${height}" rx="8" fill="#fff" stroke="#334155" stroke-width="2"/><rect x="${node.position.x}" y="${node.position.y}" width="${width}" height="44" rx="8" fill="#e2e8f0"/><text x="${node.position.x + 14}" y="${node.position.y + 28}" font-size="15" font-weight="700" fill="#0f172a">${escapeXml(node.data.name)}</text>${rows}</g>`;
  }).join('\n');
  const minY = Math.min(0, ...positionedEdges.map(edge => Number(edge.data?.layoutRouteY) || 0)) - 30;
  const maxX = Math.max(...positionedNodes.map(node => node.position.x + nodeWidth(node))) + 150;
  const maxY = Math.max(...positionedNodes.map(node => node.position.y + nodeHeight(node))) + 100;
  await writeFile(svgPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${minY} ${maxX} ${maxY - minY}" width="${maxX}" height="${maxY - minY}"><rect x="0" y="${minY}" width="100%" height="100%" fill="#f8fafc"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#475569"/></marker></defs>${edgeMarkup}${nodeMarkup}</svg>`);
  process.stdout.write(`Preview written to ${svgPath}\n`);
}

if (!dryRun) await prisma.$transaction([
  ...positionedNodes.map(node => prisma.entity.update({
    where: { id: node.id },
    data: { x: node.position.x, y: node.position.y },
  })),
  ...positionedEdges.map(edge => prisma.relationship.update({
    where: { id: edge.id },
    data: { sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle },
  })),
  prisma.diagram.update({
    where: { id: diagram.id },
    data: {
      viewportX: 80,
      viewportY: 60,
      viewportZoom: 0.28,
      version: (diagram.version || 0) + 1,
      updatedAt: new Date(),
    },
  }),
]);

if (!dryRun) await captureEntityRevisionSafely({
  entityType: 'diagrams',
  entityId: diagram.id,
  userId: diagram.userId,
  snapshot: snapshot(positionedNodes, positionedEdges),
  source: 'manual',
  force: true,
});

for (const node of [...positionedNodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)) {
  process.stdout.write(`${node.data.name}: (${Math.round(node.position.x)}, ${Math.round(node.position.y)})\n`);
}
process.stdout.write(`${dryRun ? 'Calculated' : 'Applied'} layout to ${diagram.name}: ${positionedNodes.length} tables, ${positionedEdges.length} relationships\n`);

await prisma.$disconnect();
