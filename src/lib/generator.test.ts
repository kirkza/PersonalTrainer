import { describe, expect, it } from "vitest";
import { generatePlan } from "./generator";
import { estimateMinutes } from "./adapt";
import { exercises, getExercise } from "./exercises";
import type { Profile } from "./types";

const base: Profile = {
  goal: "hypertrophy",
  experience: "intermediate",
  daysPerWeek: 4,
  weekdays: [0, 1, 3, 4],
  sessionMinutes: 60,
  equipment: ["barbell", "dumbbell", "cable", "leverage machine", "body weight"],
  units: "kg",
  cardioFinisher: false,
  cardioDay: false,
  weeklyActivities: [],
  restSeconds: 60,
};

describe("generatePlan", () => {
  it("produces one day per training day", () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const plan = generatePlan({ ...base, daysPerWeek: days }, exercises, 1);
      expect(plan).toHaveLength(days);
    }
  });

  it("uses the right split for the frequency", () => {
    expect(
      generatePlan({ ...base, daysPerWeek: 3 }, exercises, 1).map((d) => d.focus)
    ).toEqual(["Full Body A", "Full Body B", "Full Body C"]);
    expect(
      generatePlan({ ...base, daysPerWeek: 4 }, exercises, 1).map((d) => d.focus)
    ).toEqual(["Upper A", "Lower A", "Upper B", "Lower B"]);
    expect(
      generatePlan({ ...base, daysPerWeek: 6 }, exercises, 1).map((d) => d.focus)
    ).toEqual(["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"]);
  });

  it("never prescribes equipment the user does not have", () => {
    const restricted: Profile = {
      ...base,
      equipment: ["dumbbell", "body weight"],
    };
    const plan = generatePlan(restricted, exercises, 42);
    for (const day of plan) {
      for (const pe of day.exercises) {
        const ex = getExercise(pe.exerciseId);
        expect(ex).toBeDefined();
        expect(restricted.equipment).toContain(ex!.equipment);
      }
    }
  });

  it("fits each session in the time budget", () => {
    for (const minutes of [30, 45, 60, 90]) {
      const plan = generatePlan({ ...base, sessionMinutes: minutes }, exercises, 7);
      for (const day of plan) {
        expect(estimateMinutes(day.exercises)).toBeLessThanOrEqual(minutes);
      }
    }
  });

  it("gives every day at least one primary and no duplicate exercises", () => {
    const plan = generatePlan(base, exercises, 3);
    for (const day of plan) {
      expect(day.exercises.length).toBeGreaterThanOrEqual(2);
      expect(day.exercises.some((e) => e.role === "primary")).toBe(true);
      const ids = day.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("matches rep ranges to the goal", () => {
    const strength = generatePlan({ ...base, goal: "strength" }, exercises, 1);
    for (const pe of strength.flatMap((d) => d.exercises)) {
      if (pe.role === "primary") {
        expect(pe.repsLow).toBeLessThanOrEqual(6);
      }
    }
    const general = generatePlan({ ...base, goal: "general" }, exercises, 1);
    for (const pe of general.flatMap((d) => d.exercises)) {
      expect(pe.repsLow).toBeGreaterThanOrEqual(8);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generatePlan(base, exercises, 99);
    const b = generatePlan(base, exercises, 99);
    expect(a).toEqual(b);
  });

  it("appends a ~10 min cardio finisher that still fits the budget", () => {
    const plan = generatePlan({ ...base, cardioFinisher: true }, exercises, 5);
    for (const day of plan) {
      const last = day.exercises.at(-1)!;
      expect(last.role).toBe("cardio");
      expect(last.minutes).toBe(10);
      expect(estimateMinutes(day.exercises)).toBeLessThanOrEqual(
        base.sessionMinutes
      );
    }
  });

  it("adds a dedicated cardio day in place of one lifting day", () => {
    const plan = generatePlan({ ...base, cardioDay: true }, exercises, 5);
    expect(plan).toHaveLength(4);
    expect(plan.slice(0, 3).map((d) => d.focus)).toEqual([
      "Full Body A",
      "Full Body B",
      "Full Body C",
    ]);
    const cardio = plan[3];
    expect(cardio.focus).toBe("Cardio");
    expect(cardio.exercises.length).toBeGreaterThan(0);
    for (const e of cardio.exercises) {
      expect(e.role).toBe("cardio");
      expect(e.minutes).toBeGreaterThanOrEqual(5);
    }
  });

  it("skips the cardio day when training fewer than 3 days", () => {
    const plan = generatePlan(
      { ...base, daysPerWeek: 2, cardioDay: true },
      exercises,
      5
    );
    expect(plan.map((d) => d.focus)).toEqual(["Full Body A", "Full Body B"]);
  });
});
