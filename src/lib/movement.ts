/**
 * Movement vocabulary shared by the plan generator (which uses it to vary
 * exercises within a session) and the swap sheet (which uses it to explain how
 * one exercise differs from another). Everything here works off exercise names,
 * since that is where the dataset records grip, angle and stance.
 */

const COMPOUND_PATTERNS = [
  /\bsquat\b/,
  /deadlift/,
  /bench press/,
  /(overhead|shoulder|military) press/,
  /\brow\b/,
  /pull-?up|chin-?up|pull-?down/,
  /lunge/,
  /hip thrust/,
  /\bdips?\b/,
  /\bpress\b/,
];

export function isCompound(name: string): boolean {
  return COMPOUND_PATTERNS.some((p) => p.test(name));
}

/** Movement patterns two exercises can share — "the same kind of lift". */
const FAMILY_KEYWORDS = [
  "squat",
  "deadlift",
  "bench press",
  "pulldown",
  "pushdown",
  "pull-up",
  "pullup",
  "chin-up",
  "row",
  "curl",
  "press",
  "raise",
  "extension",
  "fly",
  "crunch",
  "lunge",
  "dip",
  "push up",
  "thrust",
  "shrug",
  "pullover",
  "good morning",
];

export function movementFamilies(name: string): string[] {
  return FAMILY_KEYWORDS.filter((k) => name.includes(k));
}

/**
 * How a variation differs from the plain version of a lift. `without` is how to
 * say the modifier is missing — "no one side at a time" would not read as
 * English, so each awkward one carries its own wording.
 */
const MODIFIERS: { re: RegExp; label: string; without: string }[] = [
  { re: /\bincline\b/, label: "incline", without: "no incline" },
  { re: /\bdecline\b/, label: "decline", without: "no decline" },
  { re: /\bseated\b/, label: "seated", without: "not seated" },
  { re: /\bstanding\b/, label: "standing", without: "not standing" },
  {
    re: /\blying\b|\bsupine\b|\bprone\b/,
    label: "lying",
    without: "not lying down",
  },
  { re: /\bkneeling\b/, label: "kneeling", without: "not kneeling" },
  {
    re: /\bbent[- ]over\b|\bbent arm\b/,
    label: "bent over",
    without: "not bent over",
  },
  {
    re: /\bone arm\b|\bsingle arm\b|\bone leg\b|\bsingle leg\b|\balternat/,
    label: "one side at a time",
    without: "both at once",
  },
  { re: /\bwide\b/, label: "wide grip", without: "standard grip" },
  { re: /\bclose\b|\bnarrow\b/, label: "close grip", without: "standard grip" },
  {
    re: /\breverse[- ]grip\b|\bsupinated\b|\bunderhand\b/,
    label: "reverse grip",
    without: "standard grip",
  },
  {
    re: /\bneutral grip\b|\bhammer\b/,
    label: "neutral grip",
    without: "standard grip",
  },
  { re: /\bfront\b/, label: "front-loaded", without: "not front-loaded" },
  { re: /\bbehind neck\b|\brear\b/, label: "rear", without: "not to the rear" },
  { re: /\boverhead\b/, label: "overhead", without: "not overhead" },
  { re: /\bpause\b|\btempo\b/, label: "paused", without: "no pause" },
  { re: /\bjump\b|\bexplosive\b/, label: "explosive", without: "not explosive" },
  {
    re: /\bsmith\b/,
    label: "on the smith machine",
    without: "off the smith machine",
  },
  { re: /\bassisted\b/, label: "assisted", without: "unassisted" },
  { re: /\bband\b/, label: "banded", without: "no band" },
];

export function modifiers(name: string): string[] {
  return MODIFIERS.filter((m) => m.re.test(name)).map((m) => m.label);
}

/** How to say a lift lacks a modifier the original had. */
export function withoutModifier(label: string): string {
  return MODIFIERS.find((m) => m.label === label)?.without ?? `no ${label}`;
}

/** Camera-angle re-shoots and numbered retakes of a lift already in the list. */
const DUPLICATE_SHOT = /\((back|side|front) pov\)|\bv\.? ?\d\b|\((male|female)\)/i;

export function isDuplicateShot(name: string): boolean {
  return DUPLICATE_SHOT.test(name);
}

/** Name without its parenthetical asides, for spotting the same lift twice. */
export function canonicalName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\bv\.? ?\d\b/i, "")
    .trim();
}
