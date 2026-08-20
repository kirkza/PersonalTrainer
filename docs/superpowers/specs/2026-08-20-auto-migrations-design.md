# Automatic migrations on deploy

## Problem

Migrations reach production by hand. The Neon schema was created once with
`drizzle-kit push`; every schema change since has needed a manual step that is
easy to forget. Shipping `exercise_notes` without it took the workout screen
down mid-session, and the guard added to stop the crash turned into silent
data loss instead.

Only the local PGlite path migrates itself (`src/db/index.ts`). The Neon path
never has.

## Key finding

drizzle's Postgres migrator gates on the journal timestamp, not on hashes:

```js
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
```

It reads the single newest ledger row and applies every migration whose
journal `when` exceeds it. Adopting an existing database therefore needs one
inserted row, not a reconstructed history.

## Design

### `scripts/migrate.mjs`

1. No `DATABASE_URL` — log and exit 0. Local builds and databaseless previews
   keep working.
2. Baseline, once. When `drizzle.__drizzle_migrations` is missing or empty
   *and* the app tables already exist (probe for `plans`), insert one row:
   `created_at` = 1784038630924, the journal `when` of `0003_rest-timer`, and
   `hash` = the real sha256 of that file so the ledger is not a lie. The
   migrator then skips `0000`-`0003` and applies `0004` onward.
   An empty ledger with *no* app tables is a fresh database: no baseline,
   apply everything.
3. Run the migrator and report what it applied.
4. `--check` prints the plan and writes nothing.

### Wiring

`"build": "node scripts/migrate.mjs && next build"`, plus `"db:migrate"` for
manual runs. Vercel exposes `DATABASE_URL` to the build, so this needs no
credential handling.

### Narrowing the crash guard

`notesFor` currently swallows every error, which would hide real faults once
migrations are automatic. It catches only Postgres `42P01` (undefined_table)
and rethrows the rest. The save-failure UI stays: it reports any failed write,
not just a missing table.

## Caveats

- Build-time migration lands before the new code is live. Correct for
  additive changes; a destructive one would break the running version.
  Expand/contract discipline applies, and the script says so.
- `neon-http` has no transactions, so a multi-statement migration is not
  atomic.

## Testing

The production situation is reproducible locally: build a fresh PGlite
database, apply the schema *without* a ledger (mimicking the original
`drizzle-kit push`), then baseline and migrate. PGlite's migrator shares the
same timestamp-gating code, so the test exercises the real decision.

Assertions: the baseline decision function is right for each ledger/table
state; after baselining only `0004` runs; `exercise_notes` exists afterwards;
a second run is a no-op; a fresh database gets every migration and no
baseline.
