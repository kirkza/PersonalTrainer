import { describe, expect, it } from "vitest";
import {
  allTargets,
  exercises,
  getExercise,
  isSelectable,
  rawExercises,
} from "./exercises";
import { STEPS_OVERRIDES } from "./exercise-overrides";

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

describe("steps overrides", () => {
  it("replaces steps that describe a different movement than the picture", () => {
    const slide = getExercise("0730")!;
    // the upstream row starts "Start by standing with one foot on a platform"
    // while its image shows the supine version
    expect(slide.steps[0]).not.toMatch(/standing/i);
    expect(slide.steps[0]).toMatch(/lie on your back/i);
    expect(slide.steps).toHaveLength(5);
  });

  it("leaves every other field of an overridden row alone", () => {
    const slide = getExercise("0730")!;
    expect(slide.name).toBe("single leg platform slide");
    expect(slide.target).toBe("hamstrings");
    expect(slide.equipment).toBe("body weight");
    expect(slide.image).toContain("0730");
  });

  it("does not touch rows without an override", () => {
    const bench = getExercise("0025")!;
    expect(bench.steps[0]).toMatch(/lie flat on a bench/i);
  });

  it("overrides only ids that exist upstream", () => {
    for (const id of Object.keys(STEPS_OVERRIDES)) {
      expect(rawExercises.some((e) => e.id === id)).toBe(true);
    }
  });
});
