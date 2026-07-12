export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActivePlanDays, getProfile } from "@/lib/data";
import { getExercise, gifUrl, imageUrl } from "@/lib/exercises";
import PlanView, { type PlanDayView } from "./PlanView";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function PlanPage() {
  const profile = await getProfile();
  if (!profile) redirect("/onboarding");
  const days = await getActivePlanDays();
  if (days.length === 0) redirect("/onboarding");

  const views: PlanDayView[] = days.map((d, i) => ({
    id: d.id,
    focus: d.focus,
    weekdayLabel:
      profile.weekdays[i] !== undefined
        ? WEEKDAY_LABELS[profile.weekdays[i]]
        : null,
    exercises: d.exercises
      .map((pe) => {
        const ex = getExercise(pe.exerciseId);
        if (!ex) return null;
        return {
          exerciseId: ex.id,
          name: ex.name,
          equipment: ex.equipment,
          target: ex.target,
          gifUrl: gifUrl(ex),
          imageUrl: imageUrl(ex),
          steps: ex.steps,
          sets: pe.sets,
          repsLow: pe.repsLow,
          repsHigh: pe.repsHigh,
          role: pe.role,
          minutes: pe.minutes ?? null,
        };
      })
      .filter((v) => v !== null),
  }));

  return <PlanView days={views} />;
}
