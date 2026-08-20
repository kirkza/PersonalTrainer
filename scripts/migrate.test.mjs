import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  BASELINE_TAG,
  baselineEntry,
  hashOf,
  pendingAfter,
  readJournal,
} from "./migrate-lib.mjs";
import { planMigration } from "./migrate-plan.mjs";

const FOLDER = "./drizzle";
const journal = readJournal(FOLDER);

/** What `drizzle-kit push` leaves behind: tables, no ledger. */
async function pushSchemaUpTo(pg, tag) {
  const upTo = journal.entries.find((e) => e.tag === tag).when;
  for (const entry of journal.entries.filter((e) => e.when <= upTo)) {
    const sql = readFileSync(`${FOLDER}/${entry.tag}.sql`, "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
}

async function tableExists(pg, schema, name) {
  const res = await pg.query(
    `select exists (select 1 from information_schema.tables
      where table_schema = $1 and table_name = $2) as present`,
    [schema, name]
  );
  return res.rows[0].present;
}

async function ledgerRowCount(pg) {
  if (!(await tableExists(pg, "drizzle", "__drizzle_migrations"))) return 0;
  const res = await pg.query("select count(*)::int as count from drizzle.__drizzle_migrations");
  return res.rows[0].count;
}

async function readState(pg) {
  return {
    hasLedgerRows: (await ledgerRowCount(pg)) > 0,
    hasAppTables: await tableExists(pg, "public", "plans"),
  };
}

async function applyBaseline(pg, upTo) {
  await pg.exec("create schema if not exists drizzle");
  await pg.exec(`create table if not exists drizzle.__drizzle_migrations (
    id serial primary key, hash text not null, created_at bigint)`);
  await pg.query(
    'insert into drizzle.__drizzle_migrations ("hash", "created_at") values ($1, $2)',
    [hashOf(FOLDER, upTo.tag), upTo.when]
  );
}

describe("planMigration", () => {
  const baseline = baselineEntry(journal);

  it("baselines a database whose schema predates the ledger", () => {
    const plan = planMigration({ hasLedgerRows: false, hasAppTables: true }, baseline);
    expect(plan.action).toBe("baseline");
    expect(plan.upTo).toEqual(baseline);
  });

  it("applies everything to an empty database", () => {
    expect(planMigration({ hasLedgerRows: false, hasAppTables: false }, baseline).action)
      .toBe("migrate-all");
  });

  it("leaves an already-tracked database to the migrator", () => {
    expect(planMigration({ hasLedgerRows: true, hasAppTables: true }, baseline).action)
      .toBe("migrate-remaining");
  });

  it("does not skip migrations when no baseline is configured", () => {
    expect(planMigration({ hasLedgerRows: false, hasAppTables: true }, null).action)
      .toBe("migrate-all");
  });

  it("leaves only post-baseline migrations pending", () => {
    const plan = planMigration({ hasLedgerRows: false, hasAppTables: true }, baseline);
    const tags = pendingAfter(journal, plan).map((e) => e.tag);
    expect(tags).toContain("0004_exercise-notes");
    expect(tags).not.toContain("0000_init");
    expect(tags).not.toContain(BASELINE_TAG);
  });
});

describe("adopting a pushed database (the production situation)", () => {
  it("baselines, applies only what is new, and is idempotent", async () => {
    const pg = new PGlite();
    // production as it stands: schema through 0003, no ledger
    await pushSchemaUpTo(pg, BASELINE_TAG);
    expect(await tableExists(pg, "public", "plans")).toBe(true);
    expect(await tableExists(pg, "public", "exercise_notes")).toBe(false);
    expect(await ledgerRowCount(pg)).toBe(0);

    const plan = planMigration(await readState(pg), baselineEntry(journal));
    expect(plan.action).toBe("baseline");

    await applyBaseline(pg, plan.upTo);
    // replaying 0000 onto existing tables would throw here
    await migrate(drizzle(pg), { migrationsFolder: FOLDER });

    expect(await tableExists(pg, "public", "exercise_notes")).toBe(true);
    // baseline row + the migrations actually applied
    const afterFirst = await ledgerRowCount(pg);
    expect(afterFirst).toBe(1 + pendingAfter(journal, plan).length);

    // a second deploy must change nothing
    const second = planMigration(await readState(pg), baselineEntry(journal));
    expect(second.action).toBe("migrate-remaining");
    await migrate(drizzle(pg), { migrationsFolder: FOLDER });
    expect(await ledgerRowCount(pg)).toBe(afterFirst);
    await pg.close();
  }, 60000);

  it("gives a fresh database every migration, without baselining", async () => {
    const pg = new PGlite();
    const plan = planMigration(await readState(pg), baselineEntry(journal));
    expect(plan.action).toBe("migrate-all");

    await migrate(drizzle(pg), { migrationsFolder: FOLDER });
    expect(await tableExists(pg, "public", "plans")).toBe(true);
    expect(await tableExists(pg, "public", "exercise_notes")).toBe(true);
    expect(await ledgerRowCount(pg)).toBe(journal.entries.length);
    await pg.close();
  }, 60000);
});
