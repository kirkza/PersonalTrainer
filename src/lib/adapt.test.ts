import { describe, expect, it } from "vitest";
import {
  alternativesFor,
  chooseNextPosition,
  compressSession,
  estimateMinutes,
  foldIntoSession,
  nextPosition,
  type PlanDaySummary,
  type SessionHistoryEntry,
} from "./adapt";
import { exercises } from "./exercises";
import type { PlanExercise } from "./types";

const pe = (
  id: string,
  role: "primary" | "accessory",
  sets = 3
): PlanExercise => ({
  exerciseId: id,
  sets,
  repsLow: 8,
  repsHigh: 12,
  role,
});

const cardio = (id: string, minutes: number): PlanExercise => ({
  exerciseId: id,
  sets: 1,
  repsLow: 0,
  repsHigh: 0,
  role: "cardio",
  minutes,
});

const session: PlanExercise[] = [
  pe("0001", "primary", 4),
  pe("0002", "primary", 4),
  pe("0003", "accessory", 3),
  pe("0004", "accessory", 3),
  pe("0005", "accessory", 3),
];

describe("compressSession", () => {
  it("returns the session untouched when it already fits", () => {
    expect(compressSession(session, 120)).toEqual(session);
  });

  it("fits the time budget by dropping accessories first", () => {
    const out = compressSession(session, 45);
    expect(estimateMinutes(out)).toBeLessThanOrEqual(45);
    // all primaries survive
    expect(out.filter((e) => e.role === "primary")).toHaveLength(2);
  });

  it("trims sets when dropping accessories is not enough", () => {
    const out = compressSession(session, 25);
    expect(estimateMinutes(out)).toBeLessThanOrEqual(25);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.some((e) => e.role === "primary")).toBe(true);
  });

  it("preserves exercise order", () => {
    const out = compressSession(session, 45);
    const ids = out.map((e) => e.exerciseId);
    expect(ids).toEqual([...ids].sort());
  });

  it("drops the cardio finisher before touching accessories", () => {
    const withFinisher = [...session, cardio("0900", 10)];
    const out = compressSession(withFinisher, 55);
    expect(out.some((e) => e.role === "cardio")).toBe(false);
    // accessories only trimmed as far as needed after cardio went first
    expect(estimateMinutes(out)).toBeLessThanOrEqual(55);
  });

  it("scales a pure cardio session down instead of emptying it", () => {
    const out = compressSession([cardio("0900", 15), cardio("0901", 15)], 25);
    expect(out.length).toBe(2);
    expect(estimateMinutes(out)).toBeLessThanOrEqual(25);
    for (const e of out) expect(e.minutes).toBeGreaterThanOrEqual(5);
  });

  it("counts cardio minutes in the time estimate", () => {
    expect(estimateMinutes([cardio("0900", 10)])).toBe(15);
  });
});

describe("nextPosition", () => {
  it("starts at 0 with no history", () => {
    expect(nextPosition(4, [])).toBe(0);
  });

  it("advances after a completed session", () => {
    expect(nextPosition(4, [{ position: 0, status: "completed" }])).toBe(1);
  });

  it("wraps around at the end of the week", () => {
    expect(nextPosition(4, [{ position: 3, status: "completed" }])).toBe(0);
  });

  it("stays on a session skipped with 'shift'", () => {
    expect(
      nextPosition(4, [
        { position: 0, status: "completed" },
        { position: 1, status: "skipped", skipDecision: "shift" },
      ])
    ).toBe(1);
  });

  it("advances past sessions skipped with 'fold' or 'drop'", () => {
    expect(
      nextPosition(4, [
        { position: 0, status: "skipped", skipDecision: "fold" },
      ])
    ).toBe(1);
    expect(
      nextPosition(4, [
        { position: 0, status: "skipped", skipDecision: "drop" },
      ])
    ).toBe(1);
  });

  it("clamps a position carried over from a longer previous cycle", () => {
    // last plan had 6 days; the new one has 4 — position 5 must stay in range
    expect(
      nextPosition(4, [
        { position: 5, status: "skipped", skipDecision: "shift" },
      ])
    ).toBe(1);
  });

  it("keeps a shifted session next even after another one is trained", () => {
    expect(
      nextPosition(4, [
        { position: 1, status: "skipped", skipDecision: "shift" },
        { position: 2, status: "completed" },
      ])
    ).toBe(1);
  });

  it("releases a shifted session once it has been trained", () => {
    expect(
      nextPosition(4, [
        { position: 1, status: "skipped", skipDecision: "shift" },
        { position: 2, status: "completed" },
        { position: 1, status: "completed" },
      ])
    ).toBe(2);
  });

  it("offers the longest-outstanding session when two are shifted", () => {
    expect(
      nextPosition(4, [
        { position: 0, status: "skipped", skipDecision: "shift" },
        { position: 1, status: "skipped", skipDecision: "shift" },
        { position: 2, status: "completed" },
      ])
    ).toBe(0);
  });

  it("holds the shifted session while its own workout is in progress", () => {
    expect(
      nextPosition(4, [
        { position: 1, status: "skipped", skipDecision: "shift" },
        { position: 1, status: "in_progress" },
      ])
    ).toBe(1);
  });
});

// ---- muscle-recovery aware scheduling -------------------------------------

const idFor = (target: string) => exercises.find((e) => e.target === target)!.id;

