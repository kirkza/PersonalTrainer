import { describe, expect, it } from "vitest";
import { sessionDurationMin, summarizeSession } from "./session-summary";
import type { SetRow } from "./data";

const at = (iso: string) => new Date(iso);

const lift = (
  exerciseId: string,
  reps: number,
  weight: number,
  setNumber = 1
): SetRow => ({
  id: 1,
  workoutId: 1,
  exerciseId,
  setNumber,
  reps,
  weight,
  durationMin: null,
});

const cardio = (exerciseId: string, durationMin: number): SetRow => ({
  id: 1,
  workoutId: 1,
  exerciseId,
  setNumber: 1,
  reps: 1,
  weight: 0,
  durationMin,
});

const session = (
  startedAt: string,
  finishedAt: string | null,
  targetMinutes: number | null = null
) => ({
  startedAt: at(startedAt),
  finishedAt: finishedAt === null ? null : at(finishedAt),
  targetMinutes,
});

const profile = { sessionMinutes: 60 };

describe("sessionDurationMin", () => {
  it("rounds the span to whole minutes", () => {
    expect(
      sessionDurationMin(at("2026-08-04T10:00:00Z"), at("2026-08-04T10:51:40Z"))
    ).toBe(52);
  });

  it("is null without a finish timestamp", () => {
    expect(sessionDurationMin(at("2026-08-04T10:00:00Z"), null)).toBeNull();
  });

  it("is null when the clock ran backwards", () => {
    expect(
      sessionDurationMin(at("2026-08-04T10:00:00Z"), at("2026-08-04T09:30:00Z"))
    ).toBeNull();
  });

  it("accepts a 4 hour session but rejects a longer one", () => {
    expect(
      sessionDurationMin(at("2026-08-04T10:00:00Z"), at("2026-08-04T14:00:00Z"))
    ).toBe(240);
    expect(
      sessionDurationMin(at("2026-08-04T10:00:00Z"), at("2026-08-04T14:01:00Z"))
    ).toBeNull();
  });
});

describe("summarizeSession", () => {
  it("counts sets and volume from lifting sets only", () => {
    const s = summarizeSession(
      session("2026-08-04T10:00:00Z", "2026-08-04T10:52:00Z"),
      [lift("bench", 8, 60), lift("bench", 8, 60, 2), cardio("treadmill", 12)],
      profile
    );
    expect(s.liftingSets).toBe(2);
    expect(s.volume).toBe(960);
    expect(s.durationMin).toBe(52);
  });

  it("sums cardio minutes and leaves the lifting tallies empty", () => {
    const s = summarizeSession(
      session("2026-08-04T10:00:00Z", "2026-08-04T10:30:00Z"),
      [cardio("treadmill", 12), cardio("bike", 8)],
      profile
    );
    expect(s.cardioMin).toBe(20);
    expect(s.liftingSets).toBe(0);
    expect(s.volume).toBe(0);
  });

  it("counts distinct exercises, not sets", () => {
    const s = summarizeSession(
      session("2026-08-04T10:00:00Z", "2026-08-04T10:40:00Z"),
      [lift("bench", 8, 60), lift("bench", 8, 60, 2), lift("row", 10, 40)],
      profile
    );
    expect(s.exercisesDone).toBe(2);
  });

  it("prefers the workout's short-session target over the profile default", () => {
    const s = summarizeSession(
      session("2026-08-04T10:00:00Z", "2026-08-04T10:28:00Z", 30),
      [],
      profile
    );
    expect(s.targetMinutes).toBe(30);
  });

  it("falls back to the profile session length when no target was set", () => {
    const s = summarizeSession(
      session("2026-08-04T10:00:00Z", "2026-08-04T10:52:00Z"),
      [],
      profile
    );
    expect(s.targetMinutes).toBe(60);
  });

  it("reports zeroes, not NaN, for a session with nothing logged", () => {
    const s = summarizeSession(
      session("2026-08-04T10:00:00Z", "2026-08-04T10:52:00Z"),
      [],
      profile
    );
    expect(s).toEqual({
      durationMin: 52,
      targetMinutes: 60,
      liftingSets: 0,
      volume: 0,
      cardioMin: 0,
      exercisesDone: 0,
    });
  });
});
