"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSettings } from "@/lib/actions";
import type {
  Experience,
  Goal,
  Profile,
  Units,
  WeeklyActivity,
} from "@/lib/types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SettingsForm({
  profile,
  allEquipment,
  logout,
}: {
  profile: Profile;
  allEquipment: string[];
  logout: () => Promise<void>;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState<Goal>(profile.goal);
  const [experience, setExperience] = useState<Experience>(profile.experience);
  const [weekdays, setWeekdays] = useState<number[]>(profile.weekdays);
  const [sessionMinutes, setSessionMinutes] = useState(profile.sessionMinutes);
  const [equipment, setEquipment] = useState<string[]>(profile.equipment);
  const [units, setUnits] = useState<Units>(profile.units);
  const [cardioFinisher, setCardioFinisher] = useState(profile.cardioFinisher);
  const [cardioDay, setCardioDay] = useState(profile.cardioDay);
  const [weeklyActivities, setWeeklyActivities] = useState<WeeklyActivity[]>(
    profile.weeklyActivities
  );
  const [restSeconds, setRestSeconds] = useState(profile.restSeconds);
  const [newActivity, setNewActivity] = useState("");
  const [newActivityDay, setNewActivityDay] = useState(5);
  const [newActivityMin, setNewActivityMin] = useState("90");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = (regenerate: boolean) => {
    const next: Profile = {
      goal,
      experience,
      daysPerWeek: weekdays.length,
      weekdays,
      sessionMinutes,
      equipment,
      units,
      cardioFinisher,
      cardioDay: cardioDay && weekdays.length >= 3,
      weeklyActivities,
      restSeconds,
    };
    startTransition(async () => {
      await updateSettings(next, regenerate);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    });
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm capitalize ${
      active
        ? "border-accent bg-accent/15 text-accent"
        : "border-border-subtle bg-surface text-muted"
    }`;

  return (
    <main className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">Settings</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">Goal</h2>
        <div className="flex flex-wrap gap-2">
          {(["strength", "hypertrophy", "general"] as Goal[]).map((g) => (
            <button key={g} onClick={() => setGoal(g)} className={chip(goal === g)}>
              {g}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">Experience</h2>
        <div className="flex flex-wrap gap-2">
          {(["beginner", "intermediate", "advanced"] as Experience[]).map((e) => (
            <button
              key={e}
              onClick={() => setExperience(e)}
              className={chip(experience === e)}
            >
              {e}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">Training days</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((d, i) => (
            <button
              key={d}
              onClick={() =>
                setWeekdays((w) =>
                  w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort()
                )
              }
              className={`rounded-lg border py-2.5 text-xs font-medium ${
                weekdays.includes(i)
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border-subtle bg-surface text-muted"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">Session length</h2>
        <div className="flex flex-wrap gap-2">
          {[30, 45, 60, 75, 90].map((m) => (
            <button
              key={m}
              onClick={() => setSessionMinutes(m)}
              className={chip(sessionMinutes === m)}
            >
              {m} min
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">My gym&apos;s equipment</h2>
        <div className="flex flex-wrap gap-2">
          {allEquipment.map((g) => (
            <button
              key={g}
              onClick={() =>
                setEquipment((eq) =>
                  eq.includes(g) ? eq.filter((x) => x !== g) : [...eq, g]
                )
              }
              className={chip(equipment.includes(g))}
            >
              {g}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">Cardio</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCardioFinisher((v) => !v)}
            className={chip(cardioFinisher)}
          >
            finisher after lifting
          </button>
          <button
            onClick={() => weekdays.length >= 3 && setCardioDay((v) => !v)}
            disabled={weekdays.length < 3}
            className={`${chip(cardioDay && weekdays.length >= 3)} disabled:opacity-40`}
          >
            dedicated cardio day
          </button>
        </div>
        {weekdays.length < 3 && (
          <p className="text-xs text-muted">
            A dedicated cardio day needs at least 3 training days.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">
          Rest timer (after each set)
        </h2>
        <div className="flex flex-wrap gap-2">
          {[0, 45, 60, 90, 120].map((s) => (
            <button
              key={s}
              onClick={() => setRestSeconds(s)}
              className={chip(restSeconds === s)}
            >
              {s === 0 ? "off" : `${s}s`}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">
          Weekly activities (sports, classes…)
        </h2>
        {weeklyActivities.map((a, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm"
          >
            <span>
              {a.name}{" "}
              <span className="text-xs text-muted">
                · {WEEKDAY_LABELS[a.weekday]} · ~{a.minutes} min
              </span>
            </span>
            <button
              onClick={() =>
                setWeeklyActivities((list) => list.filter((_, j) => j !== i))
              }
              className="pl-3 text-danger"
              aria-label={`Remove ${a.name}`}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3">
          <input
            type="text"
            value={newActivity}
            onChange={(e) => setNewActivity(e.target.value)}
            placeholder="e.g. Badminton"
            className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <select
              value={newActivityDay}
              onChange={(e) => setNewActivityDay(Number(e.target.value))}
              className="flex-1 rounded-lg border border-border-subtle bg-surface-2 px-2 py-2 text-sm"
            >
              {WEEKDAY_LABELS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              value={newActivityMin}
              onChange={(e) => setNewActivityMin(e.target.value)}
              className="w-20 rounded-lg border border-border-subtle bg-surface-2 px-2 py-2 text-center text-sm"
            />
            <span className="text-xs text-muted">min</span>
            <button
              disabled={!newActivity.trim() || !parseInt(newActivityMin, 10)}
              onClick={() => {
                setWeeklyActivities((list) => [
                  ...list,
                  {
                    name: newActivity.trim(),
                    weekday: newActivityDay,
                    minutes: parseInt(newActivityMin, 10),
                  },
                ]);
                setNewActivity("");
              }}
              className="rounded-lg bg-accent-strong px-3 py-2 text-sm font-bold text-black disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">Units</h2>
        <div className="flex gap-2">
          {(["kg", "lb"] as Units[]).map((u) => (
            <button key={u} onClick={() => setUnits(u)} className={chip(units === u)}>
              {u}
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-2 pt-2">
        {saved && (
          <p className="text-center text-sm text-accent">Saved ✓</p>
        )}
        <button
          disabled={pending || weekdays.length < 2 || equipment.length === 0}
          onClick={() => save(false)}
          className="rounded-xl border border-border-subtle bg-surface py-3 font-medium disabled:opacity-40"
        >
          Save (keep current plan)
        </button>
        <button
          disabled={pending || weekdays.length < 2 || equipment.length === 0}
          onClick={() => {
            if (window.confirm("Save and build a fresh plan from these settings?"))
              save(true);
          }}
          className="rounded-xl bg-accent-strong py-3 font-semibold text-black disabled:opacity-40"
        >
          Save &amp; regenerate plan
        </button>
        <button
          onClick={() => startTransition(() => logout())}
          className="py-2 text-center text-sm text-danger"
        >
          Log out
        </button>
      </div>
    </main>
  );
}
