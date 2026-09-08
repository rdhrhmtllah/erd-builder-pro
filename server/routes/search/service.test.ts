import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  desktop: true,
  diagram: vi.fn(),
  note: vi.fn(),
  drawing: vi.fn(),
  flowchart: vi.fn(),
  dbClient: vi.fn(),
  project: vi.fn(),
  entity: vi.fn(),
  column: vi.fn(),
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    diagram: { findMany: mocks.diagram },
    note: { findMany: mocks.note },
    drawing: { findMany: mocks.drawing },
    flowchart: { findMany: mocks.flowchart },
    dbClient: { findMany: mocks.dbClient },
    project: { findMany: mocks.project },
    entity: { findMany: mocks.entity },
    column: { findMany: mocks.column },
  },
}));
vi.mock("../../lib/config.js", () => ({ isDesktopMode: () => mocks.desktop }));

import { listRecentFiles, searchDocuments } from "./service.js";

describe("listRecentFiles", () => {
  beforeEach(() => {
    mocks.desktop = true;
    for (const mock of [mocks.diagram, mocks.note, mocks.drawing, mocks.flowchart, mocks.dbClient]) {
      mock.mockReset().mockResolvedValue([]);
    }
  });

  it("sorts by the latest edit and excludes DB Client on web", async () => {
    mocks.desktop = false;
    mocks.diagram.mockResolvedValue([{ id: 1, name: "Yesterday", updatedAt: new Date("2026-08-20T00:00:00Z") }]);
    mocks.note.mockResolvedValue([{ id: 2, title: "Just edited", updatedAt: new Date("2026-08-21T00:00:00Z") }]);

    const files = await listRecentFiles("user-1");

    expect(files.map((file: any) => file.name)).toEqual(["Just edited", "Yesterday"]);
    expect(mocks.dbClient).not.toHaveBeenCalled();
  });
});

describe("searchDocuments", () => {
  const diagram = {
    id: 7, uid: "diagram-uid", name: "Commerce",
    updatedAt: new Date("2026-08-22T00:00:00Z"),
    project: { id: 3, uid: "ws", name: "Billing" },
  };

  beforeEach(() => {
    mocks.desktop = false;
    for (const mock of [mocks.diagram, mocks.note, mocks.drawing, mocks.flowchart, mocks.dbClient, mocks.project, mocks.entity, mocks.column]) {
      mock.mockReset().mockResolvedValue([]);
    }
  });

  it("returns a matching table with the diagram needed to open it", async () => {
    mocks.entity.mockResolvedValue([{ id: "users", name: "users", diagram }]);

    const [result]: any = await searchDocuments("user-1", "user");

    expect(result).toMatchObject({
      type: "table", name: "users", nodeId: "users",
      uid: "diagram-uid", diagramName: "Commerce",
      workspace: { name: "Billing" },
    });
  });

  it("returns a matching column with its table and type", async () => {
    mocks.column.mockResolvedValue([
      { id: "col-1", name: "user_id", type: "BIGINT", entity: { id: "orders", name: "orders", diagram } },
    ]);

    const [result]: any = await searchDocuments("user-1", "user_id");

    expect(result).toMatchObject({
      type: "column", name: "user_id", columnType: "BIGINT",
      columnId: "col-1", nodeId: "orders", tableName: "orders", uid: "diagram-uid",
    });
  });

  it("falls back to the numeric diagram id when a uid is missing", async () => {
    mocks.entity.mockResolvedValue([{ id: "users", name: "users", diagram: { ...diagram, uid: null } }]);
    const [result]: any = await searchDocuments("user-1", "user");
    expect(result.uid).toBe("7");
  });

  it("drops a schema hit whose diagram was already removed", async () => {
    mocks.entity.mockResolvedValue([{ id: "orphan", name: "orphan", diagram: null }]);
    mocks.column.mockResolvedValue([{ id: "c", name: "orphan_id", type: "INT", entity: null }]);

    expect(await searchDocuments("user-1", "orphan")).toEqual([]);
  });

  it("only searches schema inside the caller's own non-production diagrams", async () => {
    await searchDocuments("user-1", "users");

    const entityWhere = mocks.entity.mock.calls[0][0].where;
    expect(entityWhere.diagram).toMatchObject({ userId: "user-1", isDeleted: false });
    expect(JSON.stringify(entityWhere.diagram)).toContain("production_db");

    const columnWhere = mocks.column.mock.calls[0][0].where;
    expect(columnWhere.entity.diagram).toMatchObject({ userId: "user-1", isDeleted: false });
  });

  it("returns nothing for a blank query without touching the database", async () => {
    expect(await searchDocuments("user-1", "   ")).toEqual([]);
    expect(mocks.entity).not.toHaveBeenCalled();
  });
});
