import { exercises, getExercise, type Exercise } from "./exercises";
import type { PlanExercise, SkipDecision, WorkoutStatus } from "./types";

/** Rough session time model: 5 min warm-up + ~3 min per set including rest;
 *  cardio entries contribute their duration directly. */
export function estimateMinutes(exs: PlanExercise[]): number {
  if (exs.length === 0) return 0;
  const work = exs.reduce(
    (sum, e) => sum + (e.minutes ?? e.sets * 3),
    0
  );
  return 5 + work;
}

/**
 * Fit a session into a smaller time budget without losing the point of it:
 * drop cardio finishers, then accessories from the end, then trim sets down
 * to 2, then drop whatever still doesn't fit. Primaries are the last thing
 * to go. A pure-cardio session instead scales its durations down.
 */
export function compressSession(
  exs: PlanExercise[],
  targetMinutes: number
): PlanExercise[] {
  if (estimateMinutes(exs) <= targetMinutes) return exs;
  const out = exs.map((e) => ({ ...e }));
  const fits = () => estimateMinutes(out) <= targetMinutes;
  const hasLifting = out.some((e) => e.role !== "cardio");

  if (hasLifting) {
    // 1: cardio finishers are the first luxury to go
    while (!fits()) {
      const idx = out.map((e) => e.role).lastIndexOf("cardio");
      if (idx < 0) break;
      out.splice(idx, 1);
    }
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

  // pure cardio session: scale durations down proportionally (min 5 min each)
  const total = out.reduce((s, e) => s + (e.minutes ?? 0), 0);
  const available = Math.max(5, targetMinutes - 5);
  for (const e of out) {
    e.minutes = Math.max(5, Math.floor((e.minutes ?? 0) * (available / total)));
  }
  while (!fits() && out.length > 1) out.pop();
  return out;
}

export interface SessionHistoryEntry {
  position: number;
  status: WorkoutStatus;
  skipDecision?: SkipDecision | null;
  /** when the session happened — drives the muscle-recovery check */
  at?: Date;
  /** what the session prescribed, for muscle-overlap checks */
  exercises?: PlanExercise[];
}

/**
 * Has a shifted-aside day been dealt with? Training it clears it, and so does
 * dropping or folding it — those are the user saying "move on". Positions are
 * compared wrapped, because that is how the day was offered: a shift recorded
 * under a longer plan is offered as `position % dayCount`, so it has to be
 * clearable by finishing *that* day rather than an index no plan day can
 * produce any more.
 */
function shiftResolved(
  shift: SessionHistoryEntry,
  later: SessionHistoryEntry[],
  dayCount: number
): boolean {
  const offered = shift.position % dayCount;
  return later.some(
    (x) =>
      x.position % dayCount === offered &&
      (x.status === "completed" ||
        (x.status === "skipped" && x.skipDecision !== "shift"))
  );
}

/**
 * Which plan day comes next by sequence alone? Sessions run in order;
 * completing (or dropping/folding a skipped) session advances the pointer.
 * A session skipped with "shift" stays next until that day is actually
 * trained, so the week slides rather than losing the session. Positions are
 * wrapped, so history from a longer plan still lands inside the current one.
 */
export function nextPosition(
  dayCount: number,
  history: SessionHistoryEntry[]
): number {
  // A day shifted aside stays next until it's actually trained. Without this,
  // "do this session next time I train" is forgotten the moment you train
  // anything else — and a swapped-away day would vanish for a whole cycle.
  // Earliest pending shift first: the day put off longest comes back first.
  const pending = history.find(
    (h, i) =>
      h.status === "skipped" &&
      h.skipDecision === "shift" &&
      !shiftResolved(h, history.slice(i + 1), dayCount)
  );
  if (pending) return pending.position % dayCount;

  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.status === "in_progress") continue;
    return (h.position + 1) % dayCount;
  }
  return 0;
}

export interface PlanDaySummary {
  position: number;
  exercises: PlanExercise[];
}

/** Muscles a session trains under load. Cardio doesn't need recovery here. */
export function sessionMuscles(exs: PlanExercise[]): Set<string> {
  const out = new Set<string>();
  for (const e of exs) {
    if (e.role === "cardio") continue;
    const ex = getExercise(e.exerciseId);
    if (ex) out.add(ex.target);
  }
  return out;
}

/** Local calendar day as an integer, so "yesterday" is a simple subtraction. */
function calendarDay(d: Date): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** A session trained today or yesterday still counts as unrecovered. */
const RECOVERY_DAYS = 1;
/** Above this share of repeated muscles, a day is too soon to run again. */
const MAX_OVERLAP = 0.5;

function overlapRatio(dayMuscles: Set<string>, recent: Set<string>): number {
  if (dayMuscles.size === 0) return 0;
  let repeated = 0;
  for (const m of dayMuscles) if (recent.has(m)) repeated++;
  return repeated / dayMuscles.size;
}

/**
 * Which plan day to actually train next. Starts from the sequence pointer,
 * then rotates forward past any day that would hit muscles trained today or
 * yesterday — so skipping a leg day doesn't hand you two upper days back to
 * back, and regenerating the plan doesn't restart you on what you just did.
 * The skipped day stays in the rotation and comes back around.
 *
 * When every day overlaps (full-body splits), the sequence pointer wins:
 * there is no better day to offer.
 */
export function chooseNextPosition(
  days: PlanDaySummary[],
  history: SessionHistoryEntry[],
  now: Date = new Date()
): number {
  if (days.length === 0) return 0;
  const start = nextPosition(days.length, history);
  const today = calendarDay(now);

  const recent = new Set<string>();
  for (const h of history) {
    if (h.status !== "completed" || !h.at || !h.exercises) continue;
    if (today - calendarDay(h.at) > RECOVERY_DAYS) continue;
    for (const m of sessionMuscles(h.exercises)) recent.add(m);
  }
  if (recent.size === 0) return start;

  const byPosition = new Map(days.map((d) => [d.position, d]));
  for (let i = 0; i < days.length; i++) {
    const pos = (start + i) % days.length;
    const day = byPosition.get(pos);
    if (!day) continue;
    if (overlapRatio(sessionMuscles(day.exercises), recent) <= MAX_OVERLAP) {
      return pos;
    }
  }
  return start;
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
