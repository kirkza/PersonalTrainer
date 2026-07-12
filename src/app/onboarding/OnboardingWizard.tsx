"use client";

import { useState, useTransition } from "react";
import { completeOnboarding } from "@/lib/actions";
import type { Experience, Goal, Profile } from "@/lib/types";

const GOALS: { value: Goal; label: string; desc: string }[] = [
  { value: "strength", label: "Get stronger", desc: "Heavy compounds, low reps" },
  { value: "hypertrophy", label: "Build muscle", desc: "Moderate weights, 6–12 reps" },
  { value: "general", label: "General fitness", desc: "Balanced, higher reps" },
];

const EXPERIENCE: { value: Experience; label: string; desc: string }[] = [
  { value: "beginner", label: "Beginner", desc: "< 1 year of consistent training" },
  { value: "intermediate", label: "Intermediate", desc: "1–3 years" },
  { value: "advanced", label: "Advanced", desc: "3+ years" },
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const COMMON_EQUIPMENT = [
  "body weight",
  "dumbbell",
  "barbell",
  "cable",
  "leverage machine",
  "smith machine",
  "kettlebell",
  "ez barbell",
  "band",
];

const DEFAULT_GYM = [
  "body weight",
  "dumbbell",
  "barbell",
  "cable",
  "leverage machine",
  "smith machine",
  "ez barbell",
];

export default function OnboardingWizard({
  allEquipment,
}: {
  allEquipment: string[];
}) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>("hypertrophy");
  const [experience, setExperience] = useState<Experience>("beginner");
  const [weekdays, setWeekdays] = useState<number[]>([0, 2, 4]);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [cardioFinisher, setCardioFinisher] = useState(false);
  const [cardioDay, setCardioDay] = useState(false);
  const [equipment, setEquipment] = useState<string[]>(DEFAULT_GYM);
  const [showAllGear, setShowAllGear] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = (list: number[], v: number) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort();

  const toggleGear = (v: string) =>
    setEquipment((eq) =>
      eq.includes(v) ? eq.filter((x) => x !== v) : [...eq, v]
    );

  const finish = () => {
    const profile: Profile = {
      goal,
      experience,
      daysPerWeek: weekdays.length,
      weekdays,
      sessionMinutes,
      equipment,
      units: "kg",
      cardioFinisher,
      cardioDay: cardioDay && weekdays.length >= 3,
    };
    startTransition(() => completeOnboarding(profile));
  };

  const steps = [
    // 0: goal
    <div key="goal" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">What&apos;s your main goal?</h2>
      {GOALS.map((g) => (
        <button
          key={g.value}
          onClick={() => {
            setGoal(g.value);
            setStep(1);
          }}
          className={`rounded-xl border p-4 text-left ${
            goal === g.value
              ? "border-accent bg-surface-2"
              : "border-border-subtle bg-surface"
          }`}
        >
          <div className="font-medium">{g.label}</div>
          <div className="text-sm text-muted">{g.desc}</div>
        </button>
      ))}
    </div>,
    // 1: experience
    <div key="exp" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Training experience?</h2>
      {EXPERIENCE.map((e) => (
        <button
          key={e.value}
          onClick={() => {
            setExperience(e.value);
            setStep(2);
          }}
          className={`rounded-xl border p-4 text-left ${
            experience === e.value
              ? "border-accent bg-surface-2"
              : "border-border-subtle bg-surface"
          }`}
        >
          <div className="font-medium">{e.label}</div>
          <div className="text-sm text-muted">{e.desc}</div>
        </button>
      ))}
    </div>,
    // 2: weekdays
    <div key="days" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Which days can you train?</h2>
      <p className="text-sm text-muted">
        Pick 2–6 days. Don&apos;t worry — the plan adapts when life happens.
      </p>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((d, i) => (
          <button
            key={d}
            onClick={() => setWeekdays((w) => toggle(w, i))}
            className={`rounded-lg border py-3 text-xs font-medium ${
              weekdays.includes(i)
                ? "border-accent bg-accent/15 text-accent"
                : "border-border-subtle bg-surface text-muted"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      <button
        disabled={weekdays.length < 2 || weekdays.length > 6}
        onClick={() => setStep(3)}
        className="mt-2 rounded-xl bg-accent-strong py-3 font-semibold text-black disabled:opacity-40"
      >
        {weekdays.length < 2
          ? "Pick at least 2 days"
          : weekdays.length > 6
            ? "Max 6 days"
            : `Train ${weekdays.length} days / week`}
      </button>
    </div>,
    // 3: session length
    <div key="time" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">How long is a typical session?</h2>
      {[30, 45, 60, 75, 90].map((m) => (
        <button
          key={m}
          onClick={() => {
            setSessionMinutes(m);
            setStep(4);
          }}
          className={`rounded-xl border p-4 text-left font-medium ${
            sessionMinutes === m
              ? "border-accent bg-surface-2"
              : "border-border-subtle bg-surface"
          }`}
        >
          {m} minutes
        </button>
      ))}
    </div>,
    // 4: cardio
    <div key="cardio" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Add cardio?</h2>
      <p className="text-sm text-muted">
        Optional — good for your heart and recovery. Both are tracked in the
        app.
      </p>
      <button
        onClick={() => setCardioFinisher((v) => !v)}
        className={`rounded-xl border p-4 text-left ${
          cardioFinisher
            ? "border-accent bg-surface-2"
            : "border-border-subtle bg-surface"
        }`}
      >
        <div className="font-medium">
          {cardioFinisher ? "✓ " : ""}Finisher after lifting
        </div>
        <div className="text-sm text-muted">
          ~10 min of cardio at the end of each session (inside your time
          budget)
        </div>
      </button>
      <button
        onClick={() => weekdays.length >= 3 && setCardioDay((v) => !v)}
        disabled={weekdays.length < 3}
        className={`rounded-xl border p-4 text-left disabled:opacity-40 ${
          cardioDay && weekdays.length >= 3
            ? "border-accent bg-surface-2"
            : "border-border-subtle bg-surface"
        }`}
      >
        <div className="font-medium">
          {cardioDay && weekdays.length >= 3 ? "✓ " : ""}Dedicated cardio day
        </div>
        <div className="text-sm text-muted">
          {weekdays.length < 3
            ? "Needs at least 3 training days"
            : "One of your training days becomes a cardio session"}
        </div>
      </button>
      <button
        onClick={() => setStep(5)}
        className="mt-2 rounded-xl bg-accent-strong py-3 font-semibold text-black"
      >
        {cardioFinisher || (cardioDay && weekdays.length >= 3)
          ? "Continue"
          : "Skip cardio"}
      </button>
    </div>,
    // 5: equipment
    <div key="gear" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">What does your gym have?</h2>
      <p className="text-sm text-muted">
        Only these will be prescribed — and you can swap any exercise later.
      </p>
      <div className="flex flex-wrap gap-2">
        {(showAllGear ? allEquipment : COMMON_EQUIPMENT).map((g) => (
          <button
            key={g}
            onClick={() => toggleGear(g)}
            className={`rounded-full border px-3 py-1.5 text-sm capitalize ${
              equipment.includes(g)
                ? "border-accent bg-accent/15 text-accent"
                : "border-border-subtle bg-surface text-muted"
            }`}
          >
            {g}
          </button>
        ))}
      </div>
      {!showAllGear && (
        <button
          onClick={() => setShowAllGear(true)}
          className="self-start text-sm text-accent underline"
        >
          Show all equipment
        </button>
      )}
      <button
        disabled={equipment.length === 0 || pending}
        onClick={finish}
        className="mt-2 rounded-xl bg-accent-strong py-3 font-semibold text-black disabled:opacity-40"
      >
        {pending ? "Building your plan…" : "Build my plan 💪"}
      </button>
    </div>,
  ];

  return (
    <main className="flex flex-col gap-6 pt-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Let&apos;s set you up</h1>
          <span className="text-sm text-muted">{step + 1}/6</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded bg-surface-2">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${((step + 1) / 6) * 100}%` }}
          />
        </div>
      </div>
      {steps[step]}
      {step > 0 && (
        <button
          onClick={() => setStep((s) => s - 1)}
          className="self-start text-sm text-muted"
        >
          ← Back
        </button>
      )}
    </main>
  );
}
