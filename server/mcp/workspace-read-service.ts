import { prisma } from "../lib/prisma.js";
import { listRecentFiles, searchDocuments } from "../routes/search/service.js";
import { getProjectSiblings, getProjectSummary, listProjects } from "../routes/projects/service.js";
import { listBackups } from "../routes/backups/service.js";

export const WORKSPACE_DOCUMENT_TYPES = ["notes", "flowcharts", "drawings", "diagrams"] as const;
export type WorkspaceDocumentType = (typeof WORKSPACE_DOCUMENT_TYPES)[number];

function serialize(value: unknown): any {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function projectIdentifier(identifier: string) {
  return /^\d+$/.test(identifier) ? Number(identifier) : null;
}

export async function resolveWorkspaceProject(
  userId: string,
  identifier: string | undefined,
  includeDeleted = false,
) {
  if (!identifier) return null;
  if (!prisma) throw new Error("Database connection not available");
  const id = projectIdentifier(identifier);
  const project = await prisma.project.findFirst({
    where: {
      userId,
      ...(includeDeleted ? {} : { isDeleted: false }),
      OR: [{ uid: identifier }, ...(id === null ? [] : [{ id }])],
    } as any,
    select: { id: true, uid: true, name: true, isDeleted: true, updatedAt: true },
  });
  if (!project) throw new Error("Project not found");
  return project;
}

export async function workspaceProjects(
  userId: string,
  input: { limit: number; offset: number; q?: string },
) {
  return serialize(await listProjects(userId, {
    limit: Math.min(Math.max(input.limit, 1), 100),
    offset: Math.max(input.offset, 0),
    q: input.q?.trim() || undefined,
  }));
}

export async function workspaceSearch(userId: string, query: string) {
  return serialize(await searchDocuments(userId, query));
}

export async function workspaceRecent(userId: string) {
  return serialize(await listRecentFiles(userId));
}

export async function workspaceBackups(userId: string, limit: number, offset: number) {
  const result = await listBackups(userId, limit, offset);
  return serialize({
    total: result.total,
    data: result.data.map(({ filePath: _filePath, ...backup }: any) => backup),
  });
}

export async function projectSummary(userId: string, projectUid: string) {
  const project = await resolveWorkspaceProject(userId, projectUid);
  if (!project) throw new Error("Project not found");
  return serialize({
    project,
    summary: await getProjectSummary(Number(project.id), userId, false),
  });
}

export async function projectSiblings(userId: string, projectUid: string) {
  const project = await resolveWorkspaceProject(userId, projectUid);
  if (!project) throw new Error("Project not found");
  return serialize({
    project,
    ...await getProjectSiblings(Number(project.id), userId),
  });
}
