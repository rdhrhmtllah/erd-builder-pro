import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { readPublicDocument } from "./public-service.js";
import {
  projectSiblings,
  projectSummary,
  workspaceProjects,
  workspaceRecent,
  workspaceSearch,
  workspaceBackups,
} from "./workspace-read-service.js";
import {
  proposeWorkspaceMutation,
  applyWorkspaceMutation,
  WORKSPACE_WRITE_OPERATIONS,
} from "./workspace-write-service.js";
import { PUBLIC_MCP_DOCUMENT_TYPES } from "./public-service.js";
import {
  applyHistoryRestore,
  proposeHistoryRestore,
} from "./service.js";
import {
  applyErdPatchProposal,
  analyzeGranularErdImpact,
  ERD_PATCH_OPERATIONS,
  proposeErdPatch,
  proposeErdDictionaryUpdate,
  readGranularErdDictionary,
  readGranularErd,
} from "./erd-granular-service.js";
import { ERD_IMPACT_OPERATIONS } from "../../shared/erd-impact.js";
import {
  applyPerspectiveProposal,
  getPerspective,
  listPerspectives,
  previewPerspectiveLayout,
  proposePerspectiveChange,
} from "../routes/diagrams/perspective-service.js";
import {
  applySubjectAreaProposal,
  getSubjectArea,
  listSubjectAreas,
  proposeSubjectAreaChange,
} from "../routes/diagrams/subject-area-service.js";

const documentType = z.enum(PUBLIC_MCP_DOCUMENT_TYPES);
const operation = z.enum(WORKSPACE_WRITE_OPERATIONS);
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const destructiveWrite = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const;
const jsonResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>,
});

const mutationFields = {
  operation,
  type: documentType.optional(),
  uid: z.string().min(1).max(100).optional(),
  project_uid: z.string().min(1).max(100).nullable().optional(),
  name: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(1_000_000).optional(),
  data: z.unknown().optional(),
  entities: z.array(z.unknown()).max(2_000).optional(),
  relationships: z.array(z.unknown()).max(2_000).optional(),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }).optional(),
  expected_version: z.number().int().min(0).optional(),
  dbml_source: z.string().max(1_000_000).optional(),
  is_public: z.boolean().optional(),
  share_token: z.string().max(500).nullable().optional(),
  expiry_date: z.string().max(100).nullable().optional(),
};

const erdPatchOperation = z.object({
  op: z.enum(ERD_PATCH_OPERATIONS),
  table_id: z.string().min(1).max(160).optional(),
  column_id: z.string().min(1).max(160).optional(),
  relationship_id: z.string().min(1).max(160).optional(),
  index_id: z.string().min(1).max(160).optional(),
  constraint_id: z.string().min(1).max(160).optional(),
  table: z.object({}).catchall(z.unknown()).optional(),
  column: z.object({}).catchall(z.unknown()).optional(),
  relationship: z.object({}).catchall(z.unknown()).optional(),
  index: z.object({}).catchall(z.unknown()).optional(),
  constraint: z.object({}).catchall(z.unknown()).optional(),
  changes: z.object({}).catchall(z.unknown()).optional(),
});

