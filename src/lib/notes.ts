/** What saving a raw note should do: a trimmed-empty note means "remove it". */
export function normalizeNote(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Keep pathological pastes out of the row; plenty for a setup note. */
export const NOTE_MAX_LENGTH = 500;

export function clampNote(note: string): string {
  return note.length > NOTE_MAX_LENGTH ? note.slice(0, NOTE_MAX_LENGTH) : note;
}
