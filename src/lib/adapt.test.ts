import { describe, expect, it } from "vitest";
import {
  alternativesFor,
  compressSession,
  estimateMinutes,
  foldIntoSession,
  nextPosition,
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
    const rare = exercises.find((e) => e.target === "levator scapulae")!;
    const alts = alternativesFor(rare.id, ["tire"], 10);
    // levator scapulae has 2 exercises total; the other one should appear
    expect(alts.length).toBeGreaterThan(0);
  });
});
