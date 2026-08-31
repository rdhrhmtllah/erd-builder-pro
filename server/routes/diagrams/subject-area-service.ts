import { randomUUID } from "node:crypto";
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
const PROPOSAL_TTL_MS = 10 * 60_000;
type SubjectAreaProposal = {
  id: string; userId: string; uid: string; expectedDiagramUpdatedAt: string | null;
  expectedAreaUpdatedAt: string | null; action: any; preview: Record<string, unknown>; expiresAt: number;
};
const proposals = new Map<string, SubjectAreaProposal>();

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
    select: { id: true, uid: true, name: true, updatedAt: true },
  });
}

function timestamp(value: unknown) { return value ? new Date(value as any).toISOString() : null; }

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

export async function getSubjectArea(uid: string, areaId: string, userId: string) {
  const diagram = await ownedDiagram(uid, userId);
  if (!diagram) return null;
  const area = await (prisma as any).diagramSubjectArea.findFirst({ where: { id: areaId, diagramId: diagram.id } });
  return area ? toResponse(area) : null;
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

function requiredName(value: unknown, field = "name") {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) throw new Error(`${field} is required and must be at most 80 characters`);
  return value.trim();
}

function validColor(value: unknown) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error("color must be a six-digit hex value");
  return value.toLowerCase();
}

function coordinate(value: unknown, field: string, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error(`${field} must be a finite coordinate`);
  return value;
}

async function normalizeAreaInput(diagramId: any, input: any, current?: any): Promise<SubjectAreaInput> {
  const nodeIds = input.node_ids === undefined ? (current ? toResponse(current).node_ids : undefined) : input.node_ids;
  if (!Array.isArray(nodeIds) || nodeIds.length < 1 || nodeIds.length > 1000 || nodeIds.some(id => typeof id !== "string" || !id.trim() || id.length > 160)) {
    throw new Error("node_ids must contain between 1 and 1000 table IDs");
  }
  const normalized: SubjectAreaInput = {
    name: input.name === undefined && current ? current.name : requiredName(input.name),
    color: input.color === undefined && current ? current.color : validColor(input.color),
    node_ids: normalizeSubjectAreaNodeIds(nodeIds),
    viewport_x: coordinate(input.viewport_x, "viewport_x", current?.viewportX ?? 0),
    viewport_y: coordinate(input.viewport_y, "viewport_y", current?.viewportY ?? 0),
    viewport_zoom: coordinate(input.viewport_zoom, "viewport_zoom", current?.viewportZoom ?? 1),
  };
  if (normalized.viewport_zoom < 0.05 || normalized.viewport_zoom > 4) throw new Error("viewport_zoom must be between 0.05 and 4");
  await assertNodesBelongToDiagram(diagramId, normalized.node_ids);
  return normalized;
}

export async function proposeSubjectAreaChange(userId: string, uid: string, operation: any) {
  const diagram = await ownedDiagram(uid, userId);
  if (!diagram) throw new Error("Diagram not found");
  const op = operation?.op;
  if (!['create', 'update', 'delete'].includes(op)) throw new Error("Subject area operation must be create, update, or delete");
  let action: any;
  let expectedAreaUpdatedAt: string | null = null;
  if (op === 'create') {
    const input = await normalizeAreaInput(diagram.id, operation.area);
    action = { op, input };
  } else {
    if (typeof operation.area_id !== 'string' || !operation.area_id) throw new Error("area_id is required");
    const current = await (prisma as any).diagramSubjectArea.findFirst({ where: { id: operation.area_id, diagramId: diagram.id } });
    if (!current) throw new Error("Subject area was not found");
    expectedAreaUpdatedAt = timestamp(current.updatedAt);
    action = op === 'delete' ? { op, areaId: current.id, name: current.name } : { op, areaId: current.id, input: await normalizeAreaInput(diagram.id, operation.changes, current) };
  }
  const proposalId = randomUUID();
  const input = action.input;
  const preview = {
    operation: 'erd_subject_area', action: op, diagram_uid: diagram.uid, diagram_name: diagram.name,
    area_id: action.areaId || null, area_name: input?.name || action.name || '',
    table_count: input?.node_ids.length || 0, table_ids: input?.node_ids || [], color: input?.color || null,
    requires_explicit_confirmation: true,
  };
  proposals.set(proposalId, { id: proposalId, userId, uid: String(diagram.uid), expectedDiagramUpdatedAt: timestamp(diagram.updatedAt), expectedAreaUpdatedAt, action, preview, expiresAt: Date.now() + PROPOSAL_TTL_MS });
  return { proposal_id: proposalId, confirmation: proposalId, expires_at: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(), ...preview };
}

export async function applySubjectAreaProposal(userId: string, proposalId: string, confirmation: string) {
  const proposal = proposals.get(proposalId);
  if (!proposal || proposal.userId !== userId || proposal.expiresAt < Date.now()) { proposals.delete(proposalId); throw new Error("Subject area proposal is missing or expired; create a new proposal"); }
  if (proposal.id !== confirmation) throw new Error("Confirmation must exactly match proposal_id");
  const diagram = await ownedDiagram(proposal.uid, userId);
  if (!diagram || timestamp(diagram.updatedAt) !== proposal.expectedDiagramUpdatedAt) throw new Error("Conflict: diagram changed after this proposal was created");
  let result: any;
  if (proposal.action.op === 'create') result = await createSubjectArea(proposal.uid, userId, proposal.action.input);
  else {
    const existing = await (prisma as any).diagramSubjectArea.findFirst({ where: { id: proposal.action.areaId, diagramId: diagram.id } });
    if (!existing || timestamp(existing.updatedAt) !== proposal.expectedAreaUpdatedAt) throw new Error("Conflict: subject area changed after this proposal was created");
    result = proposal.action.op === 'delete'
      ? await deleteSubjectArea(proposal.uid, proposal.action.areaId, userId)
      : await updateSubjectArea(proposal.uid, proposal.action.areaId, userId, proposal.action.input);
  }
  if (!result) throw new Error("Subject area was not found");
  proposals.delete(proposalId);
  return { status: 'applied', proposal_id: proposalId, diagram_uid: proposal.uid, action: proposal.action.op, result };
}

export function cleanupSubjectAreaProposals() {
  for (const [id, proposal] of proposals) if (proposal.expiresAt < Date.now()) proposals.delete(id);
}
