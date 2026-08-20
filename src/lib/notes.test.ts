import { describe, expect, it } from "vitest";
import { clampNote, NOTE_MAX_LENGTH, normalizeNote } from "./notes";
import { toExerciseView } from "./data";
import { exercises } from "./exercises";
import type { PlanExercise } from "./types";

describe("normalizeNote", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeNote("  seat height 4, pin 12 ")).toBe("seat height 4, pin 12");
  });

  it("treats an emptied note as a deletion", () => {
    expect(normalizeNote("")).toBeNull();
    expect(normalizeNote("   \n\t")).toBeNull();
  });
});

describe("clampNote", () => {
  it("keeps ordinary notes untouched", () => {
    expect(clampNote("rack pin 7")).toBe("rack pin 7");
  });

  it("cuts a pasted wall of text down to the cap", () => {
    expect(clampNote("x".repeat(NOTE_MAX_LENGTH + 50))).toHaveLength(NOTE_MAX_LENGTH);
  });
});

describe("toExerciseView note passthrough", () => {
  const pe: PlanExercise = {
    exerciseId: exercises[0].id,
    sets: 3,
    repsLow: 8,
    repsHigh: 12,
    role: "primary",
  };

  it("carries the exercise's note into the view", () => {
    const view = toExerciseView(pe, [], [], "seat height 4");
    expect(view?.note).toBe("seat height 4");
  });

  it("leaves the note null when there is none", () => {
    const view = toExerciseView(pe, [], [], null);
    expect(view?.note).toBeNull();
  });
});
