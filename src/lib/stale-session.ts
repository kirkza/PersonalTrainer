/**
 * Finishing a workout is a manual tap, and it is easy to leave the gym without
 * it. A session left `in_progress` captures the next visit — the home card and
 * `startWorkout` both resume it — and stalls the day rotation, which skips
 * sessions still in progress.
 */

/**
 * Nothing for six hours means the session was abandoned, not paused. Longer
 * than any real session (durations above four hours are already treated as
 * implausible), short enough to catch forgetting on the same day, and it leaves
 * an overnight session started at 23:00 and resumed at 00:30 alone.
 */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type StaleAction =
  | { action: "keep" }
  /** close it, dated to when the work actually stopped */
  | { action: "finish"; finishedAt: Date }
  /** nothing was logged, so there is nothing worth keeping */
  | { action: "discard" };

/**
 * @param startedAt when the session began
 * @param lastSetAt newest logged set, or null when none were logged
 */
export function staleSessionAction(
  startedAt: Date,
  lastSetAt: Date | null,
  now: Date
): StaleAction {
  const lastActivity = lastSetAt ?? startedAt;
  if (now.getTime() - lastActivity.getTime() < STALE_AFTER_MS) {
    return { action: "keep" };
  }
  // an empty session would otherwise count on Progress and move the rotation on
  // for work that never happened
  if (lastSetAt === null) return { action: "discard" };
  return { action: "finish", finishedAt: lastSetAt };
}
