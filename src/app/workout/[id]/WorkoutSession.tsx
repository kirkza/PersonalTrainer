"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSet,
  discardWorkout,
  finishWorkout,
  logSet,
  saveExerciseNote,
  swapInWorkout,
} from "@/lib/actions";
import { NOTE_MAX_LENGTH, normalizeNote } from "@/lib/notes";
import type { SessionExerciseView } from "@/lib/data";
import { canRemoveLastRow } from "@/lib/set-rows";
import ExerciseGif from "@/components/ExerciseGif";
import RestTimer, {
  maybeRequestNotifications,
  primeAudio,
} from "@/components/RestTimer";
import SwapSheet from "@/components/SwapSheet";

interface SetRowState {
  id: number | null; // null = not logged yet
  reps: string;
  weight: string;
  /** save in flight — the button stays down so one tap cannot become two */
  saving?: boolean;
}

/** Live session clock — a nudge that time in the gym ≠ work done. */
function ElapsedTimer({
  startedAtIso,
  targetMinutes,
}: {
  startedAtIso: string;
  targetMinutes: number;
}) {
  const startedMs = new Date(startedAtIso).getTime();
  const [elapsedMin, setElapsedMin] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedMs) / 60000))
  );

  useEffect(() => {
    const tick = () =>
      setElapsedMin(Math.max(0, Math.floor((Date.now() - startedMs) / 60000)));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [startedMs]);

  const over = elapsedMin > targetMinutes;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        over ? "bg-warning/20 text-warning" : "bg-surface-2 text-muted"
      }`}
      title={over ? `Over your ${targetMinutes} min target` : undefined}
    >
      ⏱ {elapsedMin} / {targetMinutes} min
    </span>
  );
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


/**
 * The living setup note for an exercise ("seat height 4, pin 12"). Always
 * visible when present — resurfacing it un-asked is the point — and edited in
 * place. Saving an emptied note removes it.
 */
function ExerciseNote({
  exerciseId,
  note,
}: {
  exerciseId: string;
  note: string | null;
}) {
  const [current, setCurrent] = useState(note);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  const save = () => {
    const previous = current;
    setCurrent(normalizeNote(draft));
    setEditing(false);
    setFailed(false);
    startTransition(async () => {
      const { saved } = await saveExerciseNote(exerciseId, draft);
      // showing an unsaved note as saved loses it silently on the next refresh
      if (!saved) {
        setCurrent(previous);
        setFailed(true);
      }
    });
  };

  if (editing) {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          rows={2}
          autoFocus
          placeholder="Setup to remember — seat height, pin, attachment…"
          className="w-full rounded-lg border border-border-subtle bg-surface-2 px-2 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={save}
            className="rounded-lg bg-accent-strong px-3 py-1.5 text-xs font-bold text-black"
          >
            Save
          </button>
          <button
            onClick={() => {
              setDraft(current ?? "");
              setEditing(false);
            }}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mt-2 rounded-lg bg-danger/10 px-2 py-1.5 text-xs text-danger">
        Couldn&apos;t save that note — notes aren&apos;t set up on the server
        yet.{" "}
        <button
          onClick={() => {
            setFailed(false);
            setEditing(true);
          }}
          className="underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (current !== null) {
    return (
      <button
        onClick={() => {
          setDraft(current);
          setEditing(true);
        }}
        className="mt-2 w-full rounded-lg bg-warning/10 px-2 py-1.5 text-left text-xs text-warning"
      >
        📝 {current}
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft("");
        setEditing(true);
      }}
      className="mt-2 block text-xs text-muted"
    >
      + Note
    </button>
  );
}

function CardioCard({
  workoutId,
  ex,
}: {
  workoutId: number;
  ex: SessionExerciseView;
}) {
  const [minutes, setMinutes] = useState(
    String(ex.logged[0]?.durationMin ?? ex.minutes ?? 10)
  );
  const [loggedId, setLoggedId] = useState<number | null>(
    ex.logged[0]?.id ?? null
  );
  const [saving, setSaving] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const lastDuration = ex.lastTime[0]?.durationMin;

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-3">
      <div className="flex gap-3">
        <ExerciseGif imageUrl={ex.imageUrl} gifUrl={ex.gifUrl} name={ex.name} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold capitalize leading-tight">
            <span className="text-accent">♥ </span>
            {ex.name}
          </h3>
          <p className="text-xs capitalize text-muted">
            cardio · {ex.equipment}
          </p>
          <p className="mt-1 text-sm text-muted">
            Target: {ex.minutes ?? 10} min
            {lastDuration != null && (
              <span className="ml-2 text-xs">(last: {lastDuration} min)</span>
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

      <ExerciseNote exerciseId={ex.exerciseId} note={ex.note} />

      {showSteps && (
        <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
          {ex.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={minutes}
          disabled={loggedId !== null}
          onChange={(e) => setMinutes(e.target.value)}
          className="w-0 flex-1 rounded-lg border border-border-subtle bg-surface-2 px-2 py-2 text-center text-sm disabled:opacity-60"
        />
        <span className="text-xs text-muted">minutes</span>
        {loggedId === null ? (
          <button
            onClick={() => {
              const m = parseInt(minutes, 10);
              if (!m || m < 1) return;
              if (saving) return;
              setSaving(true);
              startTransition(async () => {
                const { id } = await logSet(
                  workoutId,
                  ex.exerciseId,
                  1,
                  0,
                  0,
                  m
                );
                setLoggedId(id);
                setSaving(false);
              });
            }}
            disabled={saving}
            className="rounded-lg bg-accent-strong px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            ✓
          </button>
        ) : (
          <button
            onClick={() => {
              const id = loggedId;
              setLoggedId(null);
              startTransition(() => deleteSet(id));
            }}
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-danger"
            aria-label="Remove"
          >
            ✕
          </button>
        )}
      </div>
      {loggedId !== null && (
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

function ExerciseCard({
  workoutId,
  ex,
  units,
  onSetLogged,
}: {
  workoutId: number;
  ex: SessionExerciseView;
  units: string;
  onSetLogged: () => void;
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
    if (row.saving) return;
    // inside the tap gesture: unlock audio + (once) ask notification permission
    primeAudio();
    maybeRequestNotifications();
    onSetLogged();
    update(i, { saving: true });
    startTransition(async () => {
      const { id } = await logSet(workoutId, ex.exerciseId, i + 1, reps, weight);
      update(i, { id, saving: false });
    });
  };

  const unlog = (i: number) => {
    const row = rows[i];
    if (row.id === null) return;
    const id = row.id;
    update(i, { id: null });
    startTransition(() => deleteSet(id));
  };

  /** Take back an accidental "+ Add set". Never drops a logged set. */
  const removeLastRow = () =>
    setRows((r) => (canRemoveLastRow(r, ex.sets) ? r.slice(0, -1) : r));

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

      <ExerciseNote exerciseId={ex.exerciseId} note={ex.note} />

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
                disabled={row.saving}
                className="rounded-lg bg-accent-strong px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
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
        <div className="flex items-center gap-4 pl-7">
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
            className="text-xs text-muted"
          >
            + Add set
          </button>
          {canRemoveLastRow(rows, ex.sets) && (
            <button
              onClick={removeLastRow}
              className="text-xs text-danger"
              aria-label="Remove the set you just added"
            >
              − Remove set
            </button>
          )}
        </div>
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
  sessionMinutes,
  startedAtIso,
  restSeconds,
  exercises,
  units,
}: {
  workoutId: number;
  focus: string;
  targetMinutes: number | null;
  sessionMinutes: number;
  startedAtIso: string;
  restSeconds: number;
  exercises: SessionExerciseView[];
  units: string;
}) {
  const [pending, startTransition] = useTransition();
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);

  const startRest = () => {
    if (restSeconds > 0) setRestEndsAt(Date.now() + restSeconds * 1000);
  };

  return (
    <main className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">
          {focus}
          {targetMinutes && (
            <span className="ml-2 align-middle text-xs font-normal text-warning">
              (short version)
            </span>
          )}
        </h1>
        <ElapsedTimer
          startedAtIso={startedAtIso}
          targetMinutes={targetMinutes ?? sessionMinutes}
        />
      </header>

      {exercises.map((ex) =>
        ex.role === "cardio" ? (
          <CardioCard key={ex.exerciseId} workoutId={workoutId} ex={ex} />
        ) : (
          <ExerciseCard
            key={ex.exerciseId}
            workoutId={workoutId}
            ex={ex}
            units={units}
            onSetLogged={startRest}
          />
        )
      )}

      {restEndsAt !== null && (
        <RestTimer
          endsAt={restEndsAt}
          onDismiss={() => setRestEndsAt(null)}
          onExtend={(extra) => setRestEndsAt((t) => (t ?? Date.now()) + extra)}
        />
      )}

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
