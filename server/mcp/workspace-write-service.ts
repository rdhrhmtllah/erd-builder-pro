import { randomUUID } from "node:crypto";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../lib/prisma.js";
import { R2_BUCKET_NAME, s3Client, useLocalAuth } from "../lib/config.js";
import { getStorageClientForUser } from "../lib/storage.js";
import {
  createProject,
  permanentDeleteProject,
  restoreProject,
  softDeleteProject,
  updateProject,
} from "../routes/projects/service.js";
import {
  createDiagram,
  getDiagram,
  permanentDeleteDiagram,
  restoreDiagram,
  softDeleteDiagram,
  updateDiagram,
  updateDiagramShare,
} from "../routes/diagrams/service.js";
import { saveDiagram } from "../routes/diagrams/save-service.js";
import {
  createNote,
  extractR2KeysFromContent,
  getNoteForPermanentDelete,
  permanentDeleteNote,
  restoreNote,
  softDeleteNote,
  updateNote,
  updateNoteShare,
} from "../routes/notes/service.js";
import {
  createFlowchart,
  permanentDeleteFlowchart,
  restoreFlowchart,
  softDeleteFlowchart,
  updateFlowchart,
  updateFlowchartShare,
} from "../routes/flowcharts/service.js";
import {
  createDrawing,
  extractR2KeysFromDrawingData,
  getDrawingForPermanentDelete,
  permanentDeleteDrawing,
  restoreDrawing,
  softDeleteDrawing,
  updateDrawing,
  updateDrawingShare,
} from "../routes/drawings/service.js";
import {
  createBackupRecord,
  executeLocalBackup,
} from "../routes/backups/service.js";
import {
  assertExpectedUpdatedAt,
  currentProject,
  diagramPayload,
  documentType,
  documentUid,
  jsonText,
  newProposal,
  optionalString,
  requiredString,
  serialize,
  validateProposalInput,
  type MutationPayload,
  type WorkspaceMutationProposal,
  type WorkspaceWriteOperation,
} from "./workspace-write-validation.js";

export { WORKSPACE_WRITE_OPERATIONS, type WorkspaceWriteOperation } from "./workspace-write-validation.js";

const proposals = new Map<string, WorkspaceMutationProposal>();

export async function proposeWorkspaceMutation(userId: string, operation: WorkspaceWriteOperation, payload: MutationPayload) {
  const { expectedUpdatedAt, expectedVersion } = await validateProposalInput(userId, operation, payload);
  const proposal = newProposal(userId, operation, payload, expectedUpdatedAt, expectedVersion);
  proposals.set(proposal.id, proposal);
  return {
    proposal_id: proposal.id,
    confirmation: proposal.id,
    expires_at: new Date(proposal.expiresAt).toISOString(),
    ...proposal.preview,
  };
}

async function cleanupStorage(userId: string, keys: string[]) {
  const userStorage = await getStorageClientForUser(userId, prisma);
  const client = userStorage?.client ?? s3Client;
  const bucket = userStorage?.bucketName ?? R2_BUCKET_NAME;
  if (!client || !bucket || keys.length === 0) return;
  await Promise.all(keys.map(key => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined)));
}

async function applyProjectMutation(proposal: WorkspaceMutationProposal) {
  if (proposal.operation === "project_create") {
    return createProject(requiredString(proposal.payload, "name"), proposal.userId);
  }
  const projectUid = proposal.payload.project_uid as string;
  const project = await currentProject(proposal.userId, projectUid, true);
  if (proposal.operation === "project_update") return updateProject(Number(project.id), proposal.userId, requiredString(proposal.payload, "name"));
  if (proposal.operation === "project_soft_delete") return softDeleteProject(Number(project.id), proposal.userId);
  if (proposal.operation === "project_restore") return restoreProject(Number(project.id), proposal.userId);
  await permanentDeleteProject(Number(project.id), proposal.userId);
  return { success: true };
}

async function applyDocumentCreate(proposal: WorkspaceMutationProposal) {
  const type = documentType(proposal.payload);
  const project = proposal.payload.project_uid ? await currentProject(proposal.userId, proposal.payload.project_uid as string) : null;
  if (type === "notes") return createNote({ title: requiredString(proposal.payload, "title"), content: optionalString(proposal.payload, "content") ?? "", projectId: project ? Number(project.id) : null, userId: proposal.userId, uid: randomUUID() });
  if (type === "flowcharts") return createFlowchart({ title: requiredString(proposal.payload, "title"), fcData: jsonText(proposal.payload.data, "data", '{"nodes":[],"edges":[]}'), projectId: project ? Number(project.id) : null, userId: proposal.userId, uid: randomUUID() });
  if (type === "drawings") return createDrawing({ title: requiredString(proposal.payload, "title"), drawingData: jsonText(proposal.payload.data, "data", "[]"), projectId: project ? Number(project.id) : null, userId: proposal.userId, uid: randomUUID() });
  const diagram = await createDiagram({ name: requiredString(proposal.payload, "name"), projectId: project ? Number(project.id) : null, userId: proposal.userId, uid: randomUUID() });
  const save = await saveDiagram(String(diagram.uid || diagram.id), proposal.userId, { ...diagramPayload(proposal.payload), expectedVersion: 0 } as any);
  return { diagram, save };
}

