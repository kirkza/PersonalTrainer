# Post-Session Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After finishing a workout, land on a short summary screen showing time used against target, sets, volume, and cardio minutes — reachable again later from Progress → History.

**Architecture:** A pure `src/lib/session-summary.ts` module does all the arithmetic (unit-tested, no React or database). A new server component at `src/app/workout/[id]/summary/page.tsx` loads the workout from the database and renders stat tiles from that module's output. `finishWorkout` redirects there instead of `/`. The progress page drops its duplicate duration helper in favour of the shared one and links its workout history rows to the new page.

**Tech Stack:** Next.js 16.2.10 (App Router, server components), React 19.2, TypeScript, Drizzle ORM, Tailwind CSS v4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-04-post-session-summary-design.md`

## Global Constraints

- **Read the bundled Next.js docs before using any Next API you are unsure of** — `node_modules/next/dist/docs/`. Per `AGENTS.md` this is **not** the Next.js in your training data; version 16.2.10 has breaking changes.
- **`params` is a Promise.** Page props are typed `params: Promise<{ id: string }>` and must be awaited. Follow the existing `src/app/workout/[id]/page.tsx` prop style rather than the newer global `PageProps<'/route'>` helper, for consistency with the codebase.
- **Cache Components is NOT enabled** in `next.config.ts`, so `export const dynamic = "force-dynamic"` remains valid and is the pattern used by `src/app/page.tsx` and `src/app/progress/page.tsx`. Keep using it on database-backed pages.
- **Vitest has no `globals` option.** Every test file must explicitly `import { describe, expect, it } from "vitest";`.
- **There is no `npm test` script.** Run tests with `npx vitest run`.
- **Baseline is green:** `npx tsc --noEmit` exits 0 and `npx vitest run` reports 3 files / 43 tests passing. If you see a failure in a file this plan does not touch, stop and investigate rather than working around it.
- **Do not touch** `src/lib/adapt.ts`, `src/lib/generator.ts`, `src/lib/exercises.ts`, `src/lib/exercise-overrides.ts`, or their tests. They hold unrelated uncommitted work in progress.
- **Tailwind design tokens** used by this feature, all already defined in `src/app/globals.css`: `bg-surface`, `bg-surface-2`, `border-border-subtle`, `text-muted`, `text-accent`, `bg-accent-strong`, `text-warning`.
- **Stat tile markup** must match the existing tiles in `src/app/progress/page.tsx:152-185`: `rounded-xl border border-border-subtle bg-surface p-3 text-center`, a `text-2xl font-bold` value, and a `text-[11px] text-muted` label.
- **Commit after each task.** Stage only the files that task names.

---

### Task 1: Session summary arithmetic

The pure module. Every rule that could be subtly wrong lives here so it can be tested without a browser or a database.

**Files:**
- Create: `src/lib/session-summary.ts`
- Test: `src/lib/session-summary.test.ts`

**Interfaces:**
- Consumes: the `SetRow` and `WorkoutRow` types exported from `src/lib/data.ts`, and `Profile` from `src/lib/types.ts`. Import these **type-only** (`import type`) — `src/lib/data.ts` pulls in the database client at runtime, and a type-only import is erased at compile time so the unit test never touches a database.
- Produces:
  ```ts
  export function sessionDurationMin(
    startedAt: Date,
    finishedAt: Date | null
  ): number | null;

  export interface SessionSummary {
    durationMin: number | null;
    targetMinutes: number;
    liftingSets: number;
    volume: number;
    cardioMin: number;
    exercisesDone: number;
  }

  export function summarizeSession(
    workout: Pick<WorkoutRow, "startedAt" | "finishedAt" | "targetMinutes">,
    sets: SetRow[],
    profile: Pick<Profile, "sessionMinutes">
  ): SessionSummary;
  ```
  Task 2 calls `summarizeSession`; Task 3 calls `sessionDurationMin`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/session-summary.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/session-summary.test.ts`

Expected: FAIL — the suite cannot even load, with an error resolving `./session-summary` (`Failed to load url ./session-summary` or `Cannot find module`).

