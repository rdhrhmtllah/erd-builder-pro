import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: { note: { findFirst: mocks.findFirst, create: mocks.create, update: mocks.update } },
}));
vi.mock("../../lib/config.js", () => ({ isDesktopMode: () => false, isLocalPostgres: () => true }));
vi.mock("../../lib/entity-history.js", () => ({ captureEntityRevisionSafely: vi.fn() }));

const service = await import("./service.js");

/** A tree of pages, keyed by id, that findFirst can walk like the database would. */
function useTree(tree: Record<number, { parentId: number | null; userId?: string }>) {
  mocks.findFirst.mockImplementation(async ({ where }: any) => {
    const id = where.id;
    const row = tree[id];
    if (!row) return null;
    if (where.userId && (row.userId ?? "owner") !== where.userId) return null;
    return { id, parentId: row.parentId };
  });
}

describe("note page hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: 10 });
    mocks.update.mockResolvedValue({ version: 1, updatedAt: new Date() });
  });

  it("accepts a page with no parent", async () => {
    await expect(service.assertValidNoteParent(null, "owner")).resolves.toBeUndefined();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("accepts a parent the user owns", async () => {
    useTree({ 1: { parentId: null } });
    await expect(service.assertValidNoteParent(1, "owner", 2)).resolves.toBeUndefined();
  });

  it("refuses a parent that belongs to someone else", async () => {
    useTree({ 1: { parentId: null, userId: "someone-else" } });
    await expect(service.assertValidNoteParent(1, "owner", 2)).rejects.toThrow(/not found/i);
  });

  it("refuses a page being put inside itself", async () => {
    useTree({ 1: { parentId: null } });
    await expect(service.assertValidNoteParent(1, "owner", 1)).rejects.toThrow(/inside itself/i);
  });

  it("refuses a move that would make the tree loop", async () => {
    // 3 sits under 2, which sits under 1. Moving 1 under 3 closes the cycle.
    useTree({ 1: { parentId: null }, 2: { parentId: 1 }, 3: { parentId: 2 } });
    await expect(service.assertValidNoteParent(3, "owner", 1)).rejects.toThrow(/own sub-pages/i);
  });

  it("allows a deep but acyclic move", async () => {
    useTree({ 1: { parentId: null }, 2: { parentId: 1 }, 3: { parentId: 2 }, 9: { parentId: null } });
    await expect(service.assertValidNoteParent(3, "owner", 9)).resolves.toBeUndefined();
  });

  it("stops walking if existing data already contains a loop", async () => {
    // Guards the guard: corrupt rows must not hang the request.
    useTree({ 1: { parentId: 2 }, 2: { parentId: 1 } });
    await expect(service.assertValidNoteParent(1, "owner", 99)).resolves.toBeUndefined();
  });

  it("stores the parent when a sub-page is created", async () => {
    useTree({ 5: { parentId: null } });
    await service.createNote({ title: "Child", parentId: 5, userId: "owner" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ parentId: 5, title: "Child" }),
    }));
  });

  it("refuses to create a sub-page under a parent that does not exist", async () => {
    useTree({});
    await expect(service.createNote({ title: "Orphan", parentId: 404, userId: "owner" }))
      .rejects.toThrow(/not found/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("leaves the parent alone when an update does not mention it", async () => {
    mocks.findFirst.mockResolvedValue({ id: 7, title: "Doc", content: "", projectId: null, version: 1 });
    await service.updateNote("uid-7", "owner", { title: "Renamed" });
    const payload = mocks.update.mock.calls[0][0].data;
    expect(payload).not.toHaveProperty("parentId");
    expect(payload.title).toBe("Renamed");
  });
});
