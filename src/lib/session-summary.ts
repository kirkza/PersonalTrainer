import type { SetRow, WorkoutRow } from "./data";
import type { Profile } from "./types";

/** A session left open overnight shouldn't be reported as a 9-hour workout. */
const MAX_PLAUSIBLE_MIN = 240;

/**
 * Wall-clock length of a session in whole minutes, or null when it can't be
 * trusted: no finish timestamp, a negative span, or longer than 4 hours.
 */
export function sessionDurationMin(
  startedAt: Date,
  finishedAt: Date | null
): number | null {
  if (!finishedAt) return null;
  const min = Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000);
  return min >= 0 && min <= MAX_PLAUSIBLE_MIN ? min : null;
}

export interface SessionSummary {
  /** null when the duration can't be trusted — render a dash, not a number */
  durationMin: number | null;
  targetMinutes: number;
  liftingSets: number;
  volume: number;
  cardioMin: number;
  exercisesDone: number;
}

/**
 * Headline numbers for one finished session. Cardio sets share the `sets`
 * table but carry a duration instead of reps×weight, so they're kept out of
 * the lifting tallies — otherwise they'd be counted in two tiles at once.
 */
export function summarizeSession(
  workout: Pick<WorkoutRow, "startedAt" | "finishedAt" | "targetMinutes">,
  sets: SetRow[],
  profile: Pick<Profile, "sessionMinutes">
): SessionSummary {
  const lifting = sets.filter((s) => s.durationMin === null);
  return {
    durationMin: sessionDurationMin(workout.startedAt, workout.finishedAt),
    // mirrors how WorkoutSession picks the target for its live clock
    targetMinutes: workout.targetMinutes ?? profile.sessionMinutes,
    liftingSets: lifting.length,
    volume: Math.round(lifting.reduce((sum, s) => sum + s.reps * s.weight, 0)),
    cardioMin: sets.reduce((sum, s) => sum + (s.durationMin ?? 0), 0),
    exercisesDone: new Set(sets.map((s) => s.exerciseId)).size,
  };
}
