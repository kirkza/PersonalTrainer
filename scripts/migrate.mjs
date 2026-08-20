// Applies pending drizzle migrations to the configured Postgres database.
// Runs as part of `npm run build`, so a deploy can never ship code that needs a
// table the database does not have.
//
// Without DATABASE_URL this is a no-op: local development uses embedded PGlite,
// which migrates itself in src/db/index.ts.
//
// Caveats worth knowing before writing a migration:
//   * This runs BEFORE the new code is live, so the currently-running version
//     briefly sees the new schema. Additive changes are safe; a destructive one
//     needs the usual expand/contract split across two deploys.
//   * neon-http has no transactions, so a multi-statement migration is not
//     atomic. Keep migrations small.
import { baselineEntry, hashOf, pendingAfter, readJournal } from "./migrate-lib.mjs";
import { planMigration } from "./migrate-plan.mjs";

const MIGRATIONS_FOLDER = "./drizzle";
const CHECK_ONLY = process.argv.includes("--check");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("migrate: no DATABASE_URL — skipping (local dev uses PGlite)");
    return;
  }

  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");

  // the raw client's tagged template returns rows directly, which is the same
  // contract drizzle's own migrator relies on
  const sql = neon(url);

  const [{ present }] = await sql`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'plans'
    ) as present
  `;
  const [{ present: ledgerExists }] = await sql`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
    ) as present
  `;
  let ledgerRows = 0;
  if (ledgerExists) {
    const [{ count }] = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
    ledgerRows = Number(count);
  }

  const state = { hasLedgerRows: ledgerRows > 0, hasAppTables: Boolean(present) };
  const journal = readJournal(MIGRATIONS_FOLDER);
  const plan = planMigration(state, baselineEntry(journal));

  console.log(
    `migrate: appTables=${state.hasAppTables} ledgerRows=${ledgerRows} -> ${plan.action}`
  );
  console.log(`migrate: ${plan.reason}`);
  const pending = pendingAfter(journal, plan);
  console.log(`migrate: pending ${pending.map((e) => e.tag).join(", ") || "(none)"}`);

  if (CHECK_ONLY) {
    console.log("migrate: --check, nothing written");
    return;
  }

  if (plan.action === "baseline") {
    await sql`create schema if not exists drizzle`;
    await sql`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `;
    await sql`
      insert into drizzle.__drizzle_migrations ("hash", "created_at")
      values (${hashOf(MIGRATIONS_FOLDER, plan.upTo.tag)}, ${plan.upTo.when})
    `;
    console.log(`migrate: baselined at ${plan.upTo.tag}`);
  }

  await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
  console.log("migrate: done");
}

main().catch((err) => {
  console.error("migrate: FAILED", err);
  process.exit(1);
});
