# Swap Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user trade today's prescribed session for a different plan day, with the passed-over day coming straight back next time instead of waiting a full rotation.

**Architecture:** One rule change in the pure scheduling module (`adapt.ts`) makes a shifted-aside day stay next until it is actually trained. A new `swapSession` server action records that shift and starts the chosen day, sharing a private `beginSession` helper with `startWorkout`. The Today page gains a sheet listing the other plan days.

**Tech Stack:** Next.js 16.2.10 (App Router, server components + server actions), React 19.2, TypeScript, Drizzle ORM, Tailwind CSS v4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-04-swap-session-design.md`

## Global Constraints

- **PREREQUISITE — do not start Task 1 until this is true.** `src/lib/adapt.ts`, `src/lib/adapt.test.ts`, `src/lib/data.ts`, `src/lib/exercises.ts`, `src/lib/generator.ts`, `src/lib/generator.test.ts`, `src/lib/exercise-overrides.ts` and `src/lib/exercises.test.ts` must be **committed** first — they hold the user's in-progress muscle-recovery rotation work. Run `git status --short`; if any of those appear as modified or untracked, stop and report that the prerequisite is unmet rather than committing them yourself or editing around them. (`src/lib/set-rows.ts`, `src/lib/set-rows.test.ts` and `src/app/workout/[id]/WorkoutSession.tsx` may also be uncommitted; those are a separate finished fix and do not block this work, but never stage them as part of this plan's commits.)
- **This is NOT the Next.js in your training data.** The project is on Next.js 16.2.10 and `AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code. Two facts already verified for this project, so don't re-derive them: `export const dynamic = "force-dynamic"` is still valid (it is removed in v16 only when Cache Components is enabled, and `next.config.ts` does not enable it), and `redirect()` from `next/navigation` is typed `never`, so code after `if (!x) redirect(...)` sees `x` narrowed.
- **`"use server"` files may only export async functions.** `src/lib/actions.ts` starts with `"use server"`. A non-exported helper is fine; exporting a type or constant from that file is not. Import types into it instead.
- **Vitest has no `globals` option.** Test files must explicitly `import { describe, expect, it } from "vitest";`.
- **There is no `npm test` script.** Run tests with `npx vitest run`.
- **Baseline once the prerequisite is met:** `npx tsc --noEmit` exits 0, `npm run lint` is clean, and `npx vitest run` reports **5 files / 59 tests passing**. Task 1 adds 4 tests → 63. If your baseline differs, record the actual numbers and use those.
- **Tailwind tokens** available, all defined in `src/app/globals.css`: `bg-surface`, `bg-surface-2`, `border-border-subtle`, `text-muted`, `text-accent`, `bg-accent-strong`, `text-warning`, `text-danger`.
- **Panel styling must match the existing skip panel** in `src/app/TodayActions.tsx:56-94`: container `flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3`, option rows `rounded-lg bg-surface-2 px-3 py-2.5 text-left text-sm`, cancel `text-xs text-muted`.
- **Commit after each task, staging only that task's files.**

---

### Task 1: A shifted session stays next until it is trained

The pure rule change. Everything else in this plan depends on it being right.

**Files:**
- Modify: `src/lib/adapt.ts` — `nextPosition`, currently at lines 76-89
- Test: `src/lib/adapt.test.ts` — add to the existing `describe("nextPosition", ...)` block, which currently ends at line 132

**Interfaces:**
- Consumes: `SessionHistoryEntry` from `src/lib/adapt.ts` — `{ position: number; status: WorkoutStatus; skipDecision?: SkipDecision | null; at?: Date; exercises?: PlanExercise[] }`.
- Produces: `nextPosition(dayCount: number, history: SessionHistoryEntry[]): number` — same signature as today, new behavior. Task 2 relies on this behavior but calls it only indirectly, through `getNextSession()`.

**Background you need:** `history` is ordered oldest-first (built in `src/lib/data.ts` from workouts ordered by id). A "shift" skip means "do this session next time I train". Today the rule only honors it when it is the most recent entry, so training anything else silently forgets it. That is the bug.

