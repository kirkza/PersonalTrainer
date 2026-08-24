import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

let pg: PGlite;
let db: PgliteDatabase<typeof schema>;
let workoutId: number;

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [w] = await db
    .insert(schema.workouts)
    .values({ exercises: [], status: "in_progress" })
    .returning();
  workoutId = w.id;
}, 60000);

afterAll(async () => {
  await pg?.close();
});

const aSet = (setNumber: number, reps = 8, weight = 20) => ({
  workoutId,
  exerciseId: "0025",
  setNumber,
  reps,
  weight,
});

describe("logged sets", () => {
  it("stores one row per set", async () => {
    await db.insert(schema.sets).values(aSet(1));
    const rows = await db.select().from(schema.sets);
    expect(rows).toHaveLength(1);
  });

  it("refuses a second row for the same set of the same exercise", async () => {
    // a repeat tap on the log button, before the first insert has come back,
    // must not add a second copy of set 2
    await db.insert(schema.sets).values(aSet(2));
    await expect(db.insert(schema.sets).values(aSet(2))).rejects.toThrow();
  });

  it("still allows the same set number for a different exercise", async () => {
    await db
      .insert(schema.sets)
      .values({ ...aSet(1), exerciseId: "0031" });
    const rows = await db
      .select()
      .from(schema.sets);
    expect(rows.filter((r) => r.setNumber === 1)).toHaveLength(2);
  });
});

describe("upsert on a repeat tap", () => {
  it("updates the existing row instead of adding one", async () => {
    const before = (await db.select().from(schema.sets)).length;
    const upsert = (reps: number) =>
      db
        .insert(schema.sets)
        .values({ ...aSet(9, reps, 30) })
        .onConflictDoUpdate({
          target: [
            schema.sets.workoutId,
            schema.sets.exerciseId,
            schema.sets.setNumber,
          ],
          set: { reps, weight: 30 },
        })
        .returning();

    const [first] = await upsert(10);
    const [second] = await upsert(12);
    // same row, corrected value — not two rows
    expect(second.id).toBe(first.id);
    expect(second.reps).toBe(12);
    expect((await db.select().from(schema.sets)).length).toBe(before + 1);
  });
});

describe("the 0005 cleanup", () => {
  it("keeps the most recent of a duplicated set and drops the rest", async () => {
    const pg2 = new PGlite();
    const db2 = drizzle(pg2, { schema });
    // schema as it stood before the constraint existed
    await migrate(db2, { migrationsFolder: "./drizzle", migrationsTable: "seed" })
      .catch(() => {});
    await pg2.exec(`drop table if exists sets cascade`);
    await pg2.exec(`create table sets (
      id serial primary key, workout_id integer not null, exercise_id text not null,
      set_number integer not null, reps integer not null, weight real not null default 0,
      duration_min integer, logged_at timestamptz not null default now())`);
    // a double-tap: same set logged twice, the later one carrying the correction
    await pg2.exec(`insert into sets (workout_id, exercise_id, set_number, reps)
      values (1,'0025',1,8),(1,'0025',1,9),(1,'0025',2,7)`);

    await pg2.exec(`DELETE FROM "sets" WHERE "id" NOT IN (
      SELECT MAX("id") FROM "sets" GROUP BY "workout_id", "exercise_id", "set_number")`);
    await pg2.exec(`ALTER TABLE "sets" ADD CONSTRAINT "sets_workout_exercise_set_number"
      UNIQUE("workout_id","exercise_id","set_number")`);

    const rows = await pg2.query(`select set_number, reps from sets order by set_number`);
    expect(rows.rows).toEqual([
      { set_number: 1, reps: 9 },
      { set_number: 2, reps: 7 },
    ]);
    await pg2.close();
  }, 60000);
});
