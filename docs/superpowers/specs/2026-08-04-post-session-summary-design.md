# Post-session summary

## Problem

Finishing a workout drops you straight back on the Today page. The session's
numbers — above all the time it took, which the live `ElapsedTimer` had you
watching the whole way — vanish the moment you tap the button. There is no
moment of "here's what you just did."

## Solution

A dedicated summary screen at `/workout/[id]/summary`, rendered from the
database, that `finishWorkout` redirects to instead of `/`. Headline stats only:
time used against target, sets logged, volume, and cardio minutes. Because it
reads from the database rather than from a one-shot client state, any completed
workout can render it, so Progress → History links to it too.

Deliberately out of scope: per-exercise breakdown, PR badges, and
volume-vs-last-session deltas. The ask was for something short.

## Components

### `src/lib/session-summary.ts`

A pure module so the arithmetic is testable away from React and the database.

```ts
export interface SessionSummary {
  /** null when unknown or implausible — see sessionDurationMin */
  durationMin: number | null;
  targetMinutes: number;
  liftingSets: number;
  volume: number;
  cardioMin: number;
  exercisesDone: number;
}

export function sessionDurationMin(
  startedAt: Date,
  finishedAt: Date | null
): number | null;

export function summarizeSession(
  workout: Pick<WorkoutRow, "startedAt" | "finishedAt" | "targetMinutes">,
  sets: SetRow[],
  profile: Pick<Profile, "sessionMinutes">
): SessionSummary;
```

Rules, each one a reason this module exists rather than inline page arithmetic:

- **`sessionDurationMin`** — `finishedAt − startedAt` rounded to whole minutes.
  Returns `null` when `finishedAt` is null, when the span is negative, or when it
  exceeds 240 minutes (a session the user forgot to close). This is the same
  clamp `src/app/progress/page.tsx` currently applies in a local `durationOf`
  helper; that helper is deleted and the progress page imports this function, so
  "how long was this session" has one definition.
- **`targetMinutes`** — `workout.targetMinutes ?? profile.sessionMinutes`. This
  mirrors how `WorkoutSession` picks the target for `ElapsedTimer`, so the
  summary agrees with the clock the user was watching during the session.
- **`liftingSets`** and **`volume`** — count, and Σ `reps × weight`, over
  non-cardio sets only (`durationMin === null`). Cardio rows live in the same
  `sets` table; excluding them keeps them from being counted in two tiles at
  once.
- **`cardioMin`** — Σ `durationMin` over cardio sets.
- **`exercisesDone`** — number of distinct `exerciseId`s with at least one
  logged set.

### `src/app/workout/[id]/summary/page.tsx`

Server component. Loads profile, workout, sets, and active plan days (for the
focus label, resolved the same way `workout/[id]/page.tsx` does it).

Guards, following the existing session page's shape:

| Condition | Result |
| --- | --- |
| id not a number, or no such workout | `notFound()` |
| no profile | `redirect("/onboarding")` |
| status `in_progress` | `redirect("/workout/{id}")` |
| any other non-`completed` status | `redirect("/")` |

Layout:

- `h1` — "Session complete 🎉". Shown for revisited past sessions too; the
  session *was* completed, so this stays true and it keeps the page to a single
  code path with no query-parameter branching.
- Subheading — `{focus} · {weekday, month day}`, dated by `finishedAt` falling
  back to `startedAt`, the same precedence the progress page uses.
- A `grid-cols-2` of stat tiles reusing the markup already used by the progress
  page tiles (`rounded-xl border border-border-subtle bg-surface p-3 text-center`):
  1. Time — the figure, with `/ {target} min target` beneath. `text-warning`
     when over target, `text-accent` when at or under, consistent with
     `ElapsedTimer`. Reads `—` when `durationMin` is `null`, rather than
     inventing a number.
  2. `liftingSets` — "sets".
  3. `volume`, thousands-separated — "{units}" from the profile.
  4. `cardioMin` — "cardio min" — **when `cardioMin > 0`**; otherwise
     `exercisesDone` — "exercises". A pure lifting day shouldn't stare at a `0`.
- A full-width `Done` link to `/`, styled like the session screen's primary
  button.

A session finished with nothing logged simply shows zeroes; no special-cased
empty state.

### `src/lib/actions.ts`

`finishWorkout` — the final `redirect("/")` becomes a redirect to
`/workout/{workoutId}/summary`. The existing `revalidatePath`
calls for `/` and `/progress` stay. `discardWorkout` is unchanged and still
returns home.

### `src/app/progress/page.tsx`

The merged history entries gain an optional `href`. Workout entries set
`/workout/${w.id}/summary` and render their row inside a `Link`; activity
entries have no `href` and render exactly as they do now. The local `durationOf`
helper is replaced by the imported `sessionDurationMin`.

## Data flow

```
Finish workout ─▶ finishWorkout()
                   ├─ status = completed, finishedAt = now
                   ├─ revalidatePath("/"), revalidatePath("/progress")
                   └─ redirect ─▶ /workout/[id]/summary
                                   ├─ getProfile, getWorkout,
                                   │  getSetsForWorkout, getActivePlanDays
                                   └─ summarizeSession(...) ─▶ stat tiles

Progress → History ─▶ /workout/[id]/summary   (same page, same query)
```

No new tables, columns, or migrations: duration comes from the existing
`startedAt`/`finishedAt` timestamps, and the rest from the existing `sets` rows.

## Error handling

- Unparseable or unknown workout id → `notFound()`.
- Missing or implausible `finishedAt` → the time tile shows `—`; every other
  tile still renders. A summary is never blocked by a bad clock.
- An exercise id that is no longer in the dataset does not affect any tile,
  since none of them resolve exercise metadata.

## Testing

`src/lib/session-summary.test.ts` (vitest, alongside the existing
`adapt.test.ts` and `generator.test.ts`), written before the implementation:

- `sessionDurationMin` rounds to whole minutes.
- `sessionDurationMin` returns `null` for a null `finishedAt`, for a negative
  span, and for a span over 240 minutes; and a number at the 240 boundary.
- `volume` and `liftingSets` exclude cardio sets.
- `cardioMin` sums `durationMin` across cardio sets.
- `exercisesDone` counts distinct exercises, not sets.
- `targetMinutes` uses `workout.targetMinutes` when present and falls back to
  `profile.sessionMinutes` when null.
- A session with no sets yields zeroes rather than `NaN`.

The progress page keeps its existing behaviour; swapping its inline helper for
the imported one is covered by the `sessionDurationMin` tests.