export function registerWorkspaceReadTools(server: McpServer, userId: string) {
  server.registerTool("workspace_projects", {
    description: "List the authenticated user's active projects and uncategorized documents.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0), query: z.string().max(200).optional() },
    annotations: readOnly,
  }, async ({ limit, offset, query }) => jsonResult(await workspaceProjects(userId, { limit, offset, q: query })));

  server.registerTool("workspace_search", {
    description: "Search the authenticated user's projects, notes, flowcharts, drawings, and regular ERD diagrams by title/name.",
    inputSchema: { query: z.string().min(1).max(200) }, annotations: readOnly,
  }, async ({ query }) => jsonResult(await workspaceSearch(userId, query)));

  server.registerTool("workspace_recent", {
    description: "List the authenticated user's most recently updated workspace documents.",
    annotations: readOnly,
  }, async () => jsonResult(await workspaceRecent(userId)));

  server.registerTool("project_summary", {
    description: "Return document counts for one active project, identified by UUID or numeric ID.",
    inputSchema: { project_uid: z.string().min(1).max(100) }, annotations: readOnly,
  }, async ({ project_uid }) => jsonResult(await projectSummary(userId, project_uid)));

  server.registerTool("project_siblings", {
    description: "Read the active documents belonging to one project for cross-document context.",
    inputSchema: { project_uid: z.string().min(1).max(100) }, annotations: readOnly,
  }, async ({ project_uid }) => jsonResult(await projectSiblings(userId, project_uid)));

  server.registerTool("document_read_full", {
    description: "Read the current full snapshot of one active Note, Flowchart, Drawing, or regular ERD diagram.",
    inputSchema: { type: documentType, uid: z.string().min(1).max(100) }, annotations: readOnly,
  }, async ({ type, uid }) => jsonResult(await readPublicDocument(userId, type, uid)));

  server.registerTool("erd_schema_read", {
    description: "Read one regular ERD as a normalized, agent-friendly schema. Optionally return one table and only its connected relationships.",
    inputSchema: { uid: z.string().min(1).max(100), table_id: z.string().min(1).max(160).optional() }, annotations: readOnly,
  }, async ({ uid, table_id }) => jsonResult(await readGranularErd(userId, uid, table_id)));

  server.registerTool("erd_dictionary_read", {
    description: "Read ERD business metadata and governance coverage. JSON includes normalized tables and gaps; Markdown/CSV return export-ready data dictionary content. Read-only.",
    inputSchema: { uid: z.string().min(1).max(100), format: z.enum(['json', 'markdown', 'csv']).default('json') }, annotations: readOnly,
  }, async ({ uid, format }) => jsonResult(await readGranularErdDictionary(userId, uid, format)));

  server.registerTool("erd_subject_area_list", {
    description: "List saved ERD Subject Areas: named module filters with table membership, color, and viewport. Read-only.",
    inputSchema: { uid: z.string().min(1).max(100) }, annotations: readOnly,
  }, async ({ uid }) => jsonResult(await listSubjectAreas(uid, userId)));

  server.registerTool("erd_subject_area_read", {
    description: "Read one ERD Subject Area including its table IDs, color, and viewport. Read-only.",
    inputSchema: { uid: z.string().min(1).max(100), area_id: z.string().uuid() }, annotations: readOnly,
  }, async ({ uid, area_id }) => jsonResult(await getSubjectArea(uid, area_id, userId)));

  server.registerTool("erd_perspective_list", {
    description: "List saved visual ERD perspectives. Perspectives are non-destructive saved views with colored sections, local table positions, viewport, and edge filtering.",
    inputSchema: { uid: z.string().min(1).max(100) }, annotations: readOnly,
  }, async ({ uid }) => jsonResult(await listPerspectives(uid, userId)));

  server.registerTool("erd_perspective_read", {
    description: "Read one saved ERD perspective, including sections, section colors, table membership, local positions, and edge display mode. Read-only.",
    inputSchema: { uid: z.string().min(1).max(100), perspective_id: z.string().uuid() }, annotations: readOnly,
  }, async ({ uid, perspective_id }) => jsonResult(await getPerspective(uid, perspective_id, userId)));

  server.registerTool("erd_perspective_auto_layout", {
    description: "Preview a section-aware two-level layout for an existing perspective or draft sections. It never saves; use erd_perspective_propose with op auto_layout or create/update then apply after confirmation.",
    inputSchema: {
      uid: z.string().min(1).max(100), perspective_id: z.string().uuid().optional(),
      draft: z.object({ sections: z.array(z.object({}).catchall(z.unknown())).max(40).optional(), direction: z.enum(['left-to-right', 'top-to-bottom']).optional(), edge_mode: z.enum(['all', 'internal', 'cross-section']).optional() }).catchall(z.unknown()).optional(),
    }, annotations: readOnly,
  }, async ({ uid, perspective_id, draft }) => jsonResult(await previewPerspectiveLayout(uid, userId, perspective_id, draft as any)));

  server.registerTool("erd_impact_analyze", {
    description: "Simulate the dependency blast radius and migration risk of deleting, renaming, or changing a table/column. Read-only; use before proposing risky ERD patches.",
    inputSchema: {
      uid: z.string().min(1).max(100),
      operation: z.enum(ERD_IMPACT_OPERATIONS),
      table_id: z.string().min(1).max(160),
      column_id: z.string().min(1).max(160).optional(),
    },
    annotations: readOnly,
  }, async ({ uid, operation: selectedOperation, table_id, column_id }) => jsonResult(
    await analyzeGranularErdImpact(userId, uid, selectedOperation, table_id, column_id),
  ));

  server.registerTool("backup_list", {
    description: "List this user's backup metadata and statuses. Backup file contents are never returned through MCP.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) }, annotations: readOnly,
  }, async ({ limit, offset }) => jsonResult(await workspaceBackups(userId, limit, offset)));

  server.registerTool("history_restore_propose", {
    description: "Prepare a restore of one saved Note, Flowchart, Drawing, or regular ERD revision. This does not modify data; review the preview before applying.",
    inputSchema: { type: documentType, uid: z.string().min(1).max(100), revision_id: z.string().min(1).max(100) },
    annotations: write,
  }, async ({ type, uid, revision_id }) => jsonResult(await proposeHistoryRestore(userId, type, uid, revision_id)));

  server.registerTool("history_restore_apply", {
    description: "Apply a previously proposed history restore. Requires the exact proposal ID as confirmation, rejects stale documents, and creates a pre-restore safety revision.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() },
    annotations: destructiveWrite,
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyHistoryRestore(userId, proposal_id, confirmation)));
}

