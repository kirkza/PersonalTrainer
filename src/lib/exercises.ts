import raw from "@/data/exercises.slim.json";
import {
  STEPS_OVERRIDES,
  TARGET_OVERRIDES,
  isSelectable,
} from "./exercise-overrides";

export { isSelectable };

export interface Exercise {
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  image: string;
  gifUrl: string;
  steps: string[];
}

export const MEDIA_BASE =
  "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/";

/** Every row, corrections applied but nothing filtered out. */
export const rawExercises: Exercise[] = (raw as Exercise[]).map((e) => {
  const target = TARGET_OVERRIDES[e.id];
  const steps = STEPS_OVERRIDES[e.id];
  if (!target && !steps) return e;
  return { ...e, ...(target ? { target } : {}), ...(steps ? { steps } : {}) };
});

/**
 * Rows the generator and the swap sheet may choose from. Narrower than
 * `rawExercises`: see `exercise-overrides.ts` for what is held back and why.
 */
export const exercises = rawExercises.filter(isSelectable);

// keyed on every row, not just selectable ones — plans and logged sets saved
// before a row was blocklisted must still render
const byId = new Map(rawExercises.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return byId.get(id);
}

export function imageUrl(e: Exercise): string {
  return MEDIA_BASE + e.image;
}

export function gifUrl(e: Exercise): string {
  return MEDIA_BASE + e.gifUrl;
}

function distinct(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export const allEquipment = distinct(exercises.map((e) => e.equipment));
export const allBodyParts = distinct(exercises.map((e) => e.bodyPart));
export const allTargets = distinct(exercises.map((e) => e.target));
