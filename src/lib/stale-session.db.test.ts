import { beforeAll, afterAll, beforeEach, expect, it, describe } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

// getDb() caches on globalThis and reads it lazily, so seeding it here points
// the real code at a throwaway database instead of the developer's .pglite
const globalForDb = globalThis as unknown as { __pftDb?: Promise<unknown> };
let pg: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  globalForDb.__pftDb = Promise.resolve(db);
}, 60000);

afterAll(async () => {
  delete globalForDb.__pftDb;
  await pg?.close();
});

const HOURS = 3600 * 1000;
const ago = (h: number) => new Date(Date.now() - h * HOURS);

async function seedPlanDay(focus: string) {
  const [plan] = await db
    .insert(schema.plans)
    .values({ isActive: true, params: {} })
    .returning();
  const [day] = await db
    .insert(schema.planDays)
    .values({ planId: plan.id, position: 0, focus, exercises: [] })
    .returning();
  return day;
}

async function openSession(planDayId: number, startedAt: Date) {
  const [w] = await db
    .insert(schema.workouts)
    .values({ planDayId, exercises: [], status: "in_progress", startedAt })
    .returning();
  return w;
}

beforeEach(async () => {
  await db.delete(schema.sets);
  await db.delete(schema.workouts);
  await db.delete(schema.planDays);
  await db.delete(schema.plans);
});

describe("getNextSession closing sessions left open", () => {
  it("finishes a forgotten session at its last set and frees the rotation", async () => {
    const { getNextSession } = await import("./data");
    const day = await seedPlanDay("Cardio");
    const w = await openSession(day.id, ago(26));
    const lastSet = ago(25);
    await db.insert(schema.sets).values({
      workoutId: w.id,
      exerciseId: "0025",
      setNumber: 1,
      reps: 10,
      weight: 40,
      loggedAt: lastSet,
    });

    const next = await getNextSession();
    expect(next?.autoClosed).toHaveLength(1);
    expect(next?.autoClosed[0].focus).toBe("Cardio");
    expect(next?.autoClosed[0].discarded).toBe(false);
    // ~60 min, not the 26 hours of wall clock
    expect(next?.autoClosed[0].durationMin).toBe(60);
    // and it no longer captures this visit
    expect(next?.inProgress).toBeNull();

    const [row] = await db
      .select()
      .from(schema.workouts)
      .where(eq(schema.workouts.id, w.id));
    expect(row.status).toBe("completed");
    expect(row.finishedAt?.getTime()).toBe(lastSet.getTime());
  });

  it("deletes a forgotten session that was never logged into", async () => {
    const { getNextSession } = await import("./data");
    const day = await seedPlanDay("Lower B");
    const w = await openSession(day.id, ago(30));

    const next = await getNextSession();
    expect(next?.autoClosed).toEqual([
      { focus: "Lower B", durationMin: null, liftingSets: 0, discarded: true },
    ]);
    const rows = await db
      .select()
      .from(schema.workouts)
      .where(eq(schema.workouts.id, w.id));
    expect(rows).toHaveLength(0);
  });

  it("leaves a session being trained right now alone", async () => {
    const { getNextSession } = await import("./data");
    const day = await seedPlanDay("Upper A");
    const w = await openSession(day.id, ago(1));
    await db.insert(schema.sets).values({
      workoutId: w.id,
      exerciseId: "0025",
      setNumber: 1,
      reps: 10,
      weight: 40,
      loggedAt: ago(0.1),
    });

    const next = await getNextSession();
    expect(next?.autoClosed).toEqual([]);
    expect(next?.inProgress?.id).toBe(w.id);
  });

  it("leaves a session started recently with nothing logged yet", async () => {
    const { getNextSession } = await import("./data");
    const day = await seedPlanDay("Push A");
    const w = await openSession(day.id, ago(0.2));

    const next = await getNextSession();
    expect(next?.autoClosed).toEqual([]);
    expect(next?.inProgress?.id).toBe(w.id);
  });

  it("is a no-op when run twice", async () => {
    const { getNextSession } = await import("./data");
    const day = await seedPlanDay("Cardio");
    const w = await openSession(day.id, ago(26));
    await db.insert(schema.sets).values({
      workoutId: w.id,
      exerciseId: "0025",
      setNumber: 1,
      reps: 10,
      weight: 40,
      loggedAt: ago(25),
    });

    expect((await getNextSession())?.autoClosed).toHaveLength(1);
    expect((await getNextSession())?.autoClosed).toEqual([]);
  });
});
