import { desc, eq, inArray } from "drizzle-orm";
import { getDb, isUndefinedTable, schema } from "@/db";
import { getExercise, gifUrl, imageUrl } from "./exercises";
import { chooseNextPosition, type SessionHistoryEntry } from "./adapt";
import type { PlanExercise, Profile, SkipDecision, WorkoutStatus } from "./types";

export async function getProfile(): Promise<(Profile & { id: number }) | null> {
  const db = await getDb();
  const rows = await db.select().from(schema.profile).limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    goal: r.goal as Profile["goal"],
    experience: r.experience as Profile["experience"],
    daysPerWeek: r.daysPerWeek,
    weekdays: r.weekdays,
    sessionMinutes: r.sessionMinutes,
    equipment: r.equipment,
    units: r.units as Profile["units"],
    cardioFinisher: r.cardioFinisher,
    cardioDay: r.cardioDay,
    weeklyActivities: r.weeklyActivities ?? [],
    restSeconds: r.restSeconds ?? 60,
  };
}

export interface ActivityRow {
  id: number;
  name: string;
  minutes: number;
  performedAt: Date;
}

export async function getActivities(): Promise<ActivityRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.activities)
    .orderBy(desc(schema.activities.id))
    .limit(200);
  return rows as ActivityRow[];
}

export interface PlanDayRow {
  id: number;
  planId: number;
  position: number;
  focus: string;
  exercises: PlanExercise[];
}

export async function getActivePlanDays(): Promise<PlanDayRow[]> {
  const db = await getDb();
  const plan = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.isActive, true))
    .orderBy(desc(schema.plans.id))
    .limit(1);
  if (plan.length === 0) return [];
  const days = await db
    .select()
    .from(schema.planDays)
    .where(eq(schema.planDays.planId, plan[0].id))
    .orderBy(schema.planDays.position);
  return days as PlanDayRow[];
}

export interface WorkoutRow {
  id: number;
  planDayId: number | null;
  exercises: PlanExercise[];
  status: WorkoutStatus;
  skipDecision: SkipDecision | null;
  foldedInto: number | null;
  targetMinutes: number | null;
  notes: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export async function getWorkouts(): Promise<WorkoutRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.workouts)
    .orderBy(schema.workouts.id);
  return rows as WorkoutRow[];
}

export async function getWorkout(id: number): Promise<WorkoutRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.workouts)
    .where(eq(schema.workouts.id, id))
    .limit(1);
  return (rows[0] as WorkoutRow) ?? null;
}

/**
 * Position of every plan day ever created, including retired plans — a
 * regenerated plan must not erase where the user was in the rotation.
 */
async function allPlanDayPositions(): Promise<Map<number, number>> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.planDays.id, position: schema.planDays.position })
    .from(schema.planDays);
  return new Map(rows.map((r) => [r.id, r.position]));
}

/**
 * Focus of every plan day ever created, including retired plans. A summary of a
 * past session has to keep its title after the plan is regenerated: `planDayId`
 * survives (it is `set null` only on delete, and plans are retired rather than
 * deleted), so looking only at the active plan would silently rename every
 * older session to "Workout".
 */
export async function planDayFocusById(): Promise<Map<number, string>> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.planDays.id, focus: schema.planDays.focus })
    .from(schema.planDays);
  return new Map(rows.map((r) => [r.id, r.focus]));
}

/** The plan day the user should do next, honoring shift-skips and recovery. */
export async function getNextSession(): Promise<{
  planDay: PlanDayRow;
  pendingFold: WorkoutRow | null;
  inProgress: WorkoutRow | null;
} | null> {
  const days = await getActivePlanDays();
  if (days.length === 0) return null;
  const workouts = await getWorkouts();

  const inProgress =
    workouts.filter((w) => w.status === "in_progress").at(-1) ?? null;

  const positionById = await allPlanDayPositions();
  const history: SessionHistoryEntry[] = workouts
    .filter((w) => w.planDayId !== null && positionById.has(w.planDayId))
    .map((w) => ({
      position: positionById.get(w.planDayId!)!,
      status: w.status,
      skipDecision: w.skipDecision,
      at: w.finishedAt ?? w.startedAt,
      // the snapshot, not the plan day — it survives regeneration and swaps
      exercises: w.exercises,
    }));

  const pos = chooseNextPosition(days, history);
  const planDay = days.find((d) => d.position === pos) ?? days[0];

  // a recent skip the user asked to fold into the next session
  const pendingFold =
    workouts
      .filter(
        (w) =>
          w.status === "skipped" &&
          w.skipDecision === "fold" &&
          w.foldedInto === null
      )
      .at(-1) ?? null;

  return { planDay, pendingFold, inProgress };
}

