"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import {
  alternativesFor,
  compressSession,
  estimateMinutes,
  foldIntoSession,
} from "./adapt";
import { exercises, getExercise, gifUrl, imageUrl } from "./exercises";
import { generatePlan } from "./generator";
import {
  getActivePlanDays,
  getNextSession,
  getProfile,
  type PlanDayRow,
  type WorkoutRow,
} from "./data";
import type { PlanExercise, Profile, SkipDecision } from "./types";

async function savePlan(profile: Profile, seed: number) {
  const db = await getDb();
  const days = generatePlan(profile, exercises, seed);
  await db
    .update(schema.plans)
    .set({ isActive: false })
    .where(eq(schema.plans.isActive, true));
  const [plan] = await db
    .insert(schema.plans)
    .values({ isActive: true, params: { ...profile, seed } })
    .returning();
  await db.insert(schema.planDays).values(
    days.map((d, i) => ({
      planId: plan.id,
      position: i,
      focus: d.focus,
      exercises: d.exercises,
    }))
  );
}

export async function completeOnboarding(profile: Profile) {
  const db = await getDb();
  await db
    .insert(schema.profile)
    .values({ id: 1, ...profile })
    .onConflictDoUpdate({
      target: schema.profile.id,
      set: { ...profile, updatedAt: new Date() },
    });
  await savePlan(profile, Date.now() % 100000);
  revalidatePath("/");
  redirect("/");
}

export async function updateSettings(profile: Profile, regenerate: boolean) {
  const db = await getDb();
  await db
    .update(schema.profile)
    .set({ ...profile, updatedAt: new Date() })
    .where(eq(schema.profile.id, 1));
  if (regenerate) await savePlan(profile, Date.now() % 100000);
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/settings");
}

export async function regeneratePlan() {
  const profile = await getProfile();
  if (!profile) redirect("/onboarding");
  await savePlan(profile, Date.now() % 100000);
  revalidatePath("/");
  revalidatePath("/plan");
}

/** Create the in-progress session row for a plan day; returns its workout id. */
async function beginSession(
  planDay: PlanDayRow,
  pendingFold: WorkoutRow | null,
  targetMinutes: number | null
): Promise<number> {
  const db = await getDb();
  let sessionExercises: PlanExercise[] = planDay.exercises;
  if (pendingFold) {
    sessionExercises = foldIntoSession(sessionExercises, pendingFold.exercises);
  }
  if (targetMinutes && targetMinutes < estimateMinutes(sessionExercises)) {
    sessionExercises = compressSession(sessionExercises, targetMinutes);
  }

  const [workout] = await db
    .insert(schema.workouts)
    .values({
      planDayId: planDay.id,
      exercises: sessionExercises,
      status: "in_progress",
      targetMinutes,
    })
    .returning();

  if (pendingFold) {
    await db
      .update(schema.workouts)
      .set({ foldedInto: workout.id })
      .where(eq(schema.workouts.id, pendingFold.id));
  }
  return workout.id;
}

export async function startWorkout(targetMinutes: number | null) {
  const next = await getNextSession();
  if (!next) redirect("/onboarding");
  if (next.inProgress) redirect(`/workout/${next.inProgress.id}`);

  const workoutId = await beginSession(
    next.planDay,
    next.pendingFold,
    targetMinutes
  );
  revalidatePath("/");
  redirect(`/workout/${workoutId}`);
}

/**
 * Train a different plan day than the one prescribed — for when the prescribed
 * session doesn't suit how you feel. The prescribed day is set aside with a
 * "shift" so it comes back next: swapping trades the order, it doesn't cost
 * you the session.
 */
export async function swapSession(planDayId: number) {
  const db = await getDb();
  const next = await getNextSession();
  if (!next) redirect("/onboarding");
  if (next.inProgress) redirect(`/workout/${next.inProgress.id}`);

  const chosen = (await getActivePlanDays()).find((d) => d.id === planDayId);
  // reachable: the plan can be regenerated while the swap sheet sits open
  if (!chosen) redirect("/");

  // Only when the pick differs from the prescription. A shift row for a position
  // that is about to be completed would never clear — the pending-shift rule is
  // position-scoped — and distinct plan-day ids in one plan mean distinct
  // positions, so this guard is what keeps the two inserts independent. Their
  // order does not matter.
  if (chosen.id !== next.planDay.id) {
    await db.insert(schema.workouts).values({
      planDayId: next.planDay.id,
      exercises: next.planDay.exercises,
      status: "skipped",
      skipDecision: "shift",
      finishedAt: new Date(),
    });
  }

  // full length: the short-session options stay with the prescribed session
  const workoutId = await beginSession(chosen, next.pendingFold, null);
  revalidatePath("/");
  redirect(`/workout/${workoutId}`);
}

