import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { uidWhereClause } from './service.js';
import {
  layoutErdPerspective,
  normalizePerspectiveData,
  type ErdPerspectiveData,
} from '../../../shared/erd-perspectives.js';

const PROPOSAL_TTL_MS = 10 * 60_000;

export type PerspectiveInput = {
  name: string;
  description?: string | null;
  direction?: string;
  edge_mode?: string;
  sections?: unknown[];
  node_positions?: Record<string, unknown>;
  viewport?: { x: number; y: number; zoom: number };
};
export type PerspectivePatch = Partial<PerspectiveInput>;
type Proposal = { id: string; userId: string; uid: string; expectedVersion: number; expectedUpdatedAt: string | null; action: any; preview: any; expiresAt: number };
const proposals = new Map<string, Proposal>();

export class InvalidPerspectiveNodesError extends Error {}

function parseData(row: any, validIds?: Iterable<string>): ErdPerspectiveData {
  let raw: unknown = {};
  try { raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data || {}; } catch { /* legacy corruption is safely ignored */ }
  const rawObject = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const data = normalizePerspectiveData({ ...rawObject, direction: row.direction || (rawObject as any).direction, edge_mode: row.edgeMode || (rawObject as any).edge_mode, viewport: (rawObject as any).viewport || { x: row.viewportX, y: row.viewportY, zoom: row.viewportZoom } }, validIds);
  return data;
}

function serializable(row: any, validIds?: Iterable<string>) {
  const data = parseData(row, validIds);
  return {
    id: row.id, name: row.name, description: row.description || '', direction: data.direction, edge_mode: data.edge_mode,
    ...data, created_at: row.createdAt, updated_at: row.updatedAt,
  };
}

async function ownedDiagram(uid: string, userId: string, withSchema = false): Promise<any> {
  if (!prisma) throw new Error('Database connection not available');
  const select: any = { id: true, uid: true, name: true, version: true, updatedAt: true, isDeleted: true };
  if (withSchema) {
    select.entities = { select: { id: true, name: true, columns: { select: { id: true } } } };
    select.relationships = { select: { id: true, sourceEntityId: true, targetEntityId: true } };
  }
  return (prisma as any).diagram.findFirst({ where: { ...uidWhereClause(uid, userId), isDeleted: false }, select });
}

async function assertNodes(diagramId: any, data: ErdPerspectiveData) {
  if (!prisma) throw new Error('Database connection not available');
  const ids = [...new Set(data.sections.flatMap(section => section.node_ids))];
  if (!ids.length) return;
  const count = await (prisma as any).entity.count({ where: { diagramId, id: { in: ids } } });
  if (count !== ids.length) throw new InvalidPerspectiveNodesError('One or more perspective tables do not belong to this diagram');
}

function dataFromInput(input: PerspectiveInput, current?: ErdPerspectiveData, validIds?: Iterable<string>) {
  const merged = {
    ...(current || {}),
    ...(input.sections !== undefined ? { sections: input.sections } : {}),
    ...(input.node_positions !== undefined ? { node_positions: input.node_positions } : {}),
    ...(input.viewport !== undefined ? { viewport: input.viewport } : {}),
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
    ...(input.edge_mode !== undefined ? { edge_mode: input.edge_mode } : {}),
  };
  return normalizePerspectiveData(merged, validIds);
}

function layoutForDiagram(diagram: any, data: ErdPerspectiveData) {
  return layoutErdPerspective(
    (diagram.entities || []).map((entity: any) => ({ id: entity.id, columnCount: entity.columns?.length || 0, height: 116 + Math.min(16, entity.columns?.length || 0) * 25 })),
    (diagram.relationships || []).map((relationship: any) => ({ id: relationship.id, source: relationship.sourceEntityId, target: relationship.targetEntityId })),
    data,
  );
}

function persistenceData(data: ErdPerspectiveData) {
  return JSON.stringify({ sections: data.sections, node_positions: data.node_positions, viewport: data.viewport, direction: data.direction, edge_mode: data.edge_mode });
}

function writeData(data: ErdPerspectiveData) {
  return { direction: data.direction, edgeMode: data.edge_mode, data: persistenceData(data), viewportX: data.viewport.x, viewportY: data.viewport.y, viewportZoom: data.viewport.zoom };
}

