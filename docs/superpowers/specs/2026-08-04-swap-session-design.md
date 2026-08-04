# Swap session

## Problem

The Today page offers exactly one session: whatever the rotation says is next.
When that session doesn't suit how you feel — sore arms on an upper-body day —
your only options are to train it anyway or to reach for "Can't train today?",
which treats a bad *fit* as a lost day.

There is already a swap at the exercise level (`SwapSheet`, `swapInWorkout`),
and `chooseNextPosition` already rotates past a day whose muscles you trained
today or yesterday. What's missing is the case only you can judge: this day is
wrong for me right now, give me a different one.

## Solution

A `⇄ Swap session` control on the Today page opens a sheet listing your other
plan days — each with the muscles it trains and a time estimate — and tapping
one starts it. The day you passed over is set aside and becomes next up, so
swapping trades the order rather than costing you a session.

Making it a true trade requires one change to the rotation rule, which also
repairs a promise the app already makes. See "Rotation rule" below.

### Prerequisite

This work edits `src/lib/adapt.ts` and `src/lib/adapt.test.ts`, which currently
hold uncommitted work in progress (`chooseNextPosition`, `sessionMuscles`, the
`% dayCount` wrapping, and their tests). That work is committed **first**, as
its own commit, so this feature's diff stays reviewable on its own.

## Components

### Rotation rule — `src/lib/adapt.ts`

`nextPosition` currently honours a shift-skip only when it is the most recent
history entry:

```ts
for (let i = history.length - 1; i >= 0; i--) {
  const h = history[i];
  if (h.status === "in_progress") continue;
  if (h.status === "skipped" && h.skipDecision === "shift") {
    return h.position % dayCount;
  }
  return (h.position + 1) % dayCount;
}
```

Train anything else and the shift is forgotten. That is already wrong for the
existing "Shift my week" button, which promises "do this session next time I
train"; it is fatal for a swap, whose whole point is that the passed-over day
comes back.

New rule: **a day shifted aside stays next until it is dealt with.** A shift is
*cleared* by an entry for that day appearing after it in history — `completed`,
or `skipped` with `drop` or `fold`, both of which are the user saying "move on".
Positions are compared **wrapped** (`position % dayCount`), because that is how
the day is offered: a shift recorded under a longer plan is offered as
`position % dayCount`, so finishing *that* day is what has to clear it. Anything
else leaves it pending. When several are pending, the earliest wins — the day you
have been putting off longest comes first.

```ts
/**
 * Has a shifted-aside day been dealt with? Training it clears it, and so does
 * dropping or folding it — those are the user saying "move on". Positions are
 * compared wrapped, because that is how the day was offered.
 */
function shiftResolved(
  shift: SessionHistoryEntry,
  later: SessionHistoryEntry[],
  dayCount: number
): boolean {
  const offered = shift.position % dayCount;
  return later.some(
    (x) =>
      x.position % dayCount === offered &&
      (x.status === "completed" ||
        (x.status === "skipped" && x.skipDecision !== "shift"))
  );
}

export function nextPosition(
  dayCount: number,
  history: SessionHistoryEntry[]
): number {
  const pending = history.find(
    (h, i) =>
      h.status === "skipped" &&
      h.skipDecision === "shift" &&
      !shiftResolved(h, history.slice(i + 1), dayCount)
  );
  if (pending) return pending.position % dayCount;

  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.status === "in_progress") continue;
    return (h.position + 1) % dayCount;
  }
  return 0;
}
```

The old shift branch inside the loop is deleted, not merely bypassed: a shift
that reaches the loop is either pending — and so already returned above — or
resolved, which requires a later entry for that same wrapped position, and that
entry is nearer the end of the array, so the backward loop reaches it first. The
branch is unreachable once the pending check exists.

**Why the comparison must be wrapped on both sides.** An earlier draft of this
spec compared raw positions while returning a wrapped one. That let a shift
recorded under a longer plan become permanently unclearable: with `dayCount = 4`
a shift at position 5 is offered as `5 % 4 = 1`, training it records a
`completed` entry at position 1, and a raw comparison against 5 never matches
again — so the shift stayed pending forever and the sequence pointer died. It is
reachable simply by reducing `daysPerWeek` and regenerating, and invisible from
the UI, since shift rows are never displayed. Both sides are wrapped for that
reason, and `nextPosition` has a regression test for it.

**How this composes with `chooseNextPosition`.** `nextPosition` supplies the
starting point; the muscle-recovery check still gets to rotate past it. So a
day you swapped away from returns the first time it is actually sensible, not
merely the first time it is next in line. On a full-body plan, where every day
overlaps every other, the sequence pointer wins and you get the day straight
back.

**Behavior change, verified against the existing suite.** This alters
`skipNextSession("shift")` too — a shifted day now survives training something
else. All six existing `nextPosition` tests and all seven `chooseNextPosition`
tests were traced against the new rule and still hold: none of them exercises a
shift followed by a completed session, which is precisely why the bug survived.
So no existing test needs changing, and no existing assertion is being weakened
to accommodate this.

### Action — `src/lib/actions.ts`

`startWorkout` and the new `swapSession` share one private helper, so "begin a
session" has a single definition:

```ts
async function beginSession(
  planDay: PlanDayRow,
  pendingFold: WorkoutRow | null,
  targetMinutes: number | null
): Promise<number>;
```

