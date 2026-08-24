/**
 * Whether the trailing set row can be dropped from a live workout.
 *
 * Rows are append-only during a session apart from this: a tap on "+ Add set"
 * is easy to make by accident, so an extra row the user appended past the
 * prescription can be taken back. Prescribed slots stay put — clearing one is
 * what unlogging is for — and a row holding a logged set is never dropped
 * silently, since that would orphan a saved set.
 */
export function canRemoveLastRow(
  rows: { id: number | null; saving?: boolean }[],
  prescribedSets: number
): boolean {
  if (rows.length <= prescribedSets) return false;
  const last = rows.at(-1);
  // a row mid-save has no id yet, but its set is on its way to the database
  if (last?.saving) return false;
  return last?.id === null;
}