const dayOf = (position: number, targets: string[]): PlanDaySummary => ({
  position,
  exercises: targets.map((t, i) => ({
    exerciseId: idFor(t),
    sets: 3,
    repsLow: 8,
    repsHigh: 12,
    role: i < 2 ? "primary" : "accessory",
  })),
});

const UPPER_A = ["pectorals", "lats", "delts", "triceps"];
const UPPER_B = ["delts", "pectorals", "lats", "biceps"];
const LOWER_A = ["quads", "hamstrings", "glutes", "calves"];
const LOWER_B = ["hamstrings", "glutes", "quads", "calves"];

const upperLowerPlan: PlanDaySummary[] = [
  dayOf(0, UPPER_A),
  dayOf(1, LOWER_A),
  dayOf(2, UPPER_B),
  dayOf(3, LOWER_B),
];

const NOW = new Date("2026-07-26T18:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 3600 * 1000);

const trained = (
  position: number,
  targets: string[],
  at: Date
): SessionHistoryEntry => ({
  position,
  status: "completed",
  at,
  exercises: dayOf(position, targets).exercises,
});

describe("chooseNextPosition", () => {
  it("follows the plan sequence when nothing collides", () => {
    expect(
      chooseNextPosition(
        upperLowerPlan,
        [trained(0, UPPER_A, daysAgo(1))],
        NOW
      )
    ).toBe(1);
  });

  it("does not stack a second upper day on top of yesterday's upper day", () => {
    // Upper A done yesterday, Lower A skipped — the sequence points at Upper B
    const history: SessionHistoryEntry[] = [
      trained(0, UPPER_A, daysAgo(1)),
      { position: 1, status: "skipped", skipDecision: "drop", at: daysAgo(0) },
    ];
    expect(nextPosition(4, history)).toBe(2); // raw sequence: Upper B
    expect(chooseNextPosition(upperLowerPlan, history, NOW)).toBe(3); // Lower B
  });

  it("allows the same muscles again once they have had a rest day", () => {
    const history: SessionHistoryEntry[] = [
      trained(0, UPPER_A, daysAgo(3)),
      { position: 1, status: "skipped", skipDecision: "drop", at: daysAgo(3) },
    ];
    expect(chooseNextPosition(upperLowerPlan, history, NOW)).toBe(2);
  });

  it("keeps the sequence day when every day overlaps (full-body plan)", () => {
    const fullBody = [
      dayOf(0, ["quads", "pectorals", "lats", "delts"]),
      dayOf(1, ["glutes", "delts", "pectorals", "quads"]),
    ];
    const history = [trained(0, ["quads", "pectorals", "lats", "delts"], daysAgo(0))];
    expect(chooseNextPosition(fullBody, history, NOW)).toBe(1);
  });

  it("resumes where the user left off after the plan is regenerated", () => {
    // history carries a position from the plan that was just replaced
    const history = [trained(2, UPPER_B, daysAgo(1))];
    expect(chooseNextPosition(upperLowerPlan, history, NOW)).toBe(3);
  });

  it("skips ahead rather than repeating upper body the day after a reset", () => {
    // the old plan's last day was an upper day; the new plan's day 0 is too
    const history = [trained(3, UPPER_B, daysAgo(1))];
    expect(nextPosition(4, history)).toBe(0); // raw sequence: Upper A
    expect(chooseNextPosition(upperLowerPlan, history, NOW)).toBe(1); // Lower A
  });

  it("ignores skipped sessions when working out what is still sore", () => {
    const history: SessionHistoryEntry[] = [
      { position: 0, status: "skipped", skipDecision: "drop", at: daysAgo(0), exercises: dayOf(0, UPPER_A).exercises },
    ];
    expect(chooseNextPosition(upperLowerPlan, history, NOW)).toBe(1);
  });
});

describe("foldIntoSession", () => {
  it("prepends up to two missed primaries with reduced sets", () => {
    const missed = [pe("0100", "primary", 4), pe("0101", "primary", 4), pe("0102", "accessory")];
    const next = [pe("0200", "primary", 4), pe("0201", "accessory")];
    const out = foldIntoSession(next, missed);
    expect(out.map((e) => e.exerciseId)).toEqual(["0100", "0101", "0200", "0201"]);
    expect(out[0].sets).toBeLessThanOrEqual(2);
  });

  it("does not duplicate an exercise already in the next session", () => {
    const missed = [pe("0200", "primary", 4)];
    const next = [pe("0200", "primary", 4), pe("0201", "accessory")];
    const out = foldIntoSession(next, missed);
    expect(out.filter((e) => e.exerciseId === "0200")).toHaveLength(1);
  });
});

describe("alternativesFor", () => {
  it("returns exercises targeting the same muscle, excluding the original", () => {
    const squat = exercises.find((e) => e.name === "barbell full squat")!;
    const alts = alternativesFor(squat.id, ["dumbbell", "body weight"], 10);
    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) {
      expect(alt.id).not.toBe(squat.id);
      expect(alt.target).toBe(squat.target);
      expect(["dumbbell", "body weight"]).toContain(alt.equipment);
    }
  });

  it("falls back to any equipment when the user's gear has no match", () => {
    // adductors is the smallest pool, and none of it uses a tire
    const rare = exercises.find((e) => e.target === "adductors")!;
    const alts = alternativesFor(rare.id, ["tire"], 10);
    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) {
      expect(alt.target).toBe("adductors");
      expect(alt.equipment).not.toBe("tire");
    }
  });
});