export interface SetRow {
  id: number;
  workoutId: number;
  exerciseId: string;
  setNumber: number;
  reps: number;
  weight: number;
  durationMin: number | null;
}

export async function getSetsForWorkout(workoutId: number): Promise<SetRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.sets)
    .where(eq(schema.sets.workoutId, workoutId))
    .orderBy(schema.sets.exerciseId, schema.sets.setNumber);
  return rows as SetRow[];
}

/** Everything the workout screen needs, serializable for the client. */
export interface SessionExerciseView {
  exerciseId: string;
  name: string;
  equipment: string;
  target: string;
  gifUrl: string;
  imageUrl: string;
  steps: string[];
  sets: number;
  repsLow: number;
  repsHigh: number;
  role: PlanExercise["role"];
  /** cardio only: target duration in minutes */
  minutes: number | null;
  logged: {
    id: number;
    setNumber: number;
    reps: number;
    weight: number;
    durationMin: number | null;
  }[];
  lastTime: { reps: number; weight: number; durationMin: number | null }[];
  /** the user's living setup note for this exercise ("seat height 4") */
  note: string | null;
}

export function toExerciseView(
  pe: PlanExercise,
  logged: SetRow[],
  lastTime: { reps: number; weight: number; durationMin: number | null }[],
  note: string | null
): SessionExerciseView | null {
  const ex = getExercise(pe.exerciseId);
  if (!ex) return null;
  return {
    exerciseId: ex.id,
    name: ex.name,
    equipment: ex.equipment,
    target: ex.target,
    gifUrl: gifUrl(ex),
    imageUrl: imageUrl(ex),
    steps: ex.steps,
    sets: pe.sets,
    repsLow: pe.repsLow,
    repsHigh: pe.repsHigh,
    role: pe.role,
    minutes: pe.minutes ?? null,
    logged: logged
      .filter((s) => s.exerciseId === pe.exerciseId)
      .map((s) => ({
        id: s.id,
        setNumber: s.setNumber,
        reps: s.reps,
        weight: s.weight,
        durationMin: s.durationMin,
      })),
    lastTime,
    note,
  };
}

/** Most recent completed workout's sets for an exercise (for prefill). */
export async function lastSetsFor(
  exerciseIds: string[]
): Promise<
  Map<string, { reps: number; weight: number; durationMin: number | null }[]>
> {
  const db = await getDb();
  const result = new Map<
    string,
    { reps: number; weight: number; durationMin: number | null }[]
  >();
  if (exerciseIds.length === 0) return result;

  const completed = await db
    .select()
    .from(schema.workouts)
    .where(eq(schema.workouts.status, "completed"))
    .orderBy(desc(schema.workouts.id))
    .limit(30);
  if (completed.length === 0) return result;

  for (const w of completed) {
    const remaining = exerciseIds.filter((id) => !result.has(id));
    if (remaining.length === 0) break;
    const rows = await db
      .select()
      .from(schema.sets)
      .where(eq(schema.sets.workoutId, w.id))
      .orderBy(schema.sets.setNumber);
    for (const id of remaining) {
      const mine = rows.filter((s) => s.exerciseId === id);
      if (mine.length > 0) {
        result.set(
          id,
          mine.map((s) => ({
            reps: s.reps,
            weight: s.weight,
            durationMin: s.durationMin,
          }))
        );
      }
    }
  }
  return result;
}

/** Living setup notes for a set of exercises, keyed by exercise id. */
export async function notesFor(
  exerciseIds: string[]
): Promise<Map<string, string>> {
  if (exerciseIds.length === 0) return new Map();
  const db = await getDb();
  try {
    const rows = await db
      .select()
      .from(schema.exerciseNotes)
      .where(inArray(schema.exerciseNotes.exerciseId, exerciseIds));
    return new Map(rows.map((r) => [r.exerciseId, r.note]));
  } catch (err) {
    // a deploy can briefly run ahead of its migration; a session without notes
    // beats a 500 mid-gym. Anything other than a missing table is a real fault.
    if (!isUndefinedTable(err)) throw err;
    console.error("notesFor: exercise_notes missing, continuing without notes");
    return new Map();
  }
}
