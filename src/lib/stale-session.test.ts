import { describe, expect, it } from "vitest";
import { staleSessionAction, STALE_AFTER_MS } from "./stale-session";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-09-01T19:00:00Z");
const hoursBefore = (h: number) =>
  new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe("staleSessionAction", () => {
  it("leaves a session alone while it is being trained", () => {
    expect(
      staleSessionAction(hoursBefore(1), hoursBefore(0.1), NOW).action
    ).toBe("keep");
  });

  it("closes one abandoned since the last visit, dated to the last set", () => {
    const lastSet = hoursBefore(20);
    const result = staleSessionAction(hoursBefore(21), lastSet, NOW);
    expect(result.action).toBe("finish");
    if (result.action === "finish") {
      // when the work stopped, not when it was noticed
      expect(result.finishedAt).toEqual(lastSet);
    }
  });

  it("keeps an overnight session resumed after a short break", () => {
    // started 23:00, last set 00:30, now 01:00 — 1.5 hours of real training
    expect(
      staleSessionAction(
        at("2026-08-31T23:00:00Z"),
        at("2026-09-01T00:30:00Z"),
        at("2026-09-01T01:00:00Z")
      ).action
    ).toBe("keep");
  });

  it("discards one where nothing was ever logged", () => {
    expect(staleSessionAction(hoursBefore(30), null, NOW).action).toBe(
      "discard"
    );
  });

  it("measures staleness from the last set, not from the start", () => {
    // an eight-hour-old session still being logged into is not stale
    expect(staleSessionAction(hoursBefore(8), hoursBefore(0.5), NOW).action).toBe(
      "keep"
    );
  });

  it("holds the line exactly at the six-hour boundary", () => {
    const justInside = new Date(NOW.getTime() - STALE_AFTER_MS + 1000);
    const justOutside = new Date(NOW.getTime() - STALE_AFTER_MS);
    expect(staleSessionAction(hoursBefore(9), justInside, NOW).action).toBe(
      "keep"
    );
    expect(staleSessionAction(hoursBefore(9), justOutside, NOW).action).toBe(
      "finish"
    );
  });

  it("uses the start time when no sets exist and the session is fresh", () => {
    expect(staleSessionAction(hoursBefore(0.2), null, NOW).action).toBe("keep");
  });
});
