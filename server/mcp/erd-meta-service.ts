/**
 * MCP service for granular column coloring and table documentation.
 * Updates are persisted to DB immediately and broadcasted live via WebSocket relay.
 */
import { prisma } from "../lib/prisma.js";
import { broadcastCollabEvent } from "../lib/collab/server.js";

export interface ColumnColorAssignment {
  tableName: string;
  columnNames: string[];
  color: string | null;
}

export interface TableDocumentationAssignment {
  tableName: string;
  description: string;
}

export async function applyColumnColorMarking(
  userId: string,
  diagramUid: string,
  assignments: ColumnColorAssignment[]
) {
  if (!prisma) throw new Error("Database unavailable");

  const diagram = await prisma.diagram.findFirst({
    where: { uid: diagramUid, userId, isDeleted: false },
    select: { id: true, uid: true, version: true },
  });

  if (!diagram) throw new Error(`Diagram with UID ${diagramUid} not found or access denied`);

  let modifiedCount = 0;

  for (const item of assignments) {
    const entity = await prisma.entity.findFirst({
      where: { diagramId: diagram.id, name: item.tableName },
      select: { id: true },
    });
    if (!entity) continue;

    const res = await prisma.column.updateMany({
      where: {
        entityId: entity.id,
        name: { in: item.columnNames },
      },
      data: {
        color: item.color || null,
      },
    });
    modifiedCount += res.count;
  }

  const updatedDiagram = await prisma.diagram.update({
    where: { id: diagram.id },
    data: {
      updatedAt: new Date(),
      version: (diagram.version ?? 0) + 1,
    },
    select: { version: true },
  });

  const nextVer = updatedDiagram.version ?? (diagram.version ?? 0) + 1;

  // Broadcast change live to any browser currently looking at this diagram!
  try {
    broadcastCollabEvent(diagram.uid, {
      t: "content-change",
      id: "mcp-column-color",
      version: nextVer,
      editorName: "AI Assistant (Coloring)",
    });
  } catch (e) {
    // Non-fatal
  }

  return {
    status: "applied",
    diagram_uid: diagram.uid,
    version: nextVer,
    columns_updated: modifiedCount,
  };
}

export async function applyTableDocumentationBulk(
  userId: string,
  diagramUid: string,
  assignments: TableDocumentationAssignment[]
) {
  if (!prisma) throw new Error("Database unavailable");

  const diagram = await prisma.diagram.findFirst({
    where: { uid: diagramUid, userId, isDeleted: false },
    select: { id: true, uid: true, version: true },
  });

  if (!diagram) throw new Error(`Diagram with UID ${diagramUid} not found or access denied`);

  let modifiedCount = 0;

  for (const item of assignments) {
    const res = await prisma.entity.updateMany({
      where: {
        diagramId: diagram.id,
        name: item.tableName,
      },
      data: {
        comment: item.description || null,
      },
    });
    modifiedCount += res.count;
  }

  const updatedDiagram = await prisma.diagram.update({
    where: { id: diagram.id },
    data: {
      updatedAt: new Date(),
      version: (diagram.version ?? 0) + 1,
    },
    select: { version: true },
  });

  const nextVer = updatedDiagram.version ?? (diagram.version ?? 0) + 1;

  // Broadcast change live to any browser currently looking at this diagram!
  try {
    broadcastCollabEvent(diagram.uid, {
      t: "content-change",
      id: "mcp-table-docs",
      version: nextVer,
      editorName: "AI Assistant (Documentation)",
    });
  } catch (e) {
    // Non-fatal
  }

  return {
    status: "applied",
    diagram_uid: diagram.uid,
    version: nextVer,
    tables_documented: modifiedCount,
  };
}

export interface TableSampleDataAssignment {
  tableName: string;
  sampleRows: Record<string, any>[];
}

export async function applyTableSampleDataBulk(
  userId: string,
  diagramUid: string,
  assignments: TableSampleDataAssignment[]
) {
  if (!prisma) throw new Error("Database unavailable");

  const diagram = await prisma.diagram.findFirst({
    where: { uid: diagramUid, userId, isDeleted: false },
    select: { id: true, uid: true, version: true },
  });

  if (!diagram) throw new Error(`Diagram with UID ${diagramUid} not found or access denied`);

  let modifiedCount = 0;

  for (const item of assignments) {
    const entity = await prisma.entity.findFirst({
      where: { diagramId: diagram.id, name: item.tableName },
      select: { id: true, governanceData: true },
    });
    if (!entity) continue;

    let payload: Record<string, any> = {};
    if (entity.governanceData) {
      try {
        payload = JSON.parse(entity.governanceData);
      } catch {}
    }
    payload.sample_data = Array.isArray(item.sampleRows) ? item.sampleRows : [];

    await prisma.entity.update({
      where: { id: entity.id },
      data: {
        governanceData: JSON.stringify(payload),
      },
    });
    modifiedCount += 1;
  }

  const updatedDiagram = await prisma.diagram.update({
    where: { id: diagram.id },
    data: {
      updatedAt: new Date(),
      version: (diagram.version ?? 0) + 1,
    },
    select: { version: true },
  });

  const nextVer = updatedDiagram.version ?? (diagram.version ?? 0) + 1;

  // Broadcast change live to any browser currently looking at this diagram!
  try {
    broadcastCollabEvent(diagram.uid, {
      t: "content-change",
      id: "mcp-table-sample-data",
      version: nextVer,
      editorName: "AI Assistant (Sample Data)",
    });
  } catch (e) {
    // Non-fatal
  }

  return {
    status: "applied",
    diagram_uid: diagram.uid,
    version: nextVer,
    tables_updated: modifiedCount,
  };
}
