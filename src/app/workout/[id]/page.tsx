import { notFound, redirect } from "next/navigation";
import {
  getProfile,
  getSetsForWorkout,
  getWorkout,
  lastSetsFor,
  notesFor,
  toExerciseView,
} from "@/lib/data";
import { getActivePlanDays } from "@/lib/data";
import WorkoutSession from "./WorkoutSession";

export default async function WorkoutPage({
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
  if (workout.status !== "in_progress") redirect("/");

  const exerciseIds = workout.exercises.map((e) => e.exerciseId);
  const [logged, lastTime, notes, planDays] = await Promise.all([
    getSetsForWorkout(workoutId),
    lastSetsFor(exerciseIds),
    notesFor(exerciseIds),
    getActivePlanDays(),
  ]);

  const focus =
    planDays.find((d) => d.id === workout.planDayId)?.focus ?? "Workout";

  const views = workout.exercises
    .map((pe) =>
      toExerciseView(
        pe,
        logged,
        lastTime.get(pe.exerciseId) ?? [],
        notes.get(pe.exerciseId) ?? null
      )
    )
    .filter((v) => v !== null);

  return (
    <WorkoutSession
      key={workout.exercises.map((e) => e.exerciseId).join(",")}
      workoutId={workoutId}
      focus={focus}
      targetMinutes={workout.targetMinutes}
      sessionMinutes={profile.sessionMinutes}
      startedAtIso={workout.startedAt.toISOString()}
      restSeconds={profile.restSeconds}
      exercises={views}
      units={profile.units}
    />
  );
}
