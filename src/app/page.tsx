export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { estimateMinutes, foldIntoSession } from "@/lib/adapt";
import { getActivities, getNextSession, getProfile, getWorkouts } from "@/lib/data";
import { getExercise } from "@/lib/exercises";
import ActivityCard from "./ActivityCard";
import TodayActions from "./TodayActions";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function TodayPage() {
  const profile = await getProfile();
  if (!profile) redirect("/onboarding");

  const next = await getNextSession();
  if (!next) redirect("/onboarding");

  const workouts = await getWorkouts();
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7; // Mon = 0
  const isTrainingDay = profile.weekdays.includes(todayIdx);

  // sessions completed in the last 7 days
  const weekAgo = now.getTime() - 7 * 24 * 3600 * 1000;
  const doneThisWeek = workouts.filter(
    (w) => w.status === "completed" && w.startedAt.getTime() >= weekAgo
  ).length;

  const sessionExercises = next.pendingFold
    ? foldIntoSession(next.planDay.exercises, next.pendingFold.exercises)
    : next.planDay.exercises;
  const estimate = estimateMinutes(sessionExercises);

  const scheduledToday = profile.weeklyActivities.filter(
    (a) => a.weekday === todayIdx
  );
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const loggedToday = (await getActivities())
    .filter((a) => a.performedAt.getTime() >= startOfDay.getTime())
    .map((a) => ({ id: a.id, name: a.name, minutes: a.minutes }));

  return (
    <main className="flex flex-col gap-5">
      <header>
        <p className="text-sm text-muted">
          {WEEKDAY_LABELS[todayIdx]} ·{" "}
          {isTrainingDay ? "Training day" : "Rest day (but you can still train)"}
        </p>
        <h1 className="text-2xl font-bold">
          {doneThisWeek}/{profile.daysPerWeek} sessions this week
        </h1>
      </header>

      {next.inProgress ? (
        <Link
          href={`/workout/${next.inProgress.id}`}
          className="rounded-xl bg-warning/20 border border-warning/50 p-4"
        >
          <div className="font-semibold">Workout in progress</div>
          <div className="text-sm text-muted">Tap to continue logging →</div>
        </Link>
      ) : (
        <>
          <section className="rounded-2xl border border-border-subtle bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">
                Next up: {next.planDay.focus}
              </h2>
              <span className="text-sm text-muted">
                {sessionExercises.length} exercises
              </span>
            </div>
            {next.pendingFold && (
              <p className="mt-1 rounded-lg bg-accent/10 px-2 py-1 text-xs text-accent">
                Includes key lifts folded in from your skipped session 👍
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-2">
              {sessionExercises.map((pe) => {
                const ex = getExercise(pe.exerciseId);
                if (!ex) return null;
                return (
                  <li
                    key={pe.exerciseId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="capitalize">
                      {pe.role === "primary" && (
                        <span className="mr-1 text-accent">★</span>
                      )}
                      {pe.role === "cardio" && (
                        <span className="mr-1 text-accent">♥</span>
                      )}
                      {ex.name}
                    </span>
                    <span className="shrink-0 pl-2 text-muted">
                      {pe.role === "cardio"
                        ? `${pe.minutes ?? 10} min`
                        : `${pe.sets}×${pe.repsLow}–${pe.repsHigh}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <TodayActions estimateFull={estimate} />
        </>
      )}
      <ActivityCard
        scheduledToday={scheduledToday}
        loggedToday={loggedToday}
      />
    </main>
  );
}
