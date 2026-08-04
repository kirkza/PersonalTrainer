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
