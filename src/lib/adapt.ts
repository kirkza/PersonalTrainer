import { exercises, getExercise, type Exercise } from "./exercises";
import type { PlanExercise, SkipDecision, WorkoutStatus } from "./types";

/** Rough session time model: 5 min warm-up + ~3 min per set including rest. */
export function estimateMinutes(exs: PlanExercise[]): number {
  if (exs.length === 0) return 0;
  const totalSets = exs.reduce((sum, e) => sum + e.sets, 0);
  return 5 + totalSets * 3;
}

/**
 * Fit a session into a smaller time budget without losing the point of it:
 * drop accessories from the end, then trim sets down to 2, then drop
 * whatever still doesn't fit. Primaries are the last thing to go.
 */
export function compressSession(
  exs: PlanExercise[],
  targetMinutes: number
): PlanExercise[] {
  if (estimateMinutes(exs) <= targetMinutes) return exs;
  const out = exs.map((e) => ({ ...e }));
  const fits = () => estimateMinutes(out) <= targetMinutes;

  while (!fits() && out.length > 2) {
    const idx = out.map((e) => e.role).lastIndexOf("accessory");
    if (idx < 0) break;
    out.splice(idx, 1);
  }
  for (let i = out.length - 1; i >= 0 && !fits(); i--) {
    out[i].sets = Math.min(out[i].sets, 2);
  }
  while (!fits() && out.length > 1) out.pop();
  return out;
}

export interface SessionHistoryEntry {
  position: number;
  status: WorkoutStatus;
  skipDecision?: SkipDecision | null;
}

/**
 * Which plan day comes next? Sessions run in sequence; completing (or
 * dropping/folding a skipped) session advances the pointer, while a session
 * skipped with "shift" stays next — the whole week slides instead.
 */
export function nextPosition(
  dayCount: number,
  history: SessionHistoryEntry[]
): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.status === "in_progress") continue;
    if (h.status === "skipped" && h.skipDecision === "shift") return h.position;
    return (h.position + 1) % dayCount;
  }
  return 0;
}

/** Merge a missed session's key lifts into the next one (max 2, light sets). */
export function foldIntoSession(
  next: PlanExercise[],
  missed: PlanExercise[]
): PlanExercise[] {
  const existing = new Set(next.map((e) => e.exerciseId));
  const folded = missed
    .filter((e) => e.role === "primary" && !existing.has(e.exerciseId))
    .slice(0, 2)
    .map((e) => ({ ...e, sets: Math.min(e.sets, 2) }));
  return [...folded, ...next];
}

const EQUIPMENT_RANK: Record<string, number> = {
  barbell: 6,
  "olympic barbell": 6,
  dumbbell: 5,
  cable: 4,
  "leverage machine": 4,
  "trap bar": 4,
  "ez barbell": 3,
  "smith machine": 3,
  "body weight": 3,
  weighted: 2,
  kettlebell: 2,
  assisted: 2,
  "sled machine": 2,
  band: 1,
  "resistance band": 1,
};

export function equipmentRank(equipment: string): number {
  return EQUIPMENT_RANK[equipment] ?? 0;
}

/**
 * Substitutes for an exercise: same target muscle, ranked by matching the
 * user's gym equipment, same body part, and sturdier equipment. Falls back
 * to all equipment when the user's gear can't hit that muscle.
 */
export function alternativesFor(
  exerciseId: string,
  equipment: string[],
  limit = 10
): Exercise[] {
  const original = getExercise(exerciseId);
  if (!original) return [];
  const sameTarget = exercises.filter(
    (e) => e.target === original.target && e.id !== original.id
  );
  const withGear = sameTarget.filter((e) => equipment.includes(e.equipment));
  const pool = withGear.length > 0 ? withGear : sameTarget;
  return pool
    .map((e) => ({
      e,
      score:
        (e.bodyPart === original.bodyPart ? 4 : 0) + equipmentRank(e.equipment),
    }))
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e);
}
