"use client";

import { useState, useTransition } from "react";
import { skipNextSession, startWorkout } from "@/lib/actions";
import type { SkipDecision } from "@/lib/types";

export default function TodayActions({
  estimateFull,
}: {
  estimateFull: number;
}) {
  const [pending, startTransition] = useTransition();
  const [showSkip, setShowSkip] = useState(false);

  const start = (minutes: number | null) =>
    startTransition(() => startWorkout(minutes));
  const skip = (decision: SkipDecision) =>
    startTransition(async () => {
      await skipNextSession(decision);
      setShowSkip(false);
    });

  const timeOptions = [45, 30].filter((m) => m < estimateFull);

  return (
    <div className="flex flex-col gap-2">
      <button
        disabled={pending}
        onClick={() => start(null)}
        className="rounded-xl bg-accent-strong py-3.5 text-center font-semibold text-black disabled:opacity-50"
      >
        Start workout · ~{estimateFull} min
      </button>
      {timeOptions.length > 0 && (
        <div className="flex gap-2">
          {timeOptions.map((m) => (
            <button
              key={m}
              disabled={pending}
              onClick={() => start(m)}
              className="flex-1 rounded-xl border border-border-subtle bg-surface py-3 text-sm font-medium disabled:opacity-50"
            >
              ⏱ Only {m} min
            </button>
          ))}
        </div>
      )}
      {!showSkip ? (
        <button
          onClick={() => setShowSkip(true)}
          className="py-2 text-sm text-muted"
        >
          Can&apos;t train today?
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3">
          <p className="text-sm text-muted">No problem. What should I do?</p>
          <button
            disabled={pending}
            onClick={() => skip("shift")}
            className="rounded-lg bg-surface-2 px-3 py-2.5 text-left text-sm"
          >
            <span className="font-medium">Shift my week</span>
            <span className="block text-xs text-muted">
              Do this session next time I train
            </span>
          </button>
          <button
            disabled={pending}
            onClick={() => skip("fold")}
            className="rounded-lg bg-surface-2 px-3 py-2.5 text-left text-sm"
          >
            <span className="font-medium">Fold it in</span>
            <span className="block text-xs text-muted">
              Add its key lifts to my next session
            </span>
          </button>
          <button
            disabled={pending}
            onClick={() => skip("drop")}
            className="rounded-lg bg-surface-2 px-3 py-2.5 text-left text-sm"
          >
            <span className="font-medium">Just skip it</span>
            <span className="block text-xs text-muted">
              Move on to the next session
            </span>
          </button>
          <button
            onClick={() => setShowSkip(false)}
            className="text-xs text-muted"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
