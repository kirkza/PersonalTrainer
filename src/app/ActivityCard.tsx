"use client";

import { useState, useTransition } from "react";
import { deleteActivity, logActivity } from "@/lib/actions";
import type { WeeklyActivity } from "@/lib/types";

interface LoggedActivity {
  id: number;
  name: string;
  minutes: number;
}

function ScheduledRow({ activity }: { activity: WeeklyActivity }) {
  const [minutes, setMinutes] = useState(String(activity.minutes));
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm">
        🏸 {activity.name}
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        className="w-16 rounded-lg border border-border-subtle bg-surface-2 px-2 py-2 text-center text-sm"
      />
      <span className="text-xs text-muted">min</span>
      <button
        disabled={pending || !parseInt(minutes, 10)}
        onClick={() =>
          startTransition(() =>
            logActivity(activity.name, parseInt(minutes, 10))
          )
        }
        className="rounded-lg bg-accent-strong px-3 py-2 text-sm font-bold text-black disabled:opacity-40"
      >
        ✓
      </button>
    </div>
  );
}

export default function ActivityCard({
  scheduledToday,
  loggedToday,
}: {
  scheduledToday: WeeklyActivity[];
  loggedToday: LoggedActivity[];
}) {
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [pending, startTransition] = useTransition();

  const loggedNames = new Set(loggedToday.map((a) => a.name.toLowerCase()));
  const pendingScheduled = scheduledToday.filter(
    (a) => !loggedNames.has(a.name.toLowerCase())
  );

  if (
    pendingScheduled.length === 0 &&
    loggedToday.length === 0 &&
    !showAdHoc
  ) {
    return (
      <button
        onClick={() => setShowAdHoc(true)}
        className="self-start text-sm text-muted"
      >
        + Log an activity (badminton, hike…)
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-3">
      <h2 className="mb-2 text-sm font-semibold">Activities</h2>
      <div className="flex flex-col gap-2">
        {loggedToday.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              🏸 {a.name}{" "}
              <span className="text-accent">✓ {a.minutes} min</span>
            </span>
            <button
              disabled={pending}
              onClick={() => startTransition(() => deleteActivity(a.id))}
              className="px-2 text-danger"
              aria-label={`Remove ${a.name}`}
            >
              ✕
            </button>
          </div>
        ))}
        {pendingScheduled.map((a) => (
          <ScheduledRow key={a.name} activity={a} />
        ))}
        {showAdHoc ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Activity"
              className="w-0 flex-1 rounded-lg border border-border-subtle bg-surface-2 px-2 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              type="number"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-16 rounded-lg border border-border-subtle bg-surface-2 px-2 py-2 text-center text-sm"
            />
            <span className="text-xs text-muted">min</span>
            <button
              disabled={pending || !name.trim() || !parseInt(minutes, 10)}
              onClick={() =>
                startTransition(async () => {
                  await logActivity(name, parseInt(minutes, 10));
                  setName("");
                  setShowAdHoc(false);
                })
              }
              className="rounded-lg bg-accent-strong px-3 py-2 text-sm font-bold text-black disabled:opacity-40"
            >
              ✓
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAdHoc(true)}
            className="self-start text-xs text-muted"
          >
            + Log another activity
          </button>
        )}
      </div>
    </section>
  );
}
