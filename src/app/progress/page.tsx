export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getActivities, getProfile } from "@/lib/data";
import { getExercise } from "@/lib/exercises";
import { sessionDurationMin } from "@/lib/session-summary";
import ProgressCharts, { type WeeklyVolumePoint } from "./ProgressCharts";

function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

export default async function ProgressPage() {
  const profile = await getProfile();
  if (!profile) redirect("/onboarding");

  const db = await getDb();
  const completed = await db
    .select()
    .from(schema.workouts)
    .where(eq(schema.workouts.status, "completed"))
    .orderBy(desc(schema.workouts.id));

  const allSets =
    completed.length > 0
      ? await db.select().from(schema.sets).orderBy(schema.sets.id)
      : [];
  const completedIds = new Set(completed.map((w) => w.id));
  const sets = allSets.filter((s) => completedIds.has(s.workoutId));
  const workoutById = new Map(completed.map((w) => [w.id, w]));

  // ----- weekly volume, last 8 weeks -----
  const thisMonday = mondayOf(new Date());
  const weekly: WeeklyVolumePoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const volume = sets.reduce((sum, s) => {
      const w = workoutById.get(s.workoutId);
      if (!w) return sum;
      const t = (w.finishedAt ?? w.startedAt).getTime();
      return t >= start.getTime() && t < end.getTime()
        ? sum + s.reps * s.weight
        : sum;
    }, 0);
    weekly.push({
      week: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      volume: Math.round(volume),
    });
  }

  // ----- volume by muscle (body part), last 4 training weeks -----
  const cutoff = thisMonday.getTime() - 21 * 24 * 3600 * 1000;
  const byMuscle = new Map<string, number>();
  for (const s of sets) {
    const w = workoutById.get(s.workoutId);
    if (!w || (w.finishedAt ?? w.startedAt).getTime() < cutoff) continue;
    const ex = getExercise(s.exerciseId);
    if (!ex) continue;
    const vol = s.reps * (s.weight || 0);
    byMuscle.set(ex.bodyPart, (byMuscle.get(ex.bodyPart) ?? 0) + vol);
  }
  const muscleRows = [...byMuscle.entries()]
    .filter(([, vol]) => vol > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxMuscle = muscleRows[0]?.[1] ?? 1;

  // ----- PRs: heaviest set per exercise, top by volume -----
  const perExercise = new Map<
    string,
    { volume: number; maxWeight: number; repsAtMax: number }
  >();
  for (const s of sets) {
    const cur = perExercise.get(s.exerciseId) ?? {
      volume: 0,
      maxWeight: 0,
      repsAtMax: 0,
    };
    cur.volume += s.reps * s.weight;
    if (s.weight > cur.maxWeight) {
      cur.maxWeight = s.weight;
      cur.repsAtMax = s.reps;
    }
    perExercise.set(s.exerciseId, cur);
  }
  const prs = [...perExercise.entries()]
    .filter(([, v]) => v.maxWeight > 0)
    .sort((a, b) => b[1].volume - a[1].volume)
    .slice(0, 6);

  // ----- cardio minutes this week (gym cardio + activities) -----
  const activities = await getActivities();
  const cardioThisWeek =
    sets.reduce((sum, s) => {
      const w = workoutById.get(s.workoutId);
      if (!w || s.durationMin === null) return sum;
      const t = (w.finishedAt ?? w.startedAt).getTime();
      return t >= thisMonday.getTime() ? sum + s.durationMin : sum;
    }, 0) +
    activities.reduce(
      (sum, a) =>
        a.performedAt.getTime() >= thisMonday.getTime() ? sum + a.minutes : sum,
      0
    );

  // ----- session durations (start → finish) -----
  const durationOf = (w: (typeof completed)[number]): number | null =>
    sessionDurationMin(w.startedAt, w.finishedAt);
  const recentDurations = completed
    .slice(0, 10)
    .map(durationOf)
    .filter((d): d is number => d !== null);
  const avgSessionMin =
    recentDurations.length > 0
      ? Math.round(
          recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length
        )
      : null;

  // ----- streak: consecutive weeks with a completed workout -----
  const weeksWithWork = new Set(
    completed.map((w) =>
      mondayOf(new Date(w.finishedAt ?? w.startedAt)).getTime()
    )
  );
  let streak = 0;
  let cursor = thisMonday.getTime();
  if (!weeksWithWork.has(cursor)) cursor -= 7 * 24 * 3600 * 1000;
  while (weeksWithWork.has(cursor)) {
    streak++;
    cursor -= 7 * 24 * 3600 * 1000;
  }

  // ----- history rows (workouts link to their summary; activities don't) -----
  interface HistoryEntry {
    key: string;
    date: Date;
    label: string;
    detail: string;
    href?: string;
  }

  const history: HistoryEntry[] = [
    ...completed.map((w) => {
      const dur = durationOf(w);
      return {
        key: `w${w.id}`,
        date: w.finishedAt ?? w.startedAt,
        label: "Workout",
        // lifting sets only, matching the summary this row links to — cardio
        // rows live in the same table but are represented by the minutes below
        detail: `${
          sets.filter((s) => s.workoutId === w.id && s.durationMin === null)
            .length
        } sets${dur !== null ? ` · ${dur} min` : ""}`,
        href: `/workout/${w.id}/summary`,
      };
    }),
    ...activities.map((a) => ({
      key: `a${a.id}`,
      date: a.performedAt,
      label: `🏸 ${a.name}`,
      detail: `${a.minutes} min`,
    })),
  ]
    .sort((x, y) => y.date.getTime() - x.date.getTime())
    .slice(0, 12);

  const { units } = profile;

  return (
    <main className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">Progress</h1>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border-subtle bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-accent">{streak}</div>
          <div className="text-[11px] text-muted">week streak</div>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface p-3 text-center">
          <div className="text-2xl font-bold">{completed.length}</div>
          <div className="text-[11px] text-muted">workouts</div>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface p-3 text-center">
          <div className="text-2xl font-bold">
            {weekly.at(-1)?.volume.toLocaleString() ?? 0}
          </div>
          <div className="text-[11px] text-muted">{units} this week</div>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface p-3 text-center">
          <div className="text-2xl font-bold">{cardioThisWeek}</div>
          <div className="text-[11px] text-muted">cardio min this week</div>
        </div>
        {avgSessionMin !== null && (
          <div className="col-span-2 rounded-xl border border-border-subtle bg-surface p-3 text-center">
            <div className="text-2xl font-bold">
              {avgSessionMin}
              <span className="text-sm font-normal text-muted">
                {" "}
                / {profile.sessionMinutes} min target
              </span>
            </div>
            <div className="text-[11px] text-muted">
              avg session length (last {recentDurations.length})
            </div>
          </div>
        )}
      </div>

      {completed.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface p-6 text-center text-sm text-muted">
          Finish your first workout and your progress will show up here 💪
        </p>
      ) : (
        <>
          <section className="rounded-2xl border border-border-subtle bg-surface p-3">
            <h2 className="mb-1 text-sm font-semibold">
              Weekly volume ({units})
            </h2>
            <ProgressCharts weekly={weekly} units={units} />
          </section>

          {muscleRows.length > 0 && (
            <section className="rounded-2xl border border-border-subtle bg-surface p-3">
              <h2 className="mb-2 text-sm font-semibold">
                Volume by muscle · last 4 weeks
              </h2>
              <ul className="flex flex-col gap-1.5">
                {muscleRows.map(([muscle, vol]) => (
                  <li key={muscle} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 capitalize text-muted">
                      {muscle}
                    </span>
                    <span className="h-3 flex-1 overflow-hidden rounded bg-surface-2">
                      <span
                        className="block h-full rounded"
                        style={{
                          width: `${Math.max(2, (vol / maxMuscle) * 100)}%`,
                          background: "#059669",
                        }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right text-muted">
                      {Math.round(vol).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {prs.length > 0 && (
            <section className="rounded-2xl border border-border-subtle bg-surface p-3">
              <h2 className="mb-2 text-sm font-semibold">Personal records</h2>
              <ul className="flex flex-col gap-2">
                {prs.map(([id, v]) => {
                  const ex = getExercise(id);
                  if (!ex) return null;
                  return (
                    <li
                      key={id}
                      className="flex items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0 truncate capitalize">
                        {ex.name}
                      </span>
                      <span className="shrink-0 font-semibold text-accent">
                        {v.maxWeight} {units} × {v.repsAtMax}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-border-subtle bg-surface p-3">
            <h2 className="mb-2 text-sm font-semibold">History</h2>
            <ul className="flex flex-col gap-2">
              {history.map((e) => {
                const rowClass =
                  "flex items-baseline justify-between gap-2 text-sm";
                const row = (
                  <>
                    <span className="min-w-0 truncate">
                      {e.date.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      <span className="ml-2 text-muted">{e.label}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {e.detail}
                    </span>
                  </>
                );
                return (
                  <li key={e.key}>
                    {e.href ? (
                      <Link href={e.href} className={rowClass}>
                        {row}
                      </Link>
                    ) : (
                      <div className={rowClass}>{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