- [ ] **Step 1: Write the failing tests**

Add these four tests inside the existing `describe("nextPosition", () => { ... })` block in `src/lib/adapt.test.ts`, after the `"clamps a position carried over from a longer previous cycle"` test:

```ts
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
```

- [ ] **Step 2: Run the tests and confirm which fail, and why**

Run: `npx vitest run src/lib/adapt.test.ts`

Expected: **exactly two of the four fail**, both with the old rule returning 3 because it read only the last entry:

- `"keeps a shifted session next even after another one is trained"` → FAIL, `expected 3 to be 1`
- `"offers the longest-outstanding session when two are shifted"` → FAIL, `expected 3 to be 0`

The other two are regression guards and **pass before the change as well** — `"releases a shifted session once it has been trained"` because the old rule also lands on 2 there, and `"holds the shifted session while its own workout is in progress"` because the old loop already skips `in_progress` entries. They exist to stop the new code returning the shifted position forever. Do not rewrite them to fail; note in your report that they were green in the RED run and say why.

If a test fails with a different message or count than described, stop and report — the baseline is not what this plan assumes.

- [ ] **Step 3: Implement the rule**

Replace the whole of `nextPosition` in `src/lib/adapt.ts` (currently lines 76-89) with:

```ts
export function nextPosition(
  dayCount: number,
  history: SessionHistoryEntry[]
): number {
  // A day shifted aside stays next until it's actually trained. Without this,
  // "do this session next time I train" is forgotten the moment you train
  // anything else — and a swapped-away day would vanish for a whole cycle.
  // Earliest pending shift first: the day put off longest comes back first.
  const pending = history.find(
    (h, i) =>
      h.status === "skipped" &&
      h.skipDecision === "shift" &&
      !history
        .slice(i + 1)
        .some((x) => x.status === "completed" && x.position === h.position)
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

Also update the doc comment directly above it (currently lines 69-75) so it no longer claims a shift merely "stays next":

```ts
/**
 * Which plan day comes next by sequence alone? Sessions run in order;
 * completing (or dropping/folding a skipped) session advances the pointer.
 * A session skipped with "shift" stays next until that day is actually
 * trained, so the week slides rather than losing the session. Positions are
 * wrapped, so history from a longer plan still lands inside the current one.
 */
```

Note what is deleted: the old `if (h.status === "skipped" && h.skipDecision === "shift") return h.position % dayCount;` branch inside the loop. It is now unreachable — a shift the loop could reach is either pending (returned above) or non-pending, which requires a `completed` entry for its position after it, so it cannot be the first non-`in_progress` entry the loop meets. Leaving it in would be dead code.

- [ ] **Step 4: Run the tests and verify all pass**

Run: `npx vitest run src/lib/adapt.test.ts`
Expected: PASS, all tests in the file, including the six pre-existing `nextPosition` tests and the seven `chooseNextPosition` tests.

Those thirteen existing tests were traced against this rule while the plan was written and all still hold — none of them exercises a shift followed by a completed session. **If any pre-existing test now fails, stop and report it rather than editing that test.** A break there means the rule has a consequence this plan did not anticipate, and that is the user's call, not yours.

- [ ] **Step 5: Verify the whole suite and types**

Run: `npx vitest run` — expected: 5 files, 63 tests passing.
Run: `npx tsc --noEmit` — expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/adapt.ts src/lib/adapt.test.ts
git commit -m "Rotation: a shifted session stays next until it is trained"
```

---

### Task 2: `swapSession` action

**Files:**
- Modify: `src/lib/actions.ts` — the import from `./data` (line 15), and `startWorkout` (lines 73-108)

