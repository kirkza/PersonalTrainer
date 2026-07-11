"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSet,
  discardWorkout,
  finishWorkout,
  logSet,
  swapInWorkout,
} from "@/lib/actions";
import type { SessionExerciseView } from "@/lib/data";
import ExerciseGif from "@/components/ExerciseGif";
import SwapSheet from "@/components/SwapSheet";

interface SetRowState {
  id: number | null; // null = not logged yet
  reps: string;
  weight: string;
}

function initialRows(ex: SessionExerciseView): SetRowState[] {
  const rows: SetRowState[] = ex.logged.map((s) => ({
    id: s.id,
    reps: String(s.reps),
    weight: String(s.weight),
  }));
  while (rows.length < ex.sets) {
    const i = rows.length;
    rows.push({
      id: null,
      reps: String(ex.lastTime[i]?.reps ?? ex.repsHigh),
      weight: String(ex.lastTime[i]?.weight ?? ""),
    });
  }
  return rows;
}

function ExerciseCard({
  workoutId,
  ex,
  units,
}: {
  workoutId: number;
  ex: SessionExerciseView;
  units: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<SetRowState[]>(() => initialRows(ex));
  const [showSteps, setShowSteps] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [, startTransition] = useTransition();

  const update = (i: number, patch: Partial<SetRowState>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const log = (i: number) => {
    const row = rows[i];
    const reps = parseInt(row.reps, 10);
    const weight = parseFloat(row.weight) || 0;
    if (!reps || reps < 1) return;
    startTransition(async () => {
      const { id } = await logSet(workoutId, ex.exerciseId, i + 1, reps, weight);
      update(i, { id });
    });
  };

  const unlog = (i: number) => {
    const row = rows[i];
    if (row.id === null) return;
    const id = row.id;
    update(i, { id: null });
    startTransition(() => deleteSet(id));
  };

  const doneCount = rows.filter((r) => r.id !== null).length;

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-3">
      <div className="flex gap-3">
        <ExerciseGif
          imageUrl={ex.imageUrl}
          gifUrl={ex.gifUrl}
          name={ex.name}
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold capitalize leading-tight">
            {ex.role === "primary" && <span className="text-accent">★ </span>}
            {ex.name}
          </h3>
          <p className="text-xs capitalize text-muted">
            {ex.target} · {ex.equipment}
          </p>
          <p className="mt-1 text-sm text-muted">
            {ex.sets} × {ex.repsLow}–{ex.repsHigh} reps
            {ex.lastTime.length > 0 && (
              <span className="ml-2 text-xs">
                (last: {ex.lastTime.map((s) => `${s.reps}×${s.weight}`).join(", ")})
              </span>
            )}
          </p>
          <div className="mt-1 flex gap-3 text-xs">
            <button onClick={() => setShowSteps((s) => !s)} className="text-accent">
              {showSteps ? "Hide how-to" : "How to do it"}
            </button>
            <button onClick={() => setSwapping(true)} className="text-warning">
              ⇄ Swap
            </button>
          </div>
        </div>
      </div>

      {showSteps && (
        <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
          {ex.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-center text-xs text-muted">{i + 1}</span>
            <input
              type="number"
              inputMode="decimal"
              value={row.weight}
              disabled={row.id !== null}
              onChange={(e) => update(i, { weight: e.target.value })}
              placeholder="0"
              className="w-0 flex-1 rounded-lg border border-border-subtle bg-surface-2 px-2 py-2 text-center text-sm disabled:opacity-60"
            />
            <span className="w-6 text-xs text-muted">{units}</span>
            <input
              type="number"
              inputMode="numeric"
              value={row.reps}
              disabled={row.id !== null}
              onChange={(e) => update(i, { reps: e.target.value })}
              className="w-0 flex-1 rounded-lg border border-border-subtle bg-surface-2 px-2 py-2 text-center text-sm disabled:opacity-60"
            />
            <span className="w-8 text-xs text-muted">reps</span>
            {row.id === null ? (
              <button
                onClick={() => log(i)}
                className="rounded-lg bg-accent-strong px-3 py-2 text-sm font-bold text-black"
              >
                ✓
              </button>
            ) : (
              <button
                onClick={() => unlog(i)}
                className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-danger"
                aria-label="Remove set"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() =>
            setRows((r) => [
              ...r,
              {
                id: null,
                reps: r.at(-1)?.reps ?? String(ex.repsHigh),
                weight: r.at(-1)?.weight ?? "",
              },
            ])
          }
          className="self-start pl-7 text-xs text-muted"
        >
          + Add set
        </button>
      </div>

      {doneCount >= ex.sets && (
        <p className="mt-2 text-right text-xs text-accent">Done ✓</p>
      )}

      {swapping && (
        <SwapSheet
          exerciseId={ex.exerciseId}
          exerciseName={ex.name}
          askScope
          onClose={() => setSwapping(false)}
          onPick={(newId, always) => {
            setSwapping(false);
            startTransition(async () => {
              await swapInWorkout(workoutId, ex.exerciseId, newId, always);
              router.refresh();
            });
          }}
        />
      )}
    </section>
  );
}

export default function WorkoutSession({
  workoutId,
  focus,
  targetMinutes,
  exercises,
  units,
}: {
  workoutId: number;
  focus: string;
  targetMinutes: number | null;
  exercises: SessionExerciseView[];
  units: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <main className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{focus}</h1>
        {targetMinutes && (
          <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">
            ⏱ {targetMinutes} min version
          </span>
        )}
      </header>

      {exercises.map((ex) => (
        <ExerciseCard
          key={ex.exerciseId}
          workoutId={workoutId}
          ex={ex}
          units={units}
        />
      ))}

      <button
        disabled={pending}
        onClick={() => {
          if (window.confirm("Finish this workout?")) {
            startTransition(() => finishWorkout(workoutId));
          }
        }}
        className="rounded-xl bg-accent-strong py-3.5 font-semibold text-black disabled:opacity-50"
      >
        Finish workout 🎉
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (window.confirm("Discard this workout and its logged sets?")) {
            startTransition(() => discardWorkout(workoutId));
          }
        }}
        className="pb-4 text-center text-sm text-danger"
      >
        Discard workout
      </button>
    </main>
  );
}
