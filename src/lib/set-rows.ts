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
  rows: { id: number | null }[],
  prescribedSets: number
): boolean {
  if (rows.length <= prescribedSets) return false;
  return rows.at(-1)?.id === null;
}
