import { describe, expect, it } from "vitest";
import { generatedPrismaProvider, GENERATED_PRISMA_PROVIDER } from "./generated-prisma-provider.js";

describe("generatedPrismaProvider", () => {
  /**
   * Guards the guard: a broken regex would quietly return "unknown", which
   * would skip the SQLite suites forever instead of running them when the
   * matching client is generated.
   */
  it("reads a real provider out of the generated schema", () => {
    expect(["postgresql", "sqlite"]).toContain(generatedPrismaProvider());
  });

  it("reads the datasource provider rather than the generator's", () => {
    expect(generatedPrismaProvider()).not.toBe("prisma-client-js");
  });

  it("exposes the value as a constant so suites can skip without re-reading the file", () => {
    expect(GENERATED_PRISMA_PROVIDER).toBe(generatedPrismaProvider());
  });
});