It applies `foldIntoSession` when a fold is pending, compresses via
`compressSession` when `targetMinutes` is tighter than the estimate, inserts the
`in_progress` workout, marks the folded-in session's `foldedInto`, and returns
the new workout id. This is the body of today's `startWorkout`, extracted
unchanged in behavior.

```ts
export async function swapSession(planDayId: number): Promise<void>;
```

1. Load the prescribed session. No plan → `/onboarding`. A session already in
   progress → redirect into it, so a stale Today page can't open two sessions.
2. Resolve `planDayId` against `getActivePlanDays()`. Not found → `/`. This is
   reachable: the plan can be regenerated while the sheet sits open.
3. If the pick **is** the prescribed day, skip step 4 — there is nothing to set
   aside.
4. Otherwise insert a `skipped` / `shift` workout row for the prescribed day.
   The **guard in step 3 is the load-bearing part, not the insert order.** The
   pending-shift rule is position-scoped, so order would matter only if the
   shifted and chosen positions were equal — `[shift(P), completed(P)]` clears
   the shift, `[completed(P), shift(P)]` leaves it pending. Distinct plan-day
   ids within one active plan mean distinct positions, so step 3 rules that case
   out and the two inserts are independent: either order gives the same result.
5. `beginSession(chosen, next.pendingFold, null)`, then `revalidatePath("/")`
   and redirect into the workout.

A pending fold follows you to the day you actually train, which is the point of
folding — its key lifts shouldn't be lost to a swap.

### Picker — `src/app/page.tsx` and `src/app/TodayActions.tsx`

`page.tsx` builds the rows server-side from `getActivePlanDays()`, excluding the
prescribed day:

```ts
{ id: number; focus: string; muscles: string[]; estimate: number }
```

`muscles` is `[...sessionMuscles(d.exercises)]` truncated to the first three.
`sessionMuscles` returns each exercise's `target`, so these are dataset target
names (`pectorals`, `lats`, `quads`) rather than colloquial body parts — the row
joins them with `·` under a `capitalize` class, matching how the app already
renders target names on the session screen. Set iteration follows insertion
order, so "first three" means the first three distinct targets in the day's
exercise order, which is stable across renders. `estimate` is
`estimateMinutes(d.exercises)`.

`sessionMuscles` deliberately ignores cardio, so a cardio day yields an empty set
and its row reads **"cardio only"** instead of a muscle list.

`TodayActions` gains a second collapsible panel beside the existing skip panel,
in the same style (`rounded-xl border border-border-subtle bg-surface p-3`,
rows as `rounded-lg bg-surface-2 px-3 py-2.5 text-left text-sm`):

```
┌─ Train something else ─────────┐
│ Full Body A          ~52 min   │
│ pectorals · lats · quads       │
│ Full Body C          ~48 min   │
│ glutes · hamstrings · calves   │
│ Cardio               ~25 min   │
│ cardio only                    │
│ Cancel                         │
└────────────────────────────────┘
```

The trigger is labelled `⇄ Swap session` and sits above "Can't train today?" —
swapping is the friendlier option and should be found first. The exercise-level
control is also `⇄ Swap`, but the two never share a screen (Today vs. the
workout session), and the word "session" distinguishes them.

The panel renders only when at least one other plan day exists; a single-day
plan shows no trigger.

## Data flow

```
Today page ─▶ ⇄ Swap session ─▶ sheet of other plan days
                                  │ tap a day
                                  ▼
                            swapSession(planDayId)
                              ├─ skipped/shift row for the prescribed day   (id N)
                              ├─ beginSession(chosen, pendingFold, null)    (id N+1)
                              └─ redirect ─▶ /workout/{N+1}

next visit ─▶ getNextSession ─▶ nextPosition sees the pending shift
                              ─▶ chooseNextPosition may still rotate past it
                                 if you'd repeat muscles trained today/yesterday
```

No schema change: the shift is an ordinary `skipped` workout row with
`skipDecision: "shift"`, exactly what `skipNextSession` already writes.

## Error handling

| Condition | Result |
| --- | --- |
| No profile / no plan days | `redirect("/onboarding")` |
| A session already in progress | `redirect("/workout/{id}")` |
| `planDayId` not in the active plan (regenerated meanwhile) | `redirect("/")` |
| Chosen day is the prescribed day | Starts it; writes no shift row |
| Cardio day (no loaded muscles) | Row reads "cardio only" |

## Testing

`src/lib/adapt.test.ts`, alongside the existing `nextPosition` tests:

- a shifted day is still next after a *different* session is completed
- a shifted day stops being next once that position has been completed
- with two pending shifts, the earliest is next
- a shift stays next while its own session is `in_progress`
- a shifted position beyond `dayCount` still wraps (regression on existing
  behavior)
- every existing `nextPosition` and `chooseNextPosition` test still passes, or
  is updated deliberately per "Behavior change to confirm" above

All of this is pure and runs in the existing node harness. `swapSession` and the
picker are covered by `tsc --noEmit`, `npm run lint`, `npm run build`, and a run
of the real app — the project has no component-test infrastructure
(`environment: "node"`, no @testing-library), and this change doesn't justify
standing one up.

## Out of scope

- A soreness or body-part model. The picker shows what each day trains and lets
  you judge; encoding how you feel is a bigger feature with its own failure modes.
- Short-session variants of a swapped session. A swap starts full length; the
  `⏱ Only 45/30 min` options stay with the prescribed session.
- Swapping to anything outside the active plan, or to an ad-hoc session.
