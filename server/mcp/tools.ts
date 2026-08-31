import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  MCP_DOCUMENT_TYPES,
  applyNoteAppend,
  historyList,
  historyRead,
  applyHistoryRestore,
  listDbCatalogs,
  listWorkspaceFiles,
  proposeNoteAppend,
  proposeHistoryRestore,
  readDbSchema,
  readDocument,
  resolveMcpUserId,
  runReadOnlyQuery,
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

const documentType = z.enum(MCP_DOCUMENT_TYPES);
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
const externalReadOnly = { readOnlyHint: true, openWorldHint: true } as const;
const jsonResult = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
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

export function registerTools(server: McpServer) {
  server.registerTool("workspace_list_files", {
    description: "List ERD Builder Pro projects, Notes, Flowcharts, and ERD diagrams owned by the local user. Drawings are intentionally excluded.",
    inputSchema: { project_uid: z.string().optional() }, annotations: readOnly,
  }, async ({ project_uid }) => jsonResult(await listWorkspaceFiles(await resolveMcpUserId(), project_uid)));

  server.registerTool("document_read", {
    description: "Read one local Note, Flowchart, Drawing, or ERD diagram by UUID or numeric ID.",
    inputSchema: { type: documentType, uid: z.string().min(1) }, annotations: readOnly,
  }, async ({ type, uid }) => jsonResult(await readDocument(await resolveMcpUserId(), type, uid)));

  server.registerTool("erd_schema_read", {
    description: "Read one regular ERD as a normalized schema, optionally limited to one table and its connected relationships.",
    inputSchema: { uid: z.string().min(1).max(100), table_id: z.string().min(1).max(160).optional() }, annotations: readOnly,
  }, async ({ uid, table_id }) => jsonResult(await readGranularErd(await resolveMcpUserId(), uid, table_id)));

  server.registerTool("erd_dictionary_read", {
    description: "Read ERD governance coverage and business metadata as normalized JSON or export-ready Markdown/CSV. This is read-only.",
    inputSchema: { uid: z.string().min(1).max(100), format: z.enum(['json', 'markdown', 'csv']).default('json') }, annotations: readOnly,
  }, async ({ uid, format }) => jsonResult(await readGranularErdDictionary(await resolveMcpUserId(), uid, format)));

  server.registerTool("erd_subject_area_list", {
    description: "List the nested Subject Area tree for an ERD. Each item includes parent_id, depth, direct node_ids, and effective_node_ids (the Area plus descendants). Read-only.",
    inputSchema: { uid: z.string().min(1).max(100) }, annotations: readOnly,
  }, async ({ uid }) => jsonResult(await listSubjectAreas(uid, await resolveMcpUserId())));

  server.registerTool("erd_subject_area_read", {
    description: "Read one saved Subject Area including its parent_id, depth, direct and effective descendant table IDs, color, and viewport.",
    inputSchema: { uid: z.string().min(1).max(100), area_id: z.string().uuid() }, annotations: readOnly,
  }, async ({ uid, area_id }) => jsonResult(await getSubjectArea(uid, area_id, await resolveMcpUserId())));

  server.registerTool("erd_subject_area_propose", {
    description: "Prepare a hierarchical Subject Area create, update, or delete. Read schema and the existing Area tree first, group tables by business responsibility and relation flow, then request confirmation before apply. create uses area {name,color,node_ids,viewport_x?,viewport_y?,viewport_zoom?,parent_id?}; update can set changes.parent_id to move an Area. Parent cycles and cross-diagram parents are rejected.",
    inputSchema: { uid: z.string().min(1).max(100), operation: z.object({ op: z.enum(['create', 'update', 'delete']), area_id: z.string().uuid().optional(), area: z.object({}).catchall(z.unknown()).optional(), changes: z.object({}).catchall(z.unknown()).optional() }) }, annotations: readOnly,
  }, async ({ uid, operation }) => jsonResult(await proposeSubjectAreaChange(await resolveMcpUserId(), uid, operation)));

  server.registerTool("erd_subject_area_apply", {
    description: "Apply a confirmed Subject Area proposal.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ proposal_id, confirmation }) => jsonResult(await applySubjectAreaProposal(await resolveMcpUserId(), proposal_id, confirmation)));

  server.registerTool("erd_dictionary_propose", {
    description: "Prepare explicit table/column Data Dictionary governance metadata updates. Does not change schema shape; request confirmation before apply.",
    inputSchema: { uid: z.string().min(1).max(100), expected_version: z.number().int().min(0).optional(), updates: z.array(z.object({ table_id: z.string().min(1).max(160), column_id: z.string().min(1).max(160).nullable().optional(), governance: z.object({}).catchall(z.unknown()) })).min(1).max(500) }, annotations: readOnly,
  }, async ({ uid, expected_version, updates }) => jsonResult(await proposeErdDictionaryUpdate(await resolveMcpUserId(), uid, updates as any, expected_version)));

  server.registerTool("erd_dictionary_apply", {
    description: "Apply one confirmed Data Dictionary proposal.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyErdPatchProposal(await resolveMcpUserId(), proposal_id, confirmation)));

  server.registerTool("erd_perspective_list", {
    description: "List saved non-destructive ERD perspectives with colored sections and local layouts.",
    inputSchema: { uid: z.string().min(1).max(100) }, annotations: readOnly,
  }, async ({ uid }) => jsonResult(await listPerspectives(uid, await resolveMcpUserId())));

  server.registerTool("erd_perspective_read", {
    description: "Read one ERD perspective and its section layout without changing the ERD schema.",
    inputSchema: { uid: z.string().min(1).max(100), perspective_id: z.string().uuid() }, annotations: readOnly,
  }, async ({ uid, perspective_id }) => jsonResult(await getPerspective(uid, perspective_id, await resolveMcpUserId())));

  server.registerTool("erd_perspective_auto_layout", {
    description: "Preview a section-aware layout for a saved perspective or draft section set. It does not write data.",
    inputSchema: { uid: z.string().min(1).max(100), perspective_id: z.string().uuid().optional(), draft: z.object({}).catchall(z.unknown()).optional() }, annotations: readOnly,
  }, async ({ uid, perspective_id, draft }) => jsonResult(await previewPerspectiveLayout(uid, await resolveMcpUserId(), perspective_id, draft as any)));

  server.registerTool("erd_perspective_propose", {
    description: "Prepare create, update, auto_layout, or delete for a non-destructive ERD perspective. Review the section/layout preview and request confirmation before applying.",
    inputSchema: { uid: z.string().min(1).max(100), operation: z.object({ op: z.enum(['create', 'update', 'auto_layout', 'delete']), perspective_id: z.string().uuid().optional(), perspective: z.object({}).catchall(z.unknown()).optional(), changes: z.object({}).catchall(z.unknown()).optional() }) }, annotations: readOnly,
  }, async ({ uid, operation }) => jsonResult(await proposePerspectiveChange(await resolveMcpUserId(), uid, operation)));

  server.registerTool("erd_perspective_apply", {
    description: "Apply one confirmed perspective proposal. confirmation must exactly match proposal_id.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyPerspectiveProposal(await resolveMcpUserId(), proposal_id, confirmation)));

  server.registerTool("erd_impact_analyze", {
    description: "Simulate the dependency blast radius and migration risk of deleting, renaming, or changing a table/column. This is read-only and should be used before risky patches.",
    inputSchema: {
      uid: z.string().min(1).max(100),
      operation: z.enum(ERD_IMPACT_OPERATIONS),
      table_id: z.string().min(1).max(160),
      column_id: z.string().min(1).max(160).optional(),
    }, annotations: readOnly,
  }, async ({ uid, operation, table_id, column_id }) => jsonResult(
    await analyzeGranularErdImpact(await resolveMcpUserId(), uid, operation, table_id, column_id),
  ));

  server.registerTool("erd_patch_propose", {
    description: "Prepare granular table, column, index, constraint, relationship, and governance metadata changes with a non-writing preview, breaking-change classification, and ordered PostgreSQL/MySQL forward and rollback SQL. New IDs are generated by the server. Ask for explicit confirmation before apply.",
    inputSchema: { uid: z.string().min(1).max(100), expected_version: z.number().int().min(0).optional(), operations: z.array(erdPatchOperation).min(1).max(100) },
    annotations: readOnly,
  }, async ({ uid, expected_version, operations }) => jsonResult(await proposeErdPatch(await resolveMcpUserId(), uid, operations as any, expected_version)));

  server.registerTool("erd_patch_apply", {
    description: "Apply one confirmed granular ERD patch. Rejects stale diagrams and requires confirmation to exactly equal proposal_id.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyErdPatchProposal(await resolveMcpUserId(), proposal_id, confirmation)));

  server.registerTool("history_list", {
    description: "List snapshot versions for a local Note, Flowchart, or ERD diagram.",
    inputSchema: { type: documentType, uid: z.string().min(1), limit: z.number().int().min(1).max(100).default(20) }, annotations: readOnly,
  }, async ({ type, uid, limit }) => jsonResult(await historyList(await resolveMcpUserId(), type, uid, limit)));

  server.registerTool("history_read", {
    description: "Read one snapshot version without restoring it.",
    inputSchema: { type: documentType, uid: z.string().min(1), revision_id: z.string().min(1) }, annotations: readOnly,
  }, async ({ type, uid, revision_id }) => jsonResult(await historyRead(await resolveMcpUserId(), type, uid, revision_id)));

  server.registerTool("history_restore_propose", {
    description: "Prepare a history restore for a Note, Flowchart, or ERD. This does not modify data; review the preview before applying.",
    inputSchema: { type: documentType, uid: z.string().min(1), revision_id: z.string().min(1) }, annotations: readOnly,
  }, async ({ type, uid, revision_id }) => jsonResult(await proposeHistoryRestore(await resolveMcpUserId(), type, uid, revision_id)));

  server.registerTool("history_restore_apply", {
    description: "Apply a previously proposed history restore. Requires the exact proposal ID as confirmation, rejects stale documents, and creates a pre-restore safety revision.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyHistoryRestore(await resolveMcpUserId(), proposal_id, confirmation)));

  server.registerTool("db_list_catalogs", {
    description: "List configured DB Client catalogs and non-secret connection metadata. Passwords and TLS keys are never returned.",
    annotations: readOnly,
  }, async () => jsonResult(await listDbCatalogs(await resolveMcpUserId())));

  server.registerTool("db_read_schema", {
    description: "Read tables, columns, indexes, checks, and foreign keys from one DB Client catalog.",
    inputSchema: { catalog_id: z.number().int().positive() }, annotations: externalReadOnly,
  }, async ({ catalog_id }) => jsonResult(await readDbSchema(await resolveMcpUserId(), catalog_id)));

  server.registerTool("db_query_read_only", {
    description: "Run one SELECT/CTE against a PostgreSQL or MySQL DB Client catalog in a forced read-only session.",
    inputSchema: { catalog_id: z.number().int().positive(), sql: z.string().min(1).max(100_000), max_rows: z.number().int().min(1).max(500).default(100) }, annotations: externalReadOnly,
  }, async ({ catalog_id, sql, max_rows }) => jsonResult(await runReadOnlyQuery(await resolveMcpUserId(), catalog_id, sql, max_rows)));

  server.registerTool("note_append_propose", {
    description: "Prepare a plain-text append to a Note. This does not modify data; show the preview to the user before applying.",
    inputSchema: { note_uid: z.string().min(1), text: z.string().min(1).max(100_000) }, annotations: readOnly,
  }, async ({ note_uid, text }) => jsonResult(await proposeNoteAppend(await resolveMcpUserId(), note_uid, text)));

  server.registerTool("note_append_apply", {
    description: "Apply a previously proposed Note append. Requires the exact proposal ID as confirmation, rejects stale Notes, and creates an entity_changes safety snapshot.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyNoteAppend(await resolveMcpUserId(), proposal_id, confirmation)));

}
