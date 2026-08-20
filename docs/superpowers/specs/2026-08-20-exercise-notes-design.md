# Per-exercise setup notes

## Problem

Some exercises need setup worth remembering — seat height, pin position,
safety-bar placement, attachment choice. There is nowhere to write that down,
so it gets rediscovered every time the exercise comes around again.

The `workouts.notes` column is not this feature: it is per-workout, and a
setup note must resurface with the *exercise*, across workouts, plans and
regenerations.

## Shape

One living note per exercise, edited in place — like a sticky label on the
machine. No history, no per-session remarks (both considered and declined;
the mid-workout reading experience wins).

The note is keyed by the dataset's exercise id. Swapping to a different
exercise shows that exercise's own note, not the replaced one's — setup notes
are about a specific machine or station.

## Data

New table `exercise_notes`:

- `exercise_id` text primary key
- `note` text, not null
- `updated_at` timestamptz, not null, default now

One drizzle migration (`0004_exercise-notes.sql`), generated with drizzle-kit
so `meta/` snapshots stay consistent.

## Server

- `saveExerciseNote(exerciseId, note)` server action: trims; upserts;
  an empty trimmed note deletes the row. Ignores unknown exercise ids.
  No revalidate, matching logSet: the card keeps its own state and the page
  refetches on the next visit.
- `notesFor(exerciseIds)` in `data.ts`: one query, returns
  `Map<string, string>`.
- `SessionExerciseView` gains `note: string | null`; `toExerciseView` takes
  the note as a parameter, like it takes `lastTime`.

## UI (workout screen only)

On each exercise card, lifting and cardio alike:

- A note, when present, is always visible under the exercise header —
  amber-tinted line starting with 📝. Resurfacing it un-asked is the point.
- Tapping the note opens editing in place: textarea, Save / Cancel.
- With no note, a small "+ Note" link sits under the header instead.
- Saving an emptied textarea removes the note.

Not included (easy later, all read the same table): plan page, swap sheet,
summary page, activities.

## Testing

- Unit tests for the note-trimming/upsert decision logic and for
  `toExerciseView` carrying the note through.
- The textarea interaction is verified manually — the app is PIN-gated and
  the flow needs real taps.
