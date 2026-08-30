import { randomUUID } from "node:crypto";
import { readOwnedEntity } from "../routes/entity-changes/service.js";
import { resolveWorkspaceProject, type WorkspaceDocumentType } from "./workspace-read-service.js";

export const WORKSPACE_WRITE_OPERATIONS = [
  "project_create",
  "project_update",
  "project_soft_delete",
  "project_restore",
  "project_permanent_delete",
  "document_create",
  "document_update",
  "diagram_save",
  "document_soft_delete",
  "document_restore",
  "document_permanent_delete",
  "document_share_update",
  "backup_create",
] as const;
export type WorkspaceWriteOperation = (typeof WORKSPACE_WRITE_OPERATIONS)[number];
export type MutationPayload = Record<string, unknown>;

export type WorkspaceMutationProposal = {
  id: string;
  userId: string;
  operation: WorkspaceWriteOperation;
  payload: MutationPayload;
  expectedUpdatedAt: string | null;
  expectedVersion?: number;
  preview: Record<string, unknown>;
  expiresAt: number;
};

export const PROPOSAL_TTL_MS = 10 * 60 * 1000;
const MAX_TEXT_LENGTH = 1_000_000;
const MAX_DIAGRAM_ROWS = 2_000;

export function serialize(value: unknown): any {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

export function requiredString(payload: MutationPayload, field: string, max = 200) {
  const value = payload[field];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${field} is required and must be at most ${max} characters`);
  }
  return value.trim();
}

export function optionalString(payload: MutationPayload, field: string, max = MAX_TEXT_LENGTH) {
  const value = payload[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > max) throw new Error(`${field} must be a string of at most ${max} characters`);
  return value;
}

export function optionalBoolean(payload: MutationPayload, field: string) {
  const value = payload[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

export function jsonText(value: unknown, field: string, fallback: string) {
  if (value === undefined || value === null) return fallback;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`${field} is too large`);
  try { JSON.parse(text); } catch { throw new Error(`${field} must contain valid JSON`); }
  return text;
}

function jsonSize(value: unknown, field: string) {
  const size = JSON.stringify(value ?? null).length;
  if (size > 900_000) throw new Error(`${field} is too large for MCP (maximum 900 KB)`);
}

export function diagramPayload(payload: MutationPayload) {
  const entities = payload.entities === undefined ? [] : payload.entities;
  const relationships = payload.relationships === undefined ? [] : payload.relationships;
  if (payload.data && typeof payload.data === "object" && (payload.data as any)._type === "production_db_positions") {
    throw new Error("Production database diagrams are not writable through public MCP");
  }
  if (!Array.isArray(entities) || !Array.isArray(relationships)) throw new Error("entities and relationships must be arrays");
  if (entities.length > MAX_DIAGRAM_ROWS || relationships.length > MAX_DIAGRAM_ROWS) throw new Error("Diagram contains too many entities or relationships");
  jsonSize({ entities, relationships, data: payload.data }, "Diagram payload");
  for (const entity of entities) {
    if (!entity || typeof entity !== "object" || typeof (entity as any).id !== "string" || typeof (entity as any).name !== "string") {
      throw new Error("Each entity must have a string id and name");
    }
    if (Array.isArray((entity as any).columns) && (entity as any).columns.length > MAX_DIAGRAM_ROWS) throw new Error("Entity contains too many columns");
  }
  return {
    entities,
    relationships,
    viewport: payload.viewport,
    data: payload.data,
    dbmlSource: payload.dbml_source ?? payload.dbmlSource,
  };
}

export function documentType(payload: MutationPayload): WorkspaceDocumentType {
  const type = payload.type;
  if (type !== "notes" && type !== "flowcharts" && type !== "drawings" && type !== "diagrams") throw new Error("type must be notes, flowcharts, drawings, or diagrams");
  return type;
}

export function documentUid(payload: MutationPayload) {
  return requiredString(payload, "uid", 100);
}

export async function currentDocument(userId: string, type: WorkspaceDocumentType, uid: string) {
  const current = await readOwnedEntity(type, uid, userId);
  if (!current) throw new Error("Document not found");
  return current;
}

export async function currentProject(userId: string, identifier: string, includeDeleted = false) {
  return resolveWorkspaceProject(userId, identifier, includeDeleted);
}

export async function assertExpectedUpdatedAt(proposal: WorkspaceMutationProposal) {
  if (!proposal.expectedUpdatedAt || proposal.operation === "project_create" || proposal.operation === "backup_create") return;
  const payload = proposal.payload;
  if (proposal.operation.startsWith("project_")) {
    const project = await currentProject(proposal.userId, requiredString(payload, "project_uid", 100), true);
    const actual = project.updatedAt ? new Date(project.updatedAt).toISOString() : null;
    if (actual !== proposal.expectedUpdatedAt) throw new Error("Conflict: project changed after this proposal was created");
    return;
  }
  if (proposal.operation === "document_create") return;
  const current = await currentDocument(proposal.userId, documentType(payload), documentUid(payload));
  if (current.updatedAt !== proposal.expectedUpdatedAt) throw new Error("Conflict: document changed after this proposal was created");
}

export async function ownedDocument(userId: string, type: WorkspaceDocumentType, uid: string, includeDeleted = false) {
  const current = await currentDocument(userId, type, uid);
  if (!includeDeleted && (current.entity as any).isDeleted) throw new Error("Document is deleted; restore it before editing");
  if (type === "diagrams" && (current.entity as any).sourceType === "production_db") throw new Error("Production database diagrams are not writable through public MCP");
  return current;
}

export function previewFor(operation: WorkspaceWriteOperation, payload: MutationPayload, expectedUpdatedAt: string | null) {
  const type = typeof payload.type === "string" ? payload.type : undefined;
  const uid = typeof payload.uid === "string" ? payload.uid : undefined;
  const projectUid = typeof payload.project_uid === "string" ? payload.project_uid : undefined;
  const destructive = operation.includes("permanent_delete") || operation.includes("soft_delete") || operation === "project_restore" || operation === "document_restore";
  const preview: Record<string, unknown> = {
    operation, type, uid, project_uid: projectUid,
    expected_updated_at: expectedUpdatedAt,
    requires_explicit_confirmation: true,
    destructive,
  };
  if (typeof payload.name === "string") preview.name = payload.name;
  if (typeof payload.title === "string") preview.title = payload.title;
  if (typeof payload.content === "string") preview.content_preview = payload.content.slice(0, 500);
  if (Array.isArray(payload.entities)) preview.entity_count = payload.entities.length;
  if (Array.isArray(payload.relationships)) preview.relationship_count = payload.relationships.length;
  if (typeof payload.is_public === "boolean") preview.is_public = payload.is_public;
  return preview;
}

export async function validateProposalInput(userId: string, operation: WorkspaceWriteOperation, payload: MutationPayload) {
  let expectedUpdatedAt: string | null = null;
  let expectedVersion: number | undefined;
  if (operation === "backup_create") {
    requiredString(payload, "name");
  } else if (operation === "project_create") {
    requiredString(payload, "name");
  } else if (operation.startsWith("project_")) {
    const projectUid = requiredString(payload, "project_uid", 100);
    const project = await currentProject(userId, projectUid, true);
    expectedUpdatedAt = project.updatedAt ? new Date(project.updatedAt).toISOString() : null;
    if (operation === "project_update") requiredString(payload, "name");
  } else if (operation === "document_create") {
    const type = documentType(payload);
    requiredString(payload, type === "diagrams" ? "name" : "title");
    if (payload.project_uid !== undefined) await currentProject(userId, requiredString(payload, "project_uid", 100));
    if (type === "diagrams") diagramPayload(payload);
    if (type === "flowcharts" || type === "drawings") jsonText(payload.data, "data", type === "flowcharts" ? '{"nodes":[],"edges":[]}' : "[]");
    if (type === "notes" && payload.content !== undefined) optionalString(payload, "content");
  } else {
    const type = documentType(payload);
    const uid = documentUid(payload);
    const current = await ownedDocument(userId, type, uid, operation === "document_restore" || operation === "document_permanent_delete");
    expectedUpdatedAt = current.updatedAt;
    if (operation === "document_update") {
      if (type === "diagrams") {
        if (payload.name !== undefined) requiredString(payload, "name");
      } else if (payload.title !== undefined) requiredString(payload, "title");
      if (payload.project_uid !== undefined && payload.project_uid !== null) await currentProject(userId, requiredString(payload, "project_uid", 100));
      if (type === "notes" && payload.content !== undefined) optionalString(payload, "content");
      if ((type === "flowcharts" || type === "drawings") && payload.data !== undefined) jsonText(payload.data, "data", "");
    } else if (operation === "diagram_save") {
      if (type !== "diagrams") throw new Error("diagram_save requires type=diagrams");
      diagramPayload(payload);
      const providedVersion = payload.expected_version;
      if (providedVersion !== undefined && (!Number.isInteger(providedVersion) || Number(providedVersion) < 0)) throw new Error("expected_version must be a non-negative integer");
      expectedVersion = Number.isInteger(providedVersion) ? Number(providedVersion) : Number((current.entity as any).version ?? 0);
    } else if (operation === "document_share_update") {
      const isPublic = optionalBoolean(payload, "is_public");
      if (isPublic === undefined) throw new Error("is_public is required");
      const expiry = optionalString(payload, "expiry_date", 100);
      if (expiry && Number.isNaN(new Date(expiry).getTime())) throw new Error("expiry_date must be a valid ISO date");
    }
  }
  return { expectedUpdatedAt, expectedVersion };
}

export function newProposal(
  userId: string,
  operation: WorkspaceWriteOperation,
  payload: MutationPayload,
  expectedUpdatedAt: string | null,
  expectedVersion?: number,
) {
  const id = randomUUID();
  return {
    id, userId, operation, payload, expectedUpdatedAt,
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
    preview: previewFor(operation, payload, expectedUpdatedAt),
    expiresAt: Date.now() + PROPOSAL_TTL_MS,
  } satisfies WorkspaceMutationProposal;
}