**Interfaces:**
- Consumes: `getNextSession()` returning `{ planDay: PlanDayRow; pendingFold: WorkoutRow | null; inProgress: WorkoutRow | null } | null`, plus `getActivePlanDays(): Promise<PlanDayRow[]>`, both already exported from `src/lib/data.ts`. `PlanDayRow` is `{ id: number; planId: number; position: number; focus: string; exercises: PlanExercise[] }`. Also `foldIntoSession`, `compressSession`, `estimateMinutes` from `./adapt`, all already imported in this file.
- Produces: `swapSession(planDayId: number): Promise<void>` — a server action Task 3 calls from the client. Also a private `beginSession(planDay: PlanDayRow, pendingFold: WorkoutRow | null, targetMinutes: number | null): Promise<number>` used only inside this file.

- [ ] **Step 1: Widen the `./data` import**

In `src/lib/actions.ts`, replace line 15:

```ts
import { getNextSession, getProfile } from "./data";
```

with:

```ts
import {
  getActivePlanDays,
  getNextSession,
  getProfile,
  type PlanDayRow,
  type WorkoutRow,
} from "./data";
```

- [ ] **Step 2: Extract `beginSession` and rewrite `startWorkout`**

Replace the whole existing `startWorkout` function (lines 73-108) with the following. `beginSession` is the current body of `startWorkout`, moved verbatim in behavior — fold, then compress, then insert, then mark the folded session:

```ts
/** Create the in-progress session row for a plan day; returns its workout id. */
async function beginSession(
  planDay: PlanDayRow,
  pendingFold: WorkoutRow | null,
  targetMinutes: number | null
): Promise<number> {
  const db = await getDb();
  let sessionExercises: PlanExercise[] = planDay.exercises;
  if (pendingFold) {
    sessionExercises = foldIntoSession(sessionExercises, pendingFold.exercises);
  }
  if (targetMinutes && targetMinutes < estimateMinutes(sessionExercises)) {
    sessionExercises = compressSession(sessionExercises, targetMinutes);
  }

  const [workout] = await db
    .insert(schema.workouts)
    .values({
      planDayId: planDay.id,
      exercises: sessionExercises,
      status: "in_progress",
      targetMinutes,
    })
    .returning();

  if (pendingFold) {
    await db
      .update(schema.workouts)
      .set({ foldedInto: workout.id })
      .where(eq(schema.workouts.id, pendingFold.id));
  }
  return workout.id;
}

export async function startWorkout(targetMinutes: number | null) {
  const next = await getNextSession();
  if (!next) redirect("/onboarding");
  if (next.inProgress) redirect(`/workout/${next.inProgress.id}`);

  const workoutId = await beginSession(
    next.planDay,
    next.pendingFold,
    targetMinutes
  );
  revalidatePath("/");
  redirect(`/workout/${workoutId}`);
}

/**
 * Train a different plan day than the one prescribed — for when the prescribed
 * session doesn't suit how you feel. The prescribed day is set aside with a
 * "shift" so it comes back next: swapping trades the order, it doesn't cost
 * you the session.
 */
export async function swapSession(planDayId: number) {
  const db = await getDb();
  const next = await getNextSession();
  if (!next) redirect("/onboarding");
  if (next.inProgress) redirect(`/workout/${next.inProgress.id}`);

  const chosen = (await getActivePlanDays()).find((d) => d.id === planDayId);
  // reachable: the plan can be regenerated while the swap sheet sits open
  if (!chosen) redirect("/");

  // Only when the pick differs from the prescription. A shift row for a position
  // that is about to be completed would never clear — the pending-shift rule is
  // position-scoped — and distinct plan-day ids in one plan mean distinct
  // positions, so this guard is what keeps the two inserts independent. Their
  // order does not matter.
  if (chosen.id !== next.planDay.id) {
    await db.insert(schema.workouts).values({
      planDayId: next.planDay.id,
      exercises: next.planDay.exercises,
      status: "skipped",
      skipDecision: "shift",
      finishedAt: new Date(),
    });
  }

  // full length: the short-session options stay with the prescribed session
  const workoutId = await beginSession(chosen, next.pendingFold, null);
  revalidatePath("/");
  redirect(`/workout/${workoutId}`);
}
```

