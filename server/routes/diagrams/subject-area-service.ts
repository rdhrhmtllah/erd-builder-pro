import { prisma } from "../../lib/prisma.js";
import { uidWhereClause } from "./service.js";

export type SubjectAreaInput = {
  name: string;
  color: string;
  node_ids: string[];
  viewport_x: number;
  viewport_y: number;
  viewport_zoom: number;
};

export type SubjectAreaPatch = Partial<SubjectAreaInput>;

export class InvalidSubjectAreaNodesError extends Error {}

export function normalizeSubjectAreaNodeIds(nodeIds: string[]): string[] {
  return [...new Set(nodeIds.map(id => id.trim()).filter(Boolean))];
}

function toResponse(area: any) {
  let nodeIds: string[] = [];
  try {
    const parsed = JSON.parse(area.nodeIds);
    if (Array.isArray(parsed)) nodeIds = parsed.filter((id): id is string => typeof id === "string");
  } catch { /* malformed legacy data becomes an empty view */ }
  return {
    id: area.id,
    name: area.name,
    color: area.color,
    node_ids: nodeIds,
    viewport_x: area.viewportX,
    viewport_y: area.viewportY,
    viewport_zoom: area.viewportZoom,
    created_at: area.createdAt,
    updated_at: area.updatedAt,
  };
}

async function ownedDiagram(uid: string, userId: string) {
  if (!prisma) throw new Error("Database connection not available");
  return prisma.diagram.findFirst({
    where: { ...uidWhereClause(uid, userId), isDeleted: false },
    select: { id: true },
  });
}

async function assertNodesBelongToDiagram(diagramId: any, nodeIds: string[]): Promise<void> {
  if (!prisma) throw new Error("Database connection not available");
  const uniqueIds = normalizeSubjectAreaNodeIds(nodeIds);
  const count = await prisma.entity.count({ where: { diagramId, id: { in: uniqueIds } } });
  if (count !== uniqueIds.length) {
    throw new InvalidSubjectAreaNodesError("One or more tables do not belong to this diagram");
  }
}

export async function listSubjectAreas(uid: string, userId: string) {
  const diagram = await ownedDiagram(uid, userId);
  if (!diagram) return null;
  const areas = await (prisma as any).diagramSubjectArea.findMany({
    where: { diagramId: diagram.id },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });
  return areas.map(toResponse);
}

export async function createSubjectArea(uid: string, userId: string, input: SubjectAreaInput) {
  const diagram = await ownedDiagram(uid, userId);
  if (!diagram) return null;
  const nodeIds = normalizeSubjectAreaNodeIds(input.node_ids);
  await assertNodesBelongToDiagram(diagram.id, nodeIds);
  const area = await (prisma as any).diagramSubjectArea.create({
    data: {
      diagramId: diagram.id,
      name: input.name.trim(),
      color: input.color.toLowerCase(),
      nodeIds: JSON.stringify(nodeIds),
      viewportX: input.viewport_x,
      viewportY: input.viewport_y,
      viewportZoom: input.viewport_zoom,
    },
  });
  return toResponse(area);
}

export async function updateSubjectArea(uid: string, areaId: string, userId: string, patch: SubjectAreaPatch) {
  const diagram = await ownedDiagram(uid, userId);
  if (!diagram) return null;
  const existing = await (prisma as any).diagramSubjectArea.findFirst({ where: { id: areaId, diagramId: diagram.id } });
  if (!existing) return null;

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.color !== undefined) data.color = patch.color.toLowerCase();
  if (patch.node_ids !== undefined) {
    const nodeIds = normalizeSubjectAreaNodeIds(patch.node_ids);
    await assertNodesBelongToDiagram(diagram.id, nodeIds);
    data.nodeIds = JSON.stringify(nodeIds);
  }
  if (patch.viewport_x !== undefined) data.viewportX = patch.viewport_x;
  if (patch.viewport_y !== undefined) data.viewportY = patch.viewport_y;
  if (patch.viewport_zoom !== undefined) data.viewportZoom = patch.viewport_zoom;

  const area = await (prisma as any).diagramSubjectArea.update({ where: { id: areaId }, data });
  return toResponse(area);
}

export async function deleteSubjectArea(uid: string, areaId: string, userId: string) {
  const diagram = await ownedDiagram(uid, userId);
  if (!diagram) return null;
  const deleted = await (prisma as any).diagramSubjectArea.deleteMany({ where: { id: areaId, diagramId: diagram.id } });
  return deleted.count > 0 ? { success: true } : null;
}