- [ ] **Step 3: Write the implementation**

Create `src/lib/session-summary.ts`:

```ts
import type { SetRow, WorkoutRow } from "./data";
import type { Profile } from "./types";

/** A session left open overnight shouldn't be reported as a 9-hour workout. */
const MAX_PLAUSIBLE_MIN = 240;

/**
 * Wall-clock length of a session in whole minutes, or null when it can't be
 * trusted: no finish timestamp, a negative span, or longer than 4 hours.
 */
export function sessionDurationMin(
  startedAt: Date,
  finishedAt: Date | null
): number | null {
  if (!finishedAt) return null;
  const min = Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000);
  return min >= 0 && min <= MAX_PLAUSIBLE_MIN ? min : null;
}

export interface SessionSummary {
  /** null when the duration can't be trusted — render a dash, not a number */
  durationMin: number | null;
  targetMinutes: number;
  liftingSets: number;
  volume: number;
  cardioMin: number;
  exercisesDone: number;
}

/**
 * Headline numbers for one finished session. Cardio sets share the `sets`
 * table but carry a duration instead of reps×weight, so they're kept out of
 * the lifting tallies — otherwise they'd be counted in two tiles at once.
 */
export function summarizeSession(
  workout: Pick<WorkoutRow, "startedAt" | "finishedAt" | "targetMinutes">,
  sets: SetRow[],
  profile: Pick<Profile, "sessionMinutes">
): SessionSummary {
  const lifting = sets.filter((s) => s.durationMin === null);
  return {
    durationMin: sessionDurationMin(workout.startedAt, workout.finishedAt),
    // mirrors how WorkoutSession picks the target for its live clock
    targetMinutes: workout.targetMinutes ?? profile.sessionMinutes,
    liftingSets: lifting.length,
    volume: Math.round(lifting.reduce((sum, s) => sum + s.reps * s.weight, 0)),
    cardioMin: sets.reduce((sum, s) => sum + (s.durationMin ?? 0), 0),
    exercisesDone: new Set(sets.map((s) => s.exerciseId)).size,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/session-summary.test.ts`

Expected: PASS — 10 tests.

- [ ] **Step 5: Verify the whole suite and types are still clean**

Run: `npx vitest run` — expected: 4 files, 53 tests passing.
Run: `npx tsc --noEmit` — expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/session-summary.ts src/lib/session-summary.test.ts
git commit -m "Session summary: pure stats module"
```

---

### Task 2: Summary screen

The user-visible deliverable: the page, plus the redirect that sends you there.

**Files:**
- Create: `src/app/workout/[id]/summary/page.tsx`
- Modify: `src/lib/actions.ts:170-180` (`finishWorkout`)

**Interfaces:**
- Consumes: `summarizeSession` and `SessionSummary` from Task 1. Also these existing functions from `src/lib/data.ts`, all already exported: `getProfile()`, `getWorkout(id: number)`, `getSetsForWorkout(workoutId: number)`, `getActivePlanDays()`.
- Produces: the route `/workout/{id}/summary`, which Task 3 links to.

- [ ] **Step 1: Create the summary page**

Create `src/app/workout/[id]/summary/page.tsx`:

```tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getActivePlanDays,
  getProfile,
  getSetsForWorkout,
  getWorkout,
} from "@/lib/data";
import { summarizeSession } from "@/lib/session-summary";