export async function listPerspectives(uid: string, userId: string) {
  const diagram = await ownedDiagram(uid, userId);
  if (!diagram) return null;
  const valid = await (prisma as any).entity.findMany({ where: { diagramId: diagram.id }, select: { id: true } });
  const rows = await (prisma as any).diagramPerspective.findMany({ where: { diagramId: diagram.id }, orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }] });
  return rows.map((row: any) => serializable(row, valid.map((node: any) => node.id)));
}

export async function getPerspective(uid: string, perspectiveId: string, userId: string) {
  const diagram = await ownedDiagram(uid, userId);
  if (!diagram) return null;
  const [valid, row] = await Promise.all([
    (prisma as any).entity.findMany({ where: { diagramId: diagram.id }, select: { id: true } }),
    (prisma as any).diagramPerspective.findFirst({ where: { id: perspectiveId, diagramId: diagram.id } }),
  ]);
  return row ? serializable(row, valid.map((node: any) => node.id)) : null;
}

export async function createPerspective(uid: string, userId: string, input: PerspectiveInput) {
  const diagram = await ownedDiagram(uid, userId, true);
  if (!diagram) return null;
  const data = dataFromInput(input, undefined, diagram.entities.map((entity: any) => entity.id));
  await assertNodes(diagram.id, data);
  const layout = layoutForDiagram(diagram, data);
  const row = await (prisma as any).diagramPerspective.create({ data: {
    id: randomUUID(), diagramId: diagram.id, name: input.name.trim(), description: input.description?.trim() || null,
    ...writeData(layout),
  } });
  return serializable(row, diagram.entities.map((entity: any) => entity.id));
}

export async function updatePerspective(uid: string, perspectiveId: string, userId: string, patch: PerspectivePatch, autoLayout = false) {
  const diagram = await ownedDiagram(uid, userId, true);
  if (!diagram) return null;
  const row = await (prisma as any).diagramPerspective.findFirst({ where: { id: perspectiveId, diagramId: diagram.id } });
  if (!row) return null;
  const current = parseData(row, diagram.entities.map((entity: any) => entity.id));
  const data = dataFromInput(patch as PerspectiveInput, current, diagram.entities.map((entity: any) => entity.id));
  await assertNodes(diagram.id, data);
  const savedData = autoLayout ? layoutForDiagram(diagram, data) : data;
  const update: any = { ...writeData(savedData) };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  const updated = await (prisma as any).diagramPerspective.update({ where: { id: perspectiveId }, data: update });
  return serializable(updated, diagram.entities.map((entity: any) => entity.id));
}

export async function deletePerspective(uid: string, perspectiveId: string, userId: string) {
  const diagram = await ownedDiagram(uid, userId);
  if (!diagram) return null;
  const result = await (prisma as any).diagramPerspective.deleteMany({ where: { id: perspectiveId, diagramId: diagram.id } });
  return result.count ? { success: true } : null;
}

export async function previewPerspectiveLayout(uid: string, userId: string, perspectiveId?: string, draft?: PerspectiveInput) {
  const diagram = await ownedDiagram(uid, userId, true);
  if (!diagram) return null;
  let current: ErdPerspectiveData | undefined;
  if (perspectiveId) {
    const row = await (prisma as any).diagramPerspective.findFirst({ where: { id: perspectiveId, diagramId: diagram.id } });
    if (!row) return null;
    current = parseData(row, diagram.entities.map((entity: any) => entity.id));
  }
  const data = dataFromInput(draft || ({ name: '' } as PerspectiveInput), current, diagram.entities.map((entity: any) => entity.id));
  await assertNodes(diagram.id, data);
  return { diagram_uid: diagram.uid, diagram_name: diagram.name, perspective_id: perspectiveId || null, ...layoutForDiagram(diagram, data) };
}