async function applyDocumentMutation(proposal: WorkspaceMutationProposal) {
  const type = documentType(proposal.payload);
  const uid = documentUid(proposal.payload);
  if (proposal.operation === "diagram_save") {
    const saved = await saveDiagram(uid, proposal.userId, {
      ...diagramPayload(proposal.payload),
      expectedVersion: proposal.expectedVersion,
    } as any);
    if (!saved) throw new Error("Diagram not found");
    if ((saved as any).conflict) throw new Error("Conflict: diagram changed after this proposal was created");
    return saved;
  }
  if (proposal.operation === "document_update") {
    const projectId = proposal.payload.project_uid === undefined
      ? undefined
      : proposal.payload.project_uid === null
        ? null
        : Number((await currentProject(proposal.userId, proposal.payload.project_uid as string)).id);
    if (type === "notes") return updateNote(uid, proposal.userId, { title: proposal.payload.title as string | undefined, content: proposal.payload.content as string | undefined, projectId, historySource: "mcp" });
    if (type === "flowcharts") return updateFlowchart(uid, proposal.userId, { title: proposal.payload.title as string | undefined, fcData: proposal.payload.data === undefined ? undefined : jsonText(proposal.payload.data, "data", ""), projectId });
    if (type === "drawings") return updateDrawing(uid, proposal.userId, { title: proposal.payload.title as string | undefined, drawingData: proposal.payload.data === undefined ? undefined : jsonText(proposal.payload.data, "data", ""), projectId });
    return updateDiagram(uid, proposal.userId, { name: proposal.payload.name as string | undefined, projectId });
  }
  if (proposal.operation === "document_soft_delete") {
    if (type === "notes") return softDeleteNote(uid, proposal.userId);
    if (type === "flowcharts") return softDeleteFlowchart(uid, proposal.userId);
    if (type === "drawings") return softDeleteDrawing(uid, proposal.userId);
    return softDeleteDiagram(uid, proposal.userId);
  }
  if (proposal.operation === "document_restore") {
    if (type === "notes") return restoreNote(uid, proposal.userId);
    if (type === "flowcharts") return restoreFlowchart(uid, proposal.userId);
    if (type === "drawings") return restoreDrawing(uid, proposal.userId);
    return restoreDiagram(uid, proposal.userId);
  }
  if (proposal.operation === "document_share_update") {
    const data = { isPublic: Boolean(proposal.payload.is_public), shareToken: proposal.payload.share_token as string | null | undefined, expiryDate: proposal.payload.expiry_date ? new Date(proposal.payload.expiry_date as string) : null };
    if (type === "notes") return updateNoteShare(uid, proposal.userId, data);
    if (type === "flowcharts") return updateFlowchartShare(uid, proposal.userId, data);
    if (type === "drawings") return updateDrawingShare(uid, proposal.userId, data);
    return updateDiagramShare(uid, proposal.userId, data);
  }
  if (type === "notes") {
    const note = await getNoteForPermanentDelete(uid, proposal.userId);
    if (!note) throw new Error("Note not found");
    await cleanupStorage(proposal.userId, note.content ? extractR2KeysFromContent(note.content) : []);
    await permanentDeleteNote(Number(note.id));
  } else if (type === "drawings") {
    const drawing = await getDrawingForPermanentDelete(uid, proposal.userId);
    if (!drawing) throw new Error("Drawing not found");
    await cleanupStorage(proposal.userId, drawing.data ? extractR2KeysFromDrawingData(drawing.data) : []);
    await permanentDeleteDrawing(Number(drawing.id));
  } else if (type === "flowcharts") {
    await permanentDeleteFlowchart(uid, proposal.userId);
  } else {
    const diagram = await getDiagram(uid, proposal.userId);
    if (!diagram || (diagram as any).sourceType === "production_db") throw new Error("Diagram not found");
    await permanentDeleteDiagram(Number((diagram as any).id));
  }
  return { success: true };
}

async function applyBackupCreate(proposal: WorkspaceMutationProposal) {
  if (!useLocalAuth()) throw new Error("Backup creation through MCP is available only in local PostgreSQL mode");
  const name = requiredString(proposal.payload, "name");
  const backup = await createBackupRecord(proposal.userId, name);
  if (!backup) throw new Error("Could not create backup record");
  void executeLocalBackup(backup.id, proposal.userId).catch(() => undefined);
  return { status: "started", backup: serialize(backup), message: "Backup started; use backup_list to monitor status" };
}

export async function applyWorkspaceMutation(userId: string, proposalId: string, confirmation: string) {
  const proposal = proposals.get(proposalId);
  if (!proposal || proposal.userId !== userId || proposal.expiresAt < Date.now()) {
    proposals.delete(proposalId);
    throw new Error("Proposal is missing or expired; create a new proposal");
  }
  if (confirmation !== proposal.id) throw new Error("Confirmation must exactly match proposal_id");
  await assertExpectedUpdatedAt(proposal);
  let result: unknown;
  if (proposal.operation === "backup_create") result = await applyBackupCreate(proposal);
  else if (proposal.operation === "document_create") result = await applyDocumentCreate(proposal);
  else if (proposal.operation.startsWith("project_")) result = await applyProjectMutation(proposal);
  else result = await applyDocumentMutation(proposal);
  proposals.delete(proposalId);
  return serialize({ status: "applied", operation: proposal.operation, proposal_id: proposal.id, result });
}

export async function cleanupWorkspaceProposals() {
  const now = Date.now();
  for (const [id, proposal] of proposals) if (proposal.expiresAt < now) proposals.delete(id);
}
