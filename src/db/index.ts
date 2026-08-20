import * as schema from "./schema";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgliteDatabase } from "drizzle-orm/pglite";

export type Db =
  | NeonHttpDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pftDb?: Promise<Db> };

async function createDb(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(process.env.DATABASE_URL), { schema });
  }
  // Local development fallback: embedded Postgres persisted to .pglite/
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(".pglite");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__pftDb) globalForDb.__pftDb = createDb();
  return globalForDb.__pftDb;
}

export { schema };

/**
 * Postgres 42P01 (undefined_table). Worth tolerating in the narrow case where a
 * deploy can run ahead of its migration; anything else is a real fault and must
 * not be swallowed.
 */
export function isUndefinedTable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "42P01"
  );
}
