import { randomUUID } from "node:crypto";
import { suggestErdOrganizations } from "../../shared/erd-organizer.js";
import { readGranularErd } from "./erd-granular-service.js";
import { createSubjectArea } from "../routes/diagrams/subject-area-service.js";

/**
 * Organize an ERD into Subject Areas from MCP, using the same grouping the
 * Organize panel shows. Suggestions are read-only; turning them into saved
 * Areas goes through the propose → confirm → apply flow every other write tool
 * uses, so an agent can never reshape a diagram in a single unreviewed call.
 */

const PROPOSAL_TTL_MS = 10 * 60_000;
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

type OrganizeGroup = { name: string; color: string; node_ids: string[] };

type OrganizeProposal = {
  id: string;
  userId: string;
  uid: string;
  expectedUpdatedAt: string | null;
  groups: OrganizeGroup[];
  preview: Record<string, unknown>;
  expiresAt: number;
};

const proposals = new Map<string, OrganizeProposal>();

function tablesAndRelationships(snapshot: any) {
  return {
    tables: (snapshot.entities || []).map((entity: any) => ({ ...entity, id: String(entity.id) })),
    relationships: (snapshot.relationships || []).map((relationship: any) => ({
      source: String(relationship.source_entity_id),
      target: String(relationship.target_entity_id),
    })),
  };
}

export async function analyzeErdOrganization(userId: string, uid: string) {
  const snapshot: any = await readGranularErd(userId, uid);
  const { tables, relationships } = tablesAndRelationships(snapshot);
  const suggestions = suggestErdOrganizations(tables, relationships);
  return {
    diagram_uid: snapshot.uid,
    diagram_name: snapshot.name,
    table_count: tables.length,
    relationship_count: relationships.length,
    suggestions,
    note: "Read-only. Show these groups to the user, then call erd_organize_propose with the ones they approve.",
  };
}

/** Reject anything the canvas itself would refuse, before a proposal is stored. */
function normalizeGroups(input: unknown, knownTableIds: Set<string>): OrganizeGroup[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 40) {
    throw new Error("groups must contain between 1 and 40 Subject Areas");
  }

  const claimed = new Map<string, string>();
  return input.map((raw: any, index: number) => {
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    if (!name || name.length > 80) throw new Error(`groups[${index}].name is required and must be at most 80 characters`);

    const color = typeof raw?.color === "string" && COLOR_PATTERN.test(raw.color)
      ? raw.color.toLowerCase()
      : COLORS[index % COLORS.length];

    const ids: string[] = Array.isArray(raw?.node_ids)
      ? [...new Set(raw.node_ids.map((id: unknown) => String(id ?? "").trim()).filter(Boolean))] as string[]
      : [];
    if (ids.length < 1 || ids.length > 1000) throw new Error(`groups[${index}].node_ids must contain between 1 and 1000 table IDs`);

    for (const id of ids) {
      if (!knownTableIds.has(id)) throw new Error(`groups[${index}] references a table that is not in this diagram: ${id}`);
      const owner = claimed.get(id);
      if (owner) throw new Error(`Table ${id} appears in both "${owner}" and "${name}"; each table belongs to one Subject Area`);
      claimed.set(id, name);
    }

    return { name, color, node_ids: ids };
  });
}

export async function proposeErdOrganization(userId: string, uid: string, groups: unknown) {
  const snapshot: any = await readGranularErd(userId, uid);
  const { tables } = tablesAndRelationships(snapshot);
  const known = new Set<string>(tables.map((table: any) => table.id));
  const normalized = normalizeGroups(groups, known);

  const assigned = new Set(normalized.flatMap(group => group.node_ids));
  const proposalId = randomUUID();
  const preview = {
    operation: "erd_organize",
    diagram_uid: snapshot.uid,
    diagram_name: snapshot.name,
    area_count: normalized.length,
    tables_assigned: assigned.size,
    tables_left_alone: tables.length - assigned.size,
    groups: normalized.map(group => ({ name: group.name, color: group.color, table_count: group.node_ids.length, table_ids: group.node_ids })),
    creates_only: "New Subject Areas. Existing tables, columns and relationships are never modified.",
    requires_explicit_confirmation: true,
  };

  proposals.set(proposalId, {
    id: proposalId,
    userId,
    uid: String(snapshot.uid),
    expectedUpdatedAt: snapshot.updatedAt ?? null,
    groups: normalized,
    preview,
    expiresAt: Date.now() + PROPOSAL_TTL_MS,
  });

  return { proposal_id: proposalId, confirmation: proposalId, expires_at: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(), ...preview };
}

export async function applyErdOrganizationProposal(userId: string, proposalId: string, confirmation: string) {
  const proposal = proposals.get(proposalId);
  if (!proposal || proposal.userId !== userId || proposal.expiresAt < Date.now()) {
    proposals.delete(proposalId);
    throw new Error("Organize proposal is missing or expired; create a new proposal");
  }
  if (proposal.id !== confirmation) throw new Error("Confirmation must exactly match proposal_id");

  const snapshot: any = await readGranularErd(userId, proposal.uid);
  if ((snapshot.updatedAt ?? null) !== proposal.expectedUpdatedAt) {
    throw new Error("Conflict: diagram changed after this proposal was created");
  }

  // Re-check every table up front so the loop below cannot stop half way
  // through because of a table that disappeared while the proposal sat open.
  const known = new Set<string>(tablesAndRelationships(snapshot).tables.map((table: any) => table.id));
  for (const group of proposal.groups) {
    for (const id of group.node_ids) {
      if (!known.has(id)) throw new Error(`Table ${id} is no longer in this diagram; create a new proposal`);
    }
  }

  const created: Array<{ id: string; name: string; table_count: number }> = [];
  for (const group of proposal.groups) {
    const area: any = await createSubjectArea(proposal.uid, userId, {
      name: group.name,
      color: group.color,
      node_ids: group.node_ids,
      parent_id: null,
      viewport_x: 0,
      viewport_y: 0,
      viewport_zoom: 1,
    });
    if (!area) throw new Error("Diagram was not found while creating Subject Areas");
    created.push({ id: area.id, name: area.name, table_count: group.node_ids.length });
  }

  proposals.delete(proposalId);
  return { status: "applied", proposal_id: proposalId, diagram_uid: proposal.uid, created_areas: created };
}

export function cleanupErdOrganizeProposals() {
  for (const [id, proposal] of proposals) if (proposal.expiresAt < Date.now()) proposals.delete(id);
}
