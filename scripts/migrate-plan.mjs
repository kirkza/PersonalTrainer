/**
 * Deciding how to adopt a database that predates the migration ledger.
 *
 * drizzle's Postgres migrator applies every migration whose journal `when`
 * exceeds the newest `created_at` in `drizzle.__drizzle_migrations`:
 *
 *   if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
 *
 * So a database whose schema was applied by `drizzle-kit push` — tables
 * present, ledger absent — is adopted by inserting one row, not by replaying
 * history.
 *
 * @typedef {{ hasLedgerRows: boolean, hasAppTables: boolean }} DbState
 * @typedef {{ tag: string, when: number }} JournalEntry
 */

/**
 * @param {DbState} state
 * @param {JournalEntry | null} baselineUpTo last migration already reflected in
 *   the schema — for an adopted database, the newest one that existed when
 *   `push` was last run.
 */
export function planMigration(state, baselineUpTo) {
  if (state.hasLedgerRows) {
    return {
      action: "migrate-remaining",
      reason: "ledger present; applying whatever is newer than its last row",
    };
  }
  if (!state.hasAppTables) {
    return {
      action: "migrate-all",
      reason: "empty database; applying every migration",
    };
  }
  if (!baselineUpTo) {
    return {
      action: "migrate-all",
      reason: "tables exist but no baseline is configured; nothing to skip",
    };
  }
  return {
    action: "baseline",
    upTo: baselineUpTo,
    reason: `schema predates the ledger; recording ${baselineUpTo.tag} as applied`,
  };
}
