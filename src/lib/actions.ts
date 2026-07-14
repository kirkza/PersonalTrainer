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
import { getNextSession, getProfile } from "./data";
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

export async function startWorkout(targetMinutes: number | null) {
  const db = await getDb();
  const next = await getNextSession();
  if (!next) redirect("/onboarding");
  if (next.inProgress) redirect(`/workout/${next.inProgress.id}`);

  let sessionExercises: PlanExercise[] = next.planDay.exercises;
  if (next.pendingFold) {
    sessionExercises = foldIntoSession(
      sessionExercises,
      next.pendingFold.exercises
    );
  }
  if (targetMinutes && targetMinutes < estimateMinutes(sessionExercises)) {
    sessionExercises = compressSession(sessionExercises, targetMinutes);
  }

  const [workout] = await db
    .insert(schema.workouts)
    .values({
      planDayId: next.planDay.id,
      exercises: sessionExercises,
      status: "in_progress",
      targetMinutes,
    })
    .returning();

  if (next.pendingFold) {
    await db
      .update(schema.workouts)
      .set({ foldedInto: workout.id })
      .where(eq(schema.workouts.id, next.pendingFold.id));
  }
  revalidatePath("/");
  redirect(`/workout/${workout.id}`);
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
  redirect("/");
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
}

export async function getAlternatives(
  exerciseId: string
): Promise<AlternativeView[]> {
  const profile = await getProfile();
  const alts = alternativesFor(exerciseId, profile?.equipment ?? [], 12);
  return alts.map((e) => ({
    id: e.id,
    name: e.name,
    equipment: e.equipment,
    target: e.target,
    gifUrl: gifUrl(e),
    imageUrl: imageUrl(e),
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
