"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regeneratePlan, swapInPlanDay } from "@/lib/actions";
import ExerciseGif from "@/components/ExerciseGif";
import SwapSheet from "@/components/SwapSheet";

export interface PlanExerciseView {
  exerciseId: string;
  name: string;
  equipment: string;
  target: string;
  gifUrl: string;
  imageUrl: string;
  steps: string[];
  sets: number;
  repsLow: number;
  repsHigh: number;
  role: string;
}

export interface PlanDayView {
  id: number;
  focus: string;
  weekdayLabel: string | null;
  exercises: PlanExerciseView[];
}

export default function PlanView({ days }: { days: PlanDayView[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [swap, setSwap] = useState<{
    planDayId: number;
    ex: PlanExerciseView;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <main className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Your week</h1>
        <button
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(
                "Generate a fresh plan? Your swaps will be replaced."
              )
            ) {
              startTransition(async () => {
                await regeneratePlan();
                router.refresh();
              });
            }
          }}
          className="text-sm text-accent disabled:opacity-50"
        >
          ↻ Regenerate
        </button>
      </header>

      {days.map((day) => (
        <section
          key={day.id}
          className="rounded-2xl border border-border-subtle bg-surface p-3"
        >
          <h2 className="flex items-baseline justify-between font-semibold">
            {day.focus}
            {day.weekdayLabel && (
              <span className="text-xs font-normal text-muted">
                {day.weekdayLabel}
              </span>
            )}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {day.exercises.map((ex) => {
              const key = `${day.id}-${ex.exerciseId}`;
              const open = expanded === key;
              return (
                <li
                  key={key}
                  className="rounded-xl bg-surface-2 p-2"
                >
                  <div className="flex items-center gap-3">
                    <ExerciseGif
                      imageUrl={ex.imageUrl}
                      gifUrl={ex.gifUrl}
                      name={ex.name}
                      size={56}
                    />
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setExpanded(open ? null : key)}
                    >
                      <span className="block text-sm font-medium capitalize leading-tight">
                        {ex.role === "primary" && (
                          <span className="text-accent">★ </span>
                        )}
                        {ex.name}
                      </span>
                      <span className="text-xs capitalize text-muted">
                        {ex.sets}×{ex.repsLow}–{ex.repsHigh} · {ex.equipment}
                      </span>
                    </button>
                    <button
                      onClick={() => setSwap({ planDayId: day.id, ex })}
                      className="px-1 text-sm text-warning"
                      aria-label={`Swap ${ex.name}`}
                    >
                      ⇄
                    </button>
                  </div>
                  {open && (
                    <ol className="mt-2 flex list-decimal flex-col gap-1 pl-6 text-xs text-muted">
                      {ex.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {swap && (
        <SwapSheet
          exerciseId={swap.ex.exerciseId}
          exerciseName={swap.ex.name}
          askScope={false}
          onClose={() => setSwap(null)}
          onPick={(newId) => {
            const s = swap;
            setSwap(null);
            startTransition(async () => {
              await swapInPlanDay(s.planDayId, s.ex.exerciseId, newId);
              router.refresh();
            });
          }}
        />
      )}
    </main>
  );
}