Leave every other function in the file untouched — in particular `skipNextSession`, `finishWorkout`, and `discardWorkout`.

- [ ] **Step 3: Verify types, lint, and tests**

Run: `npx tsc --noEmit` — expected: exit 0. This is the step that catches a mistake in the `PlanExercise` / `PlanDayRow` typing of the extracted helper.
Run: `npm run lint` — expected: clean.
Run: `npx vitest run` — expected: still 5 files / 63 tests passing. This task adds no tests: `swapSession` is a database-backed server action and the project has no harness for those (no DB test fixtures, `environment: "node"`, no @testing-library). Its logic is verified by the type checker, the build, and the end-to-end run in Task 3.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds. If it fails because of files outside this task — including any uncommitted work listed in the prerequisite — report the error verbatim rather than fixing it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions.ts
git commit -m "Swap session: action that shifts the prescribed day aside"
```

---

### Task 3: The swap picker on the Today page

**Files:**
- Modify: `src/app/TodayActions.tsx` — imports, props, state, and JSX
- Modify: `src/app/page.tsx` — imports (lines 5-6), a new `swapDays` computation, and the `<TodayActions />` call at line 109

**Interfaces:**
- Consumes: `swapSession(planDayId: number): Promise<void>` from `@/lib/actions` (Task 2); `getActivePlanDays(): Promise<PlanDayRow[]>` from `@/lib/data`; `sessionMuscles(exs: PlanExercise[]): Set<string>` and `estimateMinutes(exs: PlanExercise[]): number` from `@/lib/adapt`, all already exported.
- Produces: `export interface SwapDay { id: number; focus: string; muscles: string[]; estimate: number }` from `src/app/TodayActions.tsx`, imported by `src/app/page.tsx`.

- [ ] **Step 1: Add the prop, state, and handler to `TodayActions`**

In `src/app/TodayActions.tsx`, change the import on line 4 and add the interface and props. The file's first four lines become:

```tsx
"use client";

import { useState, useTransition } from "react";
import { skipNextSession, startWorkout, swapSession } from "@/lib/actions";
import type { SkipDecision } from "@/lib/types";