export function registerWorkspaceWriteTools(server: McpServer, userId: string) {
  server.registerTool("erd_subject_area_propose", {
    description: "Prepare a Subject Area create/update/delete without writing. An agent should read erd_schema_read first, determine coherent business/module table groups, use only returned table IDs, then show the area preview and request confirmation. create requires area {name,color,node_ids,viewport_x?,viewport_y?,viewport_zoom?}; update requires area_id and changes; delete requires area_id.",
    inputSchema: { uid: z.string().min(1).max(100), operation: z.object({ op: z.enum(['create', 'update', 'delete']), area_id: z.string().uuid().optional(), area: z.object({}).catchall(z.unknown()).optional(), changes: z.object({}).catchall(z.unknown()).optional() }) }, annotations: write,
  }, async ({ uid, operation: subjectAreaOperation }) => jsonResult(await proposeSubjectAreaChange(userId, uid, subjectAreaOperation)));

  server.registerTool("erd_subject_area_apply", {
    description: "Apply exactly one confirmed Subject Area proposal. confirmation must equal proposal_id; stale diagrams and changed areas are rejected.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() }, annotations: destructiveWrite,
  }, async ({ proposal_id, confirmation }) => jsonResult(await applySubjectAreaProposal(userId, proposal_id, confirmation)));

  server.registerTool("erd_dictionary_propose", {
    description: "Prepare explicit Data Dictionary/governance updates for one or more tables or columns. Each update is {table_id,column_id?,governance}. governance supports business_name, description, domain, owner, steward, classification, lifecycle, review_status, retention, glossary_term, tags. This only updates documentation metadata; it never changes schema shape. Read erd_dictionary_read and erd_schema_read first, then show preview and request confirmation.",
    inputSchema: { uid: z.string().min(1).max(100), expected_version: z.number().int().min(0).optional(), updates: z.array(z.object({ table_id: z.string().min(1).max(160), column_id: z.string().min(1).max(160).nullable().optional(), governance: z.object({}).catchall(z.unknown()) })).min(1).max(500) }, annotations: write,
  }, async ({ uid, expected_version, updates }) => jsonResult(await proposeErdDictionaryUpdate(userId, uid, updates as any, expected_version)));

  server.registerTool("erd_dictionary_apply", {
    description: "Apply a confirmed Data Dictionary proposal. confirmation must exactly equal proposal_id; stale diagrams are rejected.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() }, annotations: destructiveWrite,
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyErdPatchProposal(userId, proposal_id, confirmation)));

  server.registerTool("erd_perspective_propose", {
    description: "Prepare a non-destructive ERD perspective mutation. Operations: create ({perspective}), update ({perspective_id, changes}), auto_layout ({perspective_id, changes?}), delete ({perspective_id}). A perspective only changes saved visual sections and local layout, never schema tables, columns, or relationships. Show preview and obtain explicit confirmation before apply.",
    inputSchema: { uid: z.string().min(1).max(100), operation: z.object({ op: z.enum(['create', 'update', 'auto_layout', 'delete']), perspective_id: z.string().uuid().optional(), perspective: z.object({}).catchall(z.unknown()).optional(), changes: z.object({}).catchall(z.unknown()).optional() }) }, annotations: write,
  }, async ({ uid, operation: perspectiveOperation }) => jsonResult(await proposePerspectiveChange(userId, uid, perspectiveOperation)));

  server.registerTool("erd_perspective_apply", {
    description: "Apply exactly one confirmed ERD perspective proposal. confirmation must equal proposal_id; stale diagrams and expired proposals are rejected.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() }, annotations: destructiveWrite,
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyPerspectiveProposal(userId, proposal_id, confirmation)));

  server.registerTool("erd_patch_propose", {
    description: "Prepare granular ERD changes without resending or overwriting the full diagram. Supports add/update/delete for tables, columns, indexes, constraints, and relationships; table_update and column_update also accept governance metadata. IDs for new objects are generated by the server. Returns an exact preview plus ordered PostgreSQL/MySQL forward and rollback SQL; never writes data, so show the preview and obtain explicit confirmation before applying.",
    inputSchema: {
      uid: z.string().min(1).max(100),
      expected_version: z.number().int().min(0).optional(),
      operations: z.array(erdPatchOperation).min(1).max(100),
    },
    annotations: write,
  }, async ({ uid, operations, expected_version }) => jsonResult(await proposeErdPatch(userId, uid, operations as any, expected_version)));

  server.registerTool("erd_patch_apply", {
    description: "Apply exactly one confirmed granular ERD patch. confirmation must equal proposal_id; stale diagrams, expired proposals, foreign users, invalid references, duplicate names, and duplicate relationships are rejected.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() },
    annotations: destructiveWrite,
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyErdPatchProposal(userId, proposal_id, confirmation)));

  server.registerTool("workspace_write_propose", {
    description: "Prepare a workspace mutation and return a preview. This never changes data. Supported operations: project create/update/soft delete/restore/permanent delete; document create/update/diagram_save/soft delete/restore/permanent delete/share update; backup create. Always inspect the preview and ask the user for explicit confirmation before calling workspace_write_apply.",
    inputSchema: z.object(mutationFields),
    annotations: write,
  }, async (input) => {
    const { operation: selectedOperation, ...payload } = input;
    const result = await proposeWorkspaceMutation(userId, selectedOperation, payload as Record<string, unknown>);
    return jsonResult(result);
  });

  server.registerTool("workspace_write_apply", {
    description: "Apply exactly one previously proposed workspace mutation. confirmation must exactly equal proposal_id. The proposal is user-scoped, expires after 10 minutes, and is removed after success.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() },
    annotations: destructiveWrite,
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyWorkspaceMutation(userId, proposal_id, confirmation)));
}

export function registerWorkspaceMcpTools(server: McpServer, userId: string, canWrite: boolean) {
  registerWorkspaceReadTools(server, userId);
  if (canWrite) registerWorkspaceWriteTools(server, userId);
}
