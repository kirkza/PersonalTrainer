# Closing sessions left open

## Problem

Finishing a workout is a manual tap, and it is easy to walk out of the gym
after the last exercise without it. The session stays `in_progress`, and the
next gym visit lands in it:

- the home card and `startWorkout` both redirect to any `in_progress` workout,
  so the next session's sets are logged into the old one;
- `nextPosition` skips `in_progress` entries, so "Next up" never advances —
  a forgotten tap also stalls the day rotation;
- `ElapsedTimer` counts wall-clock from `startedAt`, so it reads in the
  thousands of minutes.

Stats are already protected: `sessionDurationMin` returns null above four
hours, so such a session reports a dash rather than a fake duration.

## Rule

A session is stale when it is `in_progress` and nothing has happened for six
hours. Activity means the newest logged set's `loggedAt`, or `startedAt` when
no sets were logged.

Six hours, rather than "before today": a session started at 23:00 and resumed
at 00:30 is 1.5 hours of real training and must not be closed, while one
abandoned at 20:00 and revisited the next morning must be. Six hours is above
any real session and still catches same-day forgetting.

## What happens to it

- **Sets logged** — finish it, with `finishedAt` set to the newest set's
  `loggedAt`. That is when the work actually stopped, and it keeps the session
  inside the four-hour plausibility window so it retains a real duration
  instead of a dash.
- **No sets logged** — delete it. There is nothing to keep, and closing it
  would count a session on Progress and advance the rotation for work that
  never happened. Deleting lets the rotation treat it as if it never existed.

## Where it runs

`closeStaleSessions()` is called from `getNextSession()` — the one place that
already loads every workout, and which the home page, `startWorkout` and
`swapSession` all go through. Entering the app from any of them self-heals.

Writes are guarded (`where id = ... and status = 'in_progress'`) so concurrent
renders cannot double-close.

`getNextSession` reports what it closed, and the Today page shows a one-line
note. It appears only on the render that did the closing, which is the once
the user needs to see it.

## Not included

The runaway timer is left alone. It is a symptom of the stale session, and
showing time over target is deliberate elsewhere ("time in the gym is not work
done"). With auto-closing, a session never survives long enough to read absurd.

## Testing

`staleSessionAction(startedAt, lastSetAt, now)` is pure: keep / finish with a
timestamp / discard. Unit tests cover the six-hour boundary either side, the
overnight-resume case that must be kept, an empty session, and the choice of
`finishedAt`.