/** One alternative plan day offered by the swap sheet. */
export interface SwapDay {
  id: number;
  focus: string;
  /** dataset target names, e.g. ["pectorals", "lats", "quads"]; empty for cardio */
  muscles: string[];
  estimate: number;
}
```

Then replace the component signature and the two state lines (lines 7-13 as they stand today) with:

```tsx
export default function TodayActions({
  estimateFull,
  swapDays,
}: {
  estimateFull: number;
  swapDays: SwapDay[];
}) {
  const [pending, startTransition] = useTransition();
  const [showSkip, setShowSkip] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
```

and add this handler next to the existing `start` and `skip` handlers:

```tsx
  const swap = (planDayId: number) =>
    startTransition(() => swapSession(planDayId));
```

- [ ] **Step 2: Add the swap panel to the JSX**

Insert this block between the `timeOptions` block and the `{!showSkip ? ... }` block — so the friendlier option is found before "Can't train today?":

```tsx
      {swapDays.length > 0 &&
        (!showSwap ? (
          <button
            onClick={() => setShowSwap(true)}
            className="py-2 text-sm text-muted"
          >
            ⇄ Swap session
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3">
            <p className="text-sm text-muted">Train something else instead:</p>
            {swapDays.map((d) => (
              <button
                key={d.id}
                disabled={pending}
                onClick={() => swap(d.id)}
                className="rounded-lg bg-surface-2 px-3 py-2.5 text-left text-sm disabled:opacity-50"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{d.focus}</span>
                  <span className="shrink-0 text-xs text-muted">
                    ~{d.estimate} min
                  </span>
                </span>
                <span className="block text-xs capitalize text-muted">
                  {d.muscles.length > 0 ? d.muscles.join(" · ") : "cardio only"}
                </span>
              </button>
            ))}
            <button
              onClick={() => setShowSwap(false)}
              className="text-xs text-muted"
            >
              Cancel
            </button>
          </div>
        ))}
```

The `swapDays.length > 0` guard means a single-day plan shows no trigger at all.

- [ ] **Step 3: Build the rows in `page.tsx`**

In `src/app/page.tsx`, extend the two imports on lines 5-6:

```tsx
import { estimateMinutes, foldIntoSession, sessionMuscles } from "@/lib/adapt";
import {
  getActivePlanDays,
  getActivities,
  getNextSession,
  getProfile,
  getWorkouts,
} from "@/lib/data";
```

and add the `TodayActions` type import next to the existing default import:

```tsx
import TodayActions, { type SwapDay } from "./TodayActions";
```

Then, immediately after the existing `const estimate = estimateMinutes(sessionExercises);` line, add:

```tsx
  // the other plan days, offered when today's prescription doesn't suit
  const swapDays: SwapDay[] = (await getActivePlanDays())
    .filter((d) => d.id !== next.planDay.id)
    .map((d) => ({
      id: d.id,
      focus: d.focus,
      muscles: [...sessionMuscles(d.exercises)].slice(0, 3),
      estimate: estimateMinutes(d.exercises),
    }));
```

Finally, change line 109 from `<TodayActions estimateFull={estimate} />` to:

```tsx
          <TodayActions estimateFull={estimate} swapDays={swapDays} />
```

- [ ] **Step 4: Verify types, lint, tests, build**

Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npm run lint` — expected: clean.
Run: `npx vitest run` — expected: 5 files / 63 tests passing, unchanged. No tests are added here: the project has no component-test infrastructure (`vitest.config.ts` sets `environment: "node"` and no @testing-library is installed), and the logic this task adds is a `filter`/`map` over already-tested helpers.
Run: `npm run build` — expected: succeeds.

- [ ] **Step 5: Verify end-to-end in the real app — this is the task's actual proof**

The whole point of the feature is that the passed-over day comes back. That cannot be seen from a unit test of `nextPosition` alone, so drive it:

Run `npm run dev`. The app sits behind an auth gate (`src/proxy.ts`), so log in at `/login` with the `APP_PIN` from `.env.local`.

1. On the Today page, note which session is under **"Next up:"**. Call it **P**.
2. Confirm a `⇄ Swap session` button is present. Tap it. Expected: a panel listing every *other* plan day, each with its focus, a `~N min` estimate, and either a capitalised muscle list or "cardio only".
3. **Pick the Cardio day** — this specific choice matters, see the note below. Expected: you land on `/workout/<id>` showing the cardio session.
4. Complete it: log the cardio entry, tap **Finish workout**, then **Done** on the summary.
5. Back on Today, expected: **"Next up:" is P again** — the day you swapped away from has come straight back.

**Why the Cardio day specifically.** After you finish a session, `chooseNextPosition` still rotates past any day that repeats muscles trained today. On a full-body plan almost every day overlaps every other, so finishing a *lifting* day would legitimately push P aside for recovery and you would see a different day at step 5 — correct behaviour, but it hides what you are testing. A cardio day loads no muscles (`sessionMuscles` skips `role: "cardio"`), so `recent` stays empty and the pending shift shows through cleanly. If the user's plan has no cardio day, run steps 1-5 across two calendar days instead, or verify via `nextPosition` unit tests only and say so in your report.

Also confirm, while you are there: tapping `Cancel` closes the panel without starting anything.

- [ ] **Step 6: Commit**

```bash
git add src/app/TodayActions.tsx src/app/page.tsx
git commit -m "Today: swap session picker"
```

---

## Done when

- The Today page offers `⇄ Swap session`, listing the other plan days with muscles and time estimates.
- Picking one starts that session immediately, at full length.
- The passed-over day is next up afterwards, and stays next until it is actually trained.
- "Shift my week" now also survives training something else — the same rule, and the reason it was worth changing.
- `npx vitest run` reports 5 files / 63 tests passing, `npx tsc --noEmit` exits 0, `npm run lint` is clean, and `npm run build` succeeds.
