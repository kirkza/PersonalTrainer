# Personal Fitness Trainer

A single-user, mobile-first personal trainer web app. It generates a weekly
training plan from your goal, schedule, and your gym's actual equipment — then
adapts when life happens:

- **⇄ Swap** any exercise for an alternative that hits the same muscle
  ("just today" when the machine is busy, or "always" when your gym doesn't have it)
- **⏱ Short on time** — start a 45- or 30-minute compressed version that keeps
  the key lifts and trims accessories
- **Missed a day?** Shift your week, fold the key lifts into your next session,
  or just skip it

Workouts are logged set-by-set (prefilled from last time) and feed a progress
dashboard with weekly volume, per-muscle volume, PRs, and streaks.

Built on the [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)
(1,324 exercises with instructions and demonstration GIFs — media © Gym visual).

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Drizzle ORM ·
Neon Postgres in production / embedded PGlite in local dev · Recharts · Vitest

## Local development

```bash
npm install
npm run dev
```

No database setup needed locally — with `DATABASE_URL` unset, the app uses an
embedded Postgres (PGlite) stored in `.pglite/`. Configure `.env.local`:

```
APP_PIN=1234              # your login PIN
AUTH_SECRET=<any long random string>
```

Tests: `npx vitest run` (plan generator, session compression, week reshuffle).

## Deploy (Vercel + Neon)

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com/new).
2. In the Vercel project: Storage → **Create database → Neon Postgres**
   (this sets `DATABASE_URL` automatically), or set `DATABASE_URL` manually.
3. Add env vars: `APP_PIN` (your PIN) and `AUTH_SECRET` (long random string).
4. Apply the schema once: `DATABASE_URL=<neon url> npx drizzle-kit push`
   from your machine.
5. Deploy. Open the URL on your phone, log in, and complete onboarding.

## Data & attribution

Exercise data is bundled at `src/data/exercises.slim.json` (English-only slice
of the full dataset — regenerate with `scripts/slim-dataset.mjs`). Images and
GIFs are loaded from the upstream GitHub repository at runtime.
Exercise media © Gym visual, used with attribution per the dataset's NOTICE.
