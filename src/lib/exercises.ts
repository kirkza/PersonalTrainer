import raw from "@/data/exercises.slim.json";

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

export const exercises = raw as Exercise[];

const byId = new Map(exercises.map((e) => [e.id, e]));

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
