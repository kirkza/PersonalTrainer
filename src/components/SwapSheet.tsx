"use client";

import { useEffect, useState } from "react";
import { getAlternatives, type AlternativeView } from "@/lib/actions";
import ExerciseGif from "./ExerciseGif";

/**
 * Bottom sheet listing substitutes for an exercise. `onPick` receives the
 * chosen exercise id and whether the swap should be permanent.
 */
export default function SwapSheet({
  exerciseId,
  exerciseName,
  askScope,
  onPick,
  onClose,
}: {
  exerciseId: string;
  exerciseName: string;
  /** when false the swap is always permanent (plan editing) */
  askScope: boolean;
  onPick: (newId: string, always: boolean) => void;
  onClose: () => void;
}) {
  const [alts, setAlts] = useState<AlternativeView[] | null>(null);
  const [chosen, setChosen] = useState<AlternativeView | null>(null);

  useEffect(() => {
    getAlternatives(exerciseId).then(setAlts);
  }, [exerciseId]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/60">
      <button className="flex-1" onClick={onClose} aria-label="Close" />
      <div className="max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-border-subtle bg-surface p-4">
        {!chosen ? (
          <>
            <h3 className="text-base font-semibold">
              Swap <span className="capitalize">{exerciseName}</span>
            </h3>
            <p className="mb-3 text-xs text-muted">
              Same target muscle, matched to your gym&apos;s equipment · tap a
              picture to preview it
            </p>
            {alts === null ? (
              <p className="py-8 text-center text-sm text-muted">Loading…</p>
            ) : alts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No alternatives found for this one.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {alts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-2 p-2"
                  >
                    {/* separate tap targets: picture previews, name selects */}
                    <ExerciseGif
                      imageUrl={a.imageUrl}
                      gifUrl={a.gifUrl}
                      name={a.name}
                      size={56}
                    />
                    <button
                      onClick={() =>
                        askScope ? setChosen(a) : onPick(a.id, true)
                      }
                      className="min-w-0 flex-1 py-2 text-left"
                    >
                      <span className="block text-sm font-medium capitalize">
                        {a.name}
                      </span>
                      <span className="text-xs capitalize text-muted">
                        {a.equipment}
                      </span>
                    </button>
                    <span className="pr-1 text-muted">›</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold capitalize">
              Use {chosen.name}?
            </h3>
            <button
              onClick={() => onPick(chosen.id, false)}
              className="rounded-xl bg-surface-2 p-3 text-left"
            >
              <span className="block font-medium">Just today</span>
              <span className="text-xs text-muted">
                e.g. the machine is busy or out of order
              </span>
            </button>
            <button
              onClick={() => onPick(chosen.id, true)}
              className="rounded-xl bg-surface-2 p-3 text-left"
            >
              <span className="block font-medium">Always</span>
              <span className="text-xs text-muted">
                Replace it in my plan — my gym doesn&apos;t have it / I prefer
                this one
              </span>
            </button>
            <button
              onClick={() => setChosen(null)}
              className="text-sm text-muted"
            >
              ← Back to list
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
