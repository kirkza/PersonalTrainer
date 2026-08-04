import { describe, expect, it } from "vitest";
import {
  allTargets,
  exercises,
  getExercise,
  isSelectable,
  rawExercises,
} from "./exercises";

describe("selectable pool", () => {
  it("drops rows whose name is just a muscle name", () => {
    const muscleWords = new Set(
      rawExercises.flatMap((e) => [e.target, e.bodyPart])
    );
    for (const e of exercises) {
      expect(muscleWords.has(e.name.trim())).toBe(false);
    }
    // 3533 in the upstream dataset is literally named "quads"
    expect(exercises.some((e) => e.id === "3533")).toBe(false);
  });

  it("drops stretches and yoga poses that cannot be programmed as sets", () => {
    const allowed = new Set(["3642"]); // see NON_STRENGTH_EXCEPTIONS
    const kept = exercises
      .filter((e) => !allowed.has(e.id))
      .filter((e) => /\b(stretch|stretches|mobility|pose|yoga)\b/i.test(e.name));
    expect(kept.map((e) => `${e.id} ${e.name}`)).toEqual([]);
  });

  it("keeps loaded lifts that merely mention stretch", () => {
    // "stretch lunge" is a long-stride lunge, not a mobility drill
    expect(exercises.some((e) => e.id === "3642")).toBe(true);
    expect(isSelectable(getExercise("3642")!)).toBe(true);
  });

  it("still resolves excluded rows by id so logged history renders", () => {
    // a plan saved before the blocklist may reference these
    expect(getExercise("3533")?.name).toBe("quads");
    expect(getExercise("1512")?.name).toBe("all fours squad stretch");
  });

  it("corrects mislabeled target muscles", () => {
    const cases: [string, string][] = [
      ["0459", "abs"], // flutter kicks, labeled glutes
      ["0858", "cardiovascular system"], // wind sprints, labeled abs
      ["2139", "cardiovascular system"], // hands bike, labeled pectorals
      ["2142", "cardiovascular system"], // ski ergometer, labeled triceps
      ["3119", "quads"], // potty squat, labeled abs
      ["3662", "pectorals"], // pike-to-cobra push-up, labeled glutes
      ["2133", "traps"], // farmers walk, labeled quads
      ["0397", "forearms"], // dumbbell seated neutral wrist curl, labeled biceps
      ["3212", "abs"], // basic toe touch, labeled glutes
      ["3231", "abs"], // two toe touch, labeled spine
    ];
    for (const [id, target] of cases) {
      expect(getExercise(id)?.target, `exercise ${id}`).toBe(target);
    }
  });

  it("exposes only targets that survive the blocklist", () => {
    for (const t of allTargets) {
      expect(exercises.some((e) => e.target === t)).toBe(true);
    }
  });
});
