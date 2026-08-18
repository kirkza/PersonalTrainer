# Swap sheet: show how alternatives differ

## Problem

The swap sheet lists substitutes with nothing but an equipment tag ("dumbbell",
"rope"). Every row looks alike, so there is no way to tell which substitute is
closest to the lift being replaced.

## What was ruled out

A numeric similarity score. Alternatives are already filtered to the same target
muscle, so the candidates that matter are near-identical on every similarity
axis. A prototype scoring movement family, compound/isolation, body part,
secondary-muscle overlap and equipment class tied at 100/100 for twelve of
twelve candidates for `barbell bench press`, and eight of twelve for
`barbell full squat`. Generated reason lines ("also hits triceps, shoulders")
were word-for-word identical down the list. A score would be a number that never
varies where the user needs it to.

The useful signal is the inverse: not how similar a candidate is, but **how it
differs** from the original.

## Design

### Grouping

Two sections in the sheet:

- **Closest — same movement**: shares a movement family with the original
  (press, squat, row, curl, raise, pushdown, …).
- **Different feel**: everything else.

For `barbell bench press` every candidate lands in the first group; for
`cable pushdown` the split is real — four cable pushdown variants above, barbell
extensions and close-grip presses below.

### Difference line

Replaces the bare equipment tag under each name. Built by diffing the candidate
against the original:

1. Equipment, when it differs (`dumbbell`).
2. Modifiers present in the candidate but not the original — incline, decline,
   seated, standing, lying, kneeling, bent over, one side at a time, wide grip,
   close grip, reverse grip, neutral grip, front-loaded, rear, overhead, paused,
   explosive, on the smith machine, assisted, banded.
3. If the candidate *drops* a modifier the original had, **and shares its
   movement pattern**: `no incline`. The same-pattern condition is load-bearing.
   Without it, swapping `cable incline pushdown` labelled all twelve candidates
   `no incline` — true of every one of them at once, so it distinguished
   nothing. A different movement drops the modifier by definition.
4. If nothing distinguishing is detectable, fall back to the equipment tag alone.
   The exercise name already carries the difference in that case (`zercher`,
   `jefferson`), so filler text would add noise.

At most two clauses, joined with `·`. Example: `dumbbell · incline`.

Each modifier carries its own negative wording rather than taking a `no ` prefix,
because several do not survive one: `one side at a time` negates to
`both at once`, `assisted` to `unassisted`, `wide grip` to `standard grip`.

### De-duplication

The dataset contains camera-angle re-shoots and retakes of the same lift —
`(back pov)`, `(side pov)`, `v. 2`, `(male)`. These are dropped, and remaining
entries are de-duplicated by canonical name (the name with parentheticals
stripped), keeping the best-ranked representative. This is what frees up list
slots for genuinely different options.

### Ranking

Replaces the current sort (body-part match, then equipment sturdiness), which
put `barbell front raise` above every dumbbell lateral-raise variant when
swapping a lateral raise — a different movement direction ranked above true
variants. New order:

1. Same movement pattern.
2. Same equipment as the original.
3. Fewest added modifiers.
4. Shorter name (canonical lifts have short names; exotic variants are long).
5. Equipment sturdiness, then alphabetical for stable output.

## Code structure

`isCompound` and the movement-family keywords are currently private to
`src/lib/generator.ts`, and the swap ranking needs the same vocabulary. They move
to a new `src/lib/movement.ts` together with the modifier list and the
duplicate-shot helpers. `generator.ts` and `adapt.ts` both import from it instead
of keeping parallel copies.

The shared family list is extended while moving (adding `pushdown`, `dip`,
`push up`, `thrust`, `shrug`, `pullover`, `good morning`). This also affects the
generator, which uses family collisions to vary exercises within a session — it
will now recognise a few more collisions and pick more varied sessions.

`alternativesFor` returns `Alternative[]` — `{ exercise, samePattern, detail }`
instead of bare `Exercise[]`. `AlternativeView` in `actions.ts` carries
`samePattern` and `detail` to the client. `SwapSheet.tsx` renders the two group
headers and the difference line.

## Testing

Unit tests in `adapt.test.ts` against the real exercise dataset:

- Bench-press alternatives are all same-pattern and carry distinct difference
  lines, including a two-clause one (`decline · wide grip`).
- A substitute on different gear names that gear first.
- Camera-angle duplicates and canonical-name duplicates never appear.
- A lateral-raise swap ranks dumbbell variants above barbell front raises.
- A triceps pushdown splits into same-pattern and different-feel groups, with
  the same-pattern ones listed first.
- A different-movement candidate is never labelled by a modifier it lacks.
- A dropped modifier reads as English (`both at once`, not
  `no one side at a time`).
- The difference line falls back to equipment when no modifier differs.
