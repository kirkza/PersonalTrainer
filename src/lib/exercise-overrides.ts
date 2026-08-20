/**
 * Local corrections to the upstream exercises-dataset.
 *
 * The dataset is community-contributed and its rows have three known defects:
 * some names are not exercises at all, some rows are stretches that cannot be
 * prescribed as sets × reps, and some `target` muscles are plainly wrong. This
 * file patches those without editing the vendored JSON, so re-running
 * `scripts/slim-dataset.mjs` against a fresh download keeps the corrections.
 *
 * Corrections are reviewed by hand — this is NOT a full audit of all 1324 rows.
 * Add to it whenever a bad row turns up in the app.
 */

/** Rows that are not exercises. Kept resolvable by id; just never prescribed. */
export const EXCLUDED_IDS: ReadonlySet<string> = new Set([
  // name is the muscle itself; steps are generic squat text and the image is a
  // bench split-squat, so name, instructions and image all disagree
  "3533",
]);

/**
 * Stretches, mobility drills and yoga poses. They carry a `target` muscle so
 * the generator happily drops them into a strength slot with a weight field.
 */
const NON_STRENGTH_NAME = /\b(stretch|stretches|mobility|warm.?up|pose|yoga)\b/i;

/** Loaded lifts the pattern above catches by accident. */
const NON_STRENGTH_EXCEPTIONS: ReadonlySet<string> = new Set([
  "3642", // "weighted stretch lunge" — a long-stride lunge, not a mobility drill
]);

/**
 * Corrected primary target muscles, `id: target`. Each was verified against the
 * row's own instruction steps, which are more reliable than its `target` field.
 */
export const TARGET_OVERRIDES: Readonly<Record<string, string>> = {
  // labeled as a muscle, but the steps describe running or a cardio machine
  "0858": "cardiovascular system", // wind sprints (was abs)
  "2139": "cardiovascular system", // hands bike, upper body ergometer (was pectorals)
  "2142": "cardiovascular system", // ski ergometer, skierg machine (was triceps)

  // wrist flexion is a forearm movement, not a biceps one
  "0365": "forearms", // dumbbell over bench neutral wrist curl (was biceps)
  "0366": "forearms", // dumbbell over bench one arm neutral wrist curl (was biceps)
  "0397": "forearms", // dumbbell seated neutral wrist curl (was biceps)

  // toe touches are trunk flexion
  "3212": "abs", // basic toe touch (was glutes)
  "3214": "abs", // arms apart circular toe touch (was glutes)
  "3215": "abs", // hands reversed clasped circular toe touch (was glutes)
  "3218": "abs", // hands clasped circular toe touch (was glutes)
  "3231": "abs", // two toe touch (was spine)

  // steps describe a supine leg flutter, not hip extension
  "0459": "abs", // flutter kicks (was glutes)

  // steps describe a squat
  "3119": "quads", // potty squat (was abs)

  // steps describe a push-up
  "3662": "pectorals", // pike-to-cobra push-up (was glutes)

  // a loaded carry — grip and traps hold the weight; the legs just walk
  "2133": "traps", // farmers walk (was quads)

  // steps describe hinging forward at the waist, not a back pull
  "3292": "spine", // elevator (was upper back)
};

/**
 * Corrected instruction steps, `id: steps`. A row lands here when its steps
 * describe a different movement than its own picture — the picture is what the
 * user follows mid-set, so the text is the field that gets rewritten.
 *
 * Verified by opening the row's image; the `target` muscle is used to settle
 * which movement was intended when the two disagree.
 */
export const STEPS_OVERRIDES: Readonly<Record<string, string[]>> = {
  // image shows a supine slider curl — lying on the back, heels sliding out and
  // back. The original steps described standing on a platform, which is a
  // different exercise and does not load the hamstrings the row targets.
  "0730": [
    "Lie on your back with your heels on the platform or slider and your arms flat at your sides.",
    "Push your hips up until your weight rests on your shoulders and heels, and hold that bridge.",
    "Keeping the hips high, slide one heel away from you until the leg is almost straight.",
    "Pull the heel back in by contracting the hamstring, not by dropping the hips.",
    "Finish the reps on that leg, then switch. End the set once the hips start to sag.",
  ],
};

/** Can this row be prescribed as a working exercise? */
export function isSelectable(e: { id: string; name: string }): boolean {
  if (EXCLUDED_IDS.has(e.id)) return false;
  if (NON_STRENGTH_EXCEPTIONS.has(e.id)) return true;
  return !NON_STRENGTH_NAME.test(e.name);
}