export async function skipNextSession(decision: SkipDecision) {
  const db = await getDb();
  const next = await getNextSession();
  if (!next) redirect("/onboarding");
  await db.insert(schema.workouts).values({
    planDayId: next.planDay.id,
    exercises: next.planDay.exercises,
    status: "skipped",
    skipDecision: decision,
    finishedAt: new Date(),
  });
  revalidatePath("/");
}

export async function logSet(
  workoutId: number,
  exerciseId: string,
  setNumber: number,
  reps: number,
  weight: number,
  durationMin?: number
) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.sets)
    .values({
      workoutId,
      exerciseId,
      setNumber,
      reps,
      weight,
      durationMin: durationMin ?? null,
    })
    .returning();
  return { id: row.id };
}

export async function deleteSet(setId: number) {
  const db = await getDb();
  await db.delete(schema.sets).where(eq(schema.sets.id, setId));
}

export async function logActivity(name: string, minutes: number) {
  const trimmed = name.trim();
  if (!trimmed || !minutes || minutes < 1) return;
  const db = await getDb();
  await db
    .insert(schema.activities)
    .values({ name: trimmed, minutes: Math.round(minutes) });
  revalidatePath("/");
  revalidatePath("/progress");
}

export async function deleteActivity(id: number) {
  const db = await getDb();
  await db.delete(schema.activities).where(eq(schema.activities.id, id));
  revalidatePath("/");
  revalidatePath("/progress");
}

export async function finishWorkout(workoutId: number) {
  const db = await getDb();
  // duration is derived from startedAt/finishedAt wherever it's displayed
  await db
    .update(schema.workouts)
    .set({ status: "completed", finishedAt: new Date() })
    .where(eq(schema.workouts.id, workoutId));
  revalidatePath("/");
  revalidatePath("/progress");
  redirect(`/workout/${workoutId}/summary`);
}

export async function discardWorkout(workoutId: number) {
  const db = await getDb();
  await db.delete(schema.workouts).where(eq(schema.workouts.id, workoutId));
  revalidatePath("/");
  redirect("/");
}

export interface AlternativeView {
  id: string;
  name: string;
  equipment: string;
  target: string;
  gifUrl: string;
  imageUrl: string;
  /** shares the original's movement pattern, so it belongs in "closest" */
  samePattern: boolean;
  /** how it differs from the exercise being replaced */
  detail: string;
}

export async function getAlternatives(
  exerciseId: string
): Promise<AlternativeView[]> {
  const profile = await getProfile();
  const alts = alternativesFor(exerciseId, profile?.equipment ?? [], 12);
  return alts.map((a) => ({
    id: a.exercise.id,
    name: a.exercise.name,
    equipment: a.exercise.equipment,
    target: a.exercise.target,
    gifUrl: gifUrl(a.exercise),
    imageUrl: imageUrl(a.exercise),
    samePattern: a.samePattern,
    detail: a.detail,
  }));
}

function replaceExercise(
  list: PlanExercise[],
  oldId: string,
  newId: string
): PlanExercise[] {
  return list.map((e) =>
    e.exerciseId === oldId ? { ...e, exerciseId: newId } : e
  );
}

/** Swap inside a live workout; optionally also update the plan ("always"). */
export async function swapInWorkout(
  workoutId: number,
  oldId: string,
  newId: string,
  always: boolean
) {
  if (!getExercise(newId)) return;
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.workouts)
    .where(eq(schema.workouts.id, workoutId))
    .limit(1);
  if (rows.length === 0) return;
  await db
    .update(schema.workouts)
    .set({ exercises: replaceExercise(rows[0].exercises, oldId, newId) })
    .where(eq(schema.workouts.id, workoutId));
  if (always && rows[0].planDayId) {
    await swapInPlanDay(rows[0].planDayId, oldId, newId);
  }
  revalidatePath(`/workout/${workoutId}`);
}

export async function swapInPlanDay(
  planDayId: number,
  oldId: string,
  newId: string
) {
  if (!getExercise(newId)) return;
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.planDays)
    .where(eq(schema.planDays.id, planDayId))
    .limit(1);
  if (rows.length === 0) return;
  await db
    .update(schema.planDays)
    .set({ exercises: replaceExercise(rows[0].exercises, oldId, newId) })
    .where(eq(schema.planDays.id, planDayId));
  revalidatePath("/plan");
  revalidatePath("/");
}
