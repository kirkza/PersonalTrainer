import { describe, expect, it } from "vitest";
import { canRemoveLastRow } from "./set-rows";

/** Only `id` matters to this rule; reps/weight are irrelevant here. */
const unlogged = () => ({ id: null });
const logged = (id: number) => ({ id });

describe("canRemoveLastRow", () => {
  it("allows dropping a row the user appended past the prescription", () => {
    expect(
      canRemoveLastRow([logged(1), logged(2), unlogged(), unlogged()], 3)
    ).toBe(true);
  });

  it("refuses when every row belongs to the prescription", () => {
    expect(canRemoveLastRow([logged(1), unlogged(), unlogged()], 3)).toBe(false);
  });

  it("refuses when the appended row already has a logged set", () => {
    expect(
      canRemoveLastRow([logged(1), logged(2), logged(3), logged(4)], 3)
    ).toBe(false);
  });

  it("refuses when fewer rows remain than the prescription asks for", () => {
    expect(canRemoveLastRow([unlogged(), unlogged()], 3)).toBe(false);
  });

  it("still allows dropping the newest of several appended rows", () => {
    expect(
      canRemoveLastRow(
        [logged(1), logged(2), logged(3), logged(4), unlogged()],
        3
      )
    ).toBe(true);
  });

  it("refuses on an empty list", () => {
    expect(canRemoveLastRow([], 0)).toBe(false);
  });
});
