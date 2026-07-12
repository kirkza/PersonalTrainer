export type Goal = "strength" | "hypertrophy" | "general";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Units = "kg" | "lb";

export interface Profile {
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  /** 0 = Monday … 6 = Sunday */
  weekdays: number[];
  sessionMinutes: number;
  equipment: string[];
  units: Units;
  /** ~10 min of cardio appended to each lifting session */
  cardioFinisher: boolean;
  /** one training day becomes a dedicated cardio session (needs ≥3 days) */
  cardioDay: boolean;
}

/** One prescribed exercise inside a plan day or workout snapshot. */
export interface PlanExercise {
  exerciseId: string;
  sets: number;
  repsLow: number;
  repsHigh: number;
  /** primaries survive time compression; accessories get trimmed first,
   *  cardio finishers are dropped before accessories */
  role: "primary" | "accessory" | "cardio";
  /** cardio only: target duration — logged in minutes instead of reps×weight */
  minutes?: number;
}

export interface GeneratedDay {
  focus: string;
  exercises: PlanExercise[];
}

export type WorkoutStatus = "in_progress" | "completed" | "skipped";
/** What the user chose when skipping: shift = do this session next time,
 *  fold = merge its primaries into the next session, drop = just move on. */
export type SkipDecision = "shift" | "fold" | "drop";