function actionFromOperation(diagram: any, operation: any, existing: any[]) {
  const op = operation?.op;
  if (!['create', 'update', 'delete', 'auto_layout'].includes(op)) throw new Error('Perspective operation is invalid');
  const ids = diagram.entities.map((entity: any) => entity.id);
  const find = () => existing.find(row => row.id === operation.perspective_id);
  if (op === 'create') {
    if (!operation.perspective?.name?.trim()) throw new Error('Perspective name is required');
    const data = layoutForDiagram(diagram, dataFromInput(operation.perspective, undefined, ids));
    return { op, id: randomUUID(), input: operation.perspective, data };
  }
  const row = find();
  if (!row) throw new Error('Perspective was not found');
  const current = parseData(row, ids);
  if (op === 'delete') return { op, id: row.id, name: row.name };
  const input = op === 'auto_layout' ? (operation.changes || {}) : (operation.changes || {});
  const next = dataFromInput(input, current, ids);
  const data = op === 'auto_layout' ? layoutForDiagram(diagram, next) : next;
  return { op, id: row.id, input, data, name: input.name?.trim() || row.name, description: input.description !== undefined ? input.description?.trim() || null : row.description };
}

export async function proposePerspectiveChange(userId: string, uid: string, operation: any) {
  const diagram = await ownedDiagram(uid, userId, true);
  if (!diagram) throw new Error('Diagram not found');
  const existing = await (prisma as any).diagramPerspective.findMany({ where: { diagramId: diagram.id } });
  const action = actionFromOperation(diagram, operation, existing);
  await assertNodes(diagram.id, action.data || normalizePerspectiveData({}));
  const id = randomUUID();
  const preview = {
    operation: 'erd_perspective', action: action.op, diagram_uid: diagram.uid, diagram_name: diagram.name,
    expected_version: Number(diagram.version || 0), perspective_id: action.id,
    perspective_name: action.name || action.input?.name || action.id,
    sections: action.data?.sections?.map((section: any) => ({ name: section.name, tables: section.node_ids.length, color: section.color })) || [],
    unassigned_tables: (action.data as any)?.unassigned_node_ids?.length || 0,
    requires_explicit_confirmation: true,
  };
  proposals.set(id, { id, userId, uid: diagram.uid, expectedVersion: Number(diagram.version || 0), expectedUpdatedAt: diagram.updatedAt ? new Date(diagram.updatedAt).toISOString() : null, action, preview, expiresAt: Date.now() + PROPOSAL_TTL_MS });
  return { proposal_id: id, confirmation: id, expires_at: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(), ...preview };
}

export async function applyPerspectiveProposal(userId: string, proposalId: string, confirmation: string) {
  const proposal = proposals.get(proposalId);
  if (!proposal || proposal.userId !== userId || proposal.expiresAt < Date.now()) { proposals.delete(proposalId); throw new Error('Perspective proposal is missing or expired; create a new proposal'); }
  if (proposalId !== confirmation) throw new Error('Confirmation must exactly match proposal_id');
  const diagram = await ownedDiagram(proposal.uid, userId, true);
  if (!diagram || Number(diagram.version || 0) !== proposal.expectedVersion || (diagram.updatedAt ? new Date(diagram.updatedAt).toISOString() : null) !== proposal.expectedUpdatedAt) throw new Error('Conflict: diagram changed after this perspective proposal was created');
  const action = proposal.action;
  let result: any;
  if (action.op === 'create') {
    const row = await (prisma as any).diagramPerspective.create({ data: { id: action.id, diagramId: diagram.id, name: action.input.name.trim(), description: action.input.description?.trim() || null, ...writeData(action.data) } });
    result = serializable(row, diagram.entities.map((entity: any) => entity.id));
  } else if (action.op === 'delete') {
    await (prisma as any).diagramPerspective.deleteMany({ where: { id: action.id, diagramId: diagram.id } });
    result = { id: action.id, deleted: true };
  } else {
    const update: any = { ...writeData(action.data) };
    if (action.input?.name !== undefined) update.name = action.input.name.trim();
    if (action.input?.description !== undefined) update.description = action.input.description?.trim() || null;
    const row = await (prisma as any).diagramPerspective.update({ where: { id: action.id }, data: update });
    result = serializable(row, diagram.entities.map((entity: any) => entity.id));
  }
  proposals.delete(proposalId);
  return { status: 'applied', proposal_id: proposalId, diagram_uid: proposal.uid, action: action.op, result };
}

export function cleanupPerspectiveProposals() {
  for (const [id, proposal] of proposals) if (proposal.expiresAt < Date.now()) proposals.delete(id);
}