function StatTile({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

export default async function WorkoutSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workoutId = parseInt(id, 10);
  if (Number.isNaN(workoutId)) notFound();

  const profile = await getProfile();
  if (!profile) redirect("/onboarding");

  const workout = await getWorkout(workoutId);
  if (!workout) notFound();
  // still logging: send them back to the session, not to a summary
  if (workout.status === "in_progress") redirect(`/workout/${workoutId}`);
  if (workout.status !== "completed") redirect("/");

  const [sets, planDays] = await Promise.all([
    getSetsForWorkout(workoutId),
    getActivePlanDays(),
  ]);

  const focus =
    planDays.find((d) => d.id === workout.planDayId)?.focus ?? "Workout";
  const summary = summarizeSession(workout, sets, profile);
  const over =
    summary.durationMin !== null && summary.durationMin > summary.targetMinutes;
  const when = workout.finishedAt ?? workout.startedAt;

  return (
    <main className="flex flex-col gap-5">
      <header className="text-center">
        <h1 className="text-2xl font-bold">Session complete 🎉</h1>
        <p className="text-sm text-muted">
          {focus} ·{" "}
          {when.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border-subtle bg-surface p-3 text-center">
          <div
            className={`text-2xl font-bold ${
              over ? "text-warning" : "text-accent"
            }`}
          >
            {summary.durationMin ?? "—"}
          </div>
          <div className="text-[11px] text-muted">
            / {summary.targetMinutes} min target
          </div>
        </div>
        <StatTile value={summary.liftingSets} label="sets" />
        <StatTile
          value={summary.volume.toLocaleString()}
          label={`${profile.units} volume`}
        />
        {summary.cardioMin > 0 ? (
          <StatTile value={summary.cardioMin} label="cardio min" />
        ) : (
          <StatTile value={summary.exercisesDone} label="exercises" />
        )}
      </div>

      <Link
        href="/"
        className="rounded-xl bg-accent-strong py-3.5 text-center font-semibold text-black"
      >
        Done
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Point `finishWorkout` at the summary**

In `src/lib/actions.ts`, in `finishWorkout` (around line 170), replace the final line:

```ts
  redirect("/");
```

with:

```ts
  redirect(`/workout/${workoutId}/summary`);
```

Leave the two `revalidatePath` calls above it, and the whole of `discardWorkout`, exactly as they are — discarding still goes home.

The finished function reads:

```ts
export async function finishWorkout(workoutId: number) {
  const db = await getDb();
  // duration is derived from startedAt/finishedAt wherever it's displayed
  await db
    .update(schema.workouts)
    .set({ status: "completed", finishedAt: new Date() })
    .where(eq(schema.workouts.id, workoutId));
  revalidatePath("/");
  revalidatePath("/progress");
  redirect(`/workout/${workoutId}/summary`);
}
```

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit` — expected: exit 0, no output.
Run: `npm run lint` — expected: no errors in the two files you touched.

- [ ] **Step 4: Verify in the running app**

Run: `npm run dev`, then in the browser:

1. Open `http://localhost:3000`, start a workout, log at least two sets on one exercise, and tap **Finish workout** → confirm.
2. Expected: the URL becomes `/workout/<id>/summary` and you see "Session complete 🎉", the focus and today's date, a minutes figure against `/ N min target`, a sets count, a volume figure with your units, and — because you logged no cardio — an "exercises" tile.
3. Tap **Done** → back to the Today page.
4. Navigate back to `/workout/<id>/summary` directly. Expected: it renders the same summary (this is what Task 3's history links rely on).
5. Navigate to `/workout/999999/summary`. Expected: the 404 page.

- [ ] **Step 5: Commit**

```bash
git add "src/app/workout/[id]/summary/page.tsx" src/lib/actions.ts
git commit -m "Post-session summary screen"
```

---

### Task 3: Reuse the duration rule and link history rows

Removes the duplicated duration clamp and makes past workouts tappable.

**Files:**
- Modify: `src/app/progress/page.tsx` — imports, the `durationOf` helper at lines 113-120, and the History section at lines 254-297

**Interfaces:**
- Consumes: `sessionDurationMin` from Task 1, and the `/workout/{id}/summary` route from Task 2.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Import `Link` and `sessionDurationMin`**

At the top of `src/app/progress/page.tsx`, add the `Link` import above the `next/navigation` one, and the `sessionDurationMin` import next to the other `@/lib` imports:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getActivities, getProfile } from "@/lib/data";
import { getExercise } from "@/lib/exercises";
import { sessionDurationMin } from "@/lib/session-summary";
import ProgressCharts, { type WeeklyVolumePoint } from "./ProgressCharts";
```

- [ ] **Step 2: Delegate `durationOf` to the shared function**

Replace the whole helper at lines 113-120 — the comment line above it plus the arrow function — with:

```tsx
  // ----- session durations (start → finish) -----
  const durationOf = (w: (typeof completed)[number]): number | null =>
    sessionDurationMin(w.startedAt, w.finishedAt);
```

`durationOf` stays as a local shorthand because two call sites below use it (`recentDurations` and the history detail string); only the rule itself moves out. Do not change `recentDurations`, `avgSessionMin`, or anything else in that block.

- [ ] **Step 3: Lift the history list out of the JSX so it can carry an `href`**

The list is currently built inline inside the `return`. Move it above the `return` — a typed array is needed because workout entries have an `href` and activity entries don't, and TypeScript will reject `e.href` on an un-annotated union.

Insert this immediately after the streak block (just before `const { units } = profile;` at line 146):

```tsx
  // ----- history rows (workouts link to their summary; activities don't) -----
  interface HistoryEntry {
    key: string;
    date: Date;
    label: string;
    detail: string;
    href?: string;
  }

  const history: HistoryEntry[] = [
    ...completed.map((w) => {
      const dur = durationOf(w);
      return {
        key: `w${w.id}`,
        date: w.finishedAt ?? w.startedAt,
        label: "Workout",
        detail: `${sets.filter((s) => s.workoutId === w.id).length} sets${
          dur !== null ? ` · ${dur} min` : ""
        }`,
        href: `/workout/${w.id}/summary`,
      };
    }),
    ...activities.map((a) => ({
      key: `a${a.id}`,
      date: a.performedAt,
      label: `🏸 ${a.name}`,
      detail: `${a.minutes} min`,
    })),
  ]
    .sort((x, y) => y.date.getTime() - x.date.getTime())
    .slice(0, 12);
```

- [ ] **Step 4: Render the rows from `history`, wrapping linked ones**

Replace the entire `<ul>` inside the History section (lines 256-296, from `<ul className="flex flex-col gap-2">` through its closing `</ul>`) with:

```tsx
            <ul className="flex flex-col gap-2">
              {history.map((e) => {
                const rowClass =
                  "flex items-baseline justify-between gap-2 text-sm";
                const row = (
                  <>
                    <span className="min-w-0 truncate">
                      {e.date.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      <span className="ml-2 text-muted">{e.label}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {e.detail}
                    </span>
                  </>
                );
                return (
                  <li key={e.key}>
                    {e.href ? (
                      <Link href={e.href} className={rowClass}>
                        {row}
                      </Link>
                    ) : (
                      <div className={rowClass}>{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
```

Keep the surrounding `<section>` and its `<h2>History</h2>` unchanged.

- [ ] **Step 5: Verify types, lint, and tests**

Run: `npx tsc --noEmit` — expected: exit 0, no output.
Run: `npm run lint` — expected: no errors.
Run: `npx vitest run` — expected: 4 files, 53 tests passing (unchanged from Task 1; this task adds no tests because it only rewires an already-tested rule and adds markup).

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev`, then open `http://localhost:3000/progress`:

1. The stat tiles — including "avg session length" — show the same numbers as before the change.
2. Under History, workout rows are tappable and open that session's summary; the 🏸 activity rows are not links and look unchanged.
3. Duration text on workout rows (`N sets · N min`) still appears.

- [ ] **Step 7: Commit**

```bash
git add src/app/progress/page.tsx
git commit -m "Progress: link history rows to session summaries"
```

---

## Done when

- Finishing a workout lands on `/workout/<id>/summary` with time-used, sets, volume, and cardio-or-exercises tiles.
- The time tile shows `text-warning` when over target, `text-accent` otherwise, and `—` when the duration is untrustworthy.
- Progress → History workout rows open the same page for past sessions.
- `npx vitest run` reports 4 files / 53 tests passing, `npx tsc --noEmit` exits 0, and `npm run lint` is clean.
