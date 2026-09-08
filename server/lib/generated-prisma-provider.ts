import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The datasource provider the Prisma client in node_modules was generated for.
 *
 * Prisma 7 driver adapters must match the generated client, so a suite that
 * needs SQLite cannot run against the PostgreSQL client this repo's
 * `postinstall` produces — it fails at client construction, not at any
 * assertion. Tests read this to skip honestly instead of reporting a red
 * baseline that hides real regressions.
 *
 * To run the SQLite suites deliberately, regenerate the client first:
 *   rm -rf node_modules/.prisma/client && npm run db:generate:sqlite
 * then restore the working client with `npm run db:generate:pg`.
 */
export function generatedPrismaProvider(): string {
  try {
    const schema = readFileSync(path.resolve("node_modules/.prisma/client/schema.prisma"), "utf8");
    return schema.match(/datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([^"]+)"/)?.[1] ?? "unknown";
  } catch {
    return "unknown";
  }
}

export const GENERATED_PRISMA_PROVIDER = generatedPrismaProvider();

/** True when the generated client can actually back a SQLite-based test. */
export const HAS_SQLITE_PRISMA_CLIENT = GENERATED_PRISMA_PROVIDER === "sqlite";
