import { compressSession, equipmentRank } from "./adapt";
import type { Exercise } from "./exercises";
import { isCompound, movementFamilies as families } from "./movement";
import type { GeneratedDay, PlanExercise, Profile } from "./types";

/** Muscle slots per session, in execution order. First two slots are primaries. */
const DAY_TEMPLATES: Record<string, string[]> = {
  "Full Body A": ["quads", "pectorals", "lats", "delts", "hamstrings", "biceps", "abs"],
  "Full Body B": ["glutes", "delts", "upper back", "pectorals", "quads", "triceps", "abs"],
  "Full Body C": ["hamstrings", "pectorals", "lats", "delts", "glutes", "calves", "abs"],
  "Upper A": ["pectorals", "lats", "delts", "upper back", "triceps", "biceps"],
  "Lower A": ["quads", "hamstrings", "glutes", "calves", "abs"],
  "Upper B": ["delts", "pectorals", "upper back", "lats", "biceps", "triceps"],
  "Lower B": ["hamstrings", "glutes", "quads", "calves", "abs"],
  "Push A": ["pectorals", "delts", "pectorals", "triceps", "delts", "abs"],
  "Pull A": ["lats", "upper back", "lats", "biceps", "traps", "forearms"],
  "Legs A": ["quads", "hamstrings", "glutes", "calves", "abs"],
  "Push B": ["delts", "pectorals", "triceps", "pectorals", "triceps", "abs"],
  "Pull B": ["upper back", "lats", "biceps", "lats", "forearms", "abs"],
  "Legs B": ["hamstrings", "glutes", "quads", "calves", "abs"],
};

const SPLITS: Record<number, string[]> = {
  2: ["Full Body A", "Full Body B"],
  3: ["Full Body A", "Full Body B", "Full Body C"],
  4: ["Upper A", "Lower A", "Upper B", "Lower B"],
  5: ["Push A", "Pull A", "Legs A", "Upper A", "Lower A"],
  6: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"],
};

interface RepScheme {
  sets: number;
  repsLow: number;
  repsHigh: number;
}

const REP_SCHEMES: Record<
  Profile["goal"],
  { primary: RepScheme; accessory: RepScheme }
> = {
  strength: {
    primary: { sets: 4, repsLow: 4, repsHigh: 6 },
    accessory: { sets: 3, repsLow: 6, repsHigh: 10 },
  },
  hypertrophy: {
    primary: { sets: 4, repsLow: 6, repsHigh: 10 },
    accessory: { sets: 3, repsLow: 8, repsHigh: 12 },
  },
  general: {
    primary: { sets: 3, repsLow: 8, repsHigh: 12 },
    accessory: { sets: 3, repsLow: 10, repsHigh: 15 },
  },
};

/** Deterministic PRNG so the same profile + seed regenerates the same plan. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Version suffixes, demo-angle notes and gear qualifiers mark a row as a
 * variation rather than the canonical lift: "v. 2", "(male)", "(side pov)",
 * "(with rope attachment)". Nudging these down replaces an earlier penalty on
 * raw name length, which ranked by character count and so favoured the
 * dataset's degenerate rows — the one literally named "quads" scored highest of
 * all the quads exercises.
 */
const VARIANT_MARKER = /\(|\bv\.\s*\d|\bversion\b/i;

function variantPenalty(name: string): number {
  return VARIANT_MARKER.test(name) ? -2 : 0;
}

const FINISHER_MINUTES = 10;

/** Pick a cardio exercise, preferring the user's gear and plan-wide variety. */
function pickCardio(
  available: Exercise[],
  allCardio: Exercise[],
  usedInPlan: Set<string>,
  rand: () => number
): Exercise | null {
  const withGear = available.filter((e) => e.target === "cardiovascular system");
  const pool = withGear.length > 0 ? withGear : allCardio;
  const candidates = pool
    .map((e) => ({
      e,
      score:
        equipmentRank(e.equipment) +
        (usedInPlan.has(e.id) ? -8 : 0) +
        variantPenalty(e.name) +
        rand() * 2,
    }))
    .sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(rand() * Math.min(3, candidates.length))].e;
  usedInPlan.add(pick.id);
  return pick;
}

export function generatePlan(
  profile: Profile,
  pool: Exercise[],
  seed = 1
): GeneratedDay[] {
  const totalDays = Math.min(6, Math.max(2, profile.daysPerWeek));
  const cardioDay = profile.cardioDay && totalDays >= 3;
  const days = cardioDay ? totalDays - 1 : totalDays;
  const focuses = SPLITS[days];
  const schemes = REP_SCHEMES[profile.goal];
  const available = pool.filter((e) =>
    profile.equipment.includes(e.equipment)
  );
  const allCardio = pool.filter((e) => e.target === "cardiovascular system");
  const usedInPlan = new Set<string>();
  // finisher lives inside the session budget: lifting gets the remainder
  const liftingBudget = profile.cardioFinisher
    ? Math.max(20, profile.sessionMinutes - FINISHER_MINUTES)
    : profile.sessionMinutes;

  const liftingDays = focuses.map((focus, dayIdx) => {
    const slots =
      profile.experience === "beginner"
        ? DAY_TEMPLATES[focus].slice(0, 5)
        : DAY_TEMPLATES[focus];
    const usedInDay = new Set<string>();
    const dayFamilies = new Set<string>();
    const dayEquipment: string[] = [];
    const dayExercises: PlanExercise[] = [];

    slots.forEach((target, slotIdx) => {
      const role: PlanExercise["role"] = slotIdx < 2 ? "primary" : "accessory";
      const rand = mulberry32(seed * 7919 + dayIdx * 131 + slotIdx);
      const candidates = available
        .filter((e) => e.target === target && !usedInDay.has(e.id))
        .map((e) => ({
          e,
          score:
            (role === "primary" && isCompound(e.name) ? 10 : 0) +
            equipmentRank(e.equipment) +
            (usedInPlan.has(e.id) ? -8 : 0) +
            // avoid a second exercise of the same movement family that day
            (families(e.name).some((f) => dayFamilies.has(f)) ? -6 : 0) +
            // nudge toward equipment variety within a session
            -0.75 * dayEquipment.filter((q) => q === e.equipment).length +
            variantPenalty(e.name) +
            rand() * 2,
        }))
        .sort((a, b) => b.score - a.score);
      if (candidates.length === 0) return;

      const topN = Math.min(3, candidates.length);
      const pick = candidates[Math.floor(rand() * topN)].e;
      usedInDay.add(pick.id);
      usedInPlan.add(pick.id);
      families(pick.name).forEach((f) => dayFamilies.add(f));
      dayEquipment.push(pick.equipment);

      const scheme = schemes[role];
      const sets =
        profile.experience === "beginner"
          ? Math.max(2, scheme.sets - 1)
          : scheme.sets;
      dayExercises.push({
        exerciseId: pick.id,
        sets,
        repsLow: scheme.repsLow,
        repsHigh: scheme.repsHigh,
        role,
      });
    });

    const compressed = compressSession(dayExercises, liftingBudget);

    if (profile.cardioFinisher) {
      const rand = mulberry32(seed * 5077 + dayIdx * 977);
      const cardio = pickCardio(available, allCardio, usedInPlan, rand);
      if (cardio) {
        compressed.push({
          exerciseId: cardio.id,
          sets: 1,
          repsLow: 0,
          repsHigh: 0,
          role: "cardio",
          minutes: FINISHER_MINUTES,
        });
      }
    }
    return { focus, exercises: compressed };
  });

  if (!cardioDay) return liftingDays;

  const rand = mulberry32(seed * 3163);
  const perExercise = Math.min(
    15,
    Math.max(8, Math.floor((profile.sessionMinutes - 5) / 2))
  );
  const cardioExercises: PlanExercise[] = [];
  for (let i = 0; i < 2; i++) {
    const cardio = pickCardio(available, allCardio, usedInPlan, rand);
    if (cardio) {
      cardioExercises.push({
        exerciseId: cardio.id,
        sets: 1,
        repsLow: 0,
        repsHigh: 0,
        role: "cardio",
        minutes: perExercise,
      });
    }
  }
  return [
    ...liftingDays,
    {
      focus: "Cardio",
      exercises: compressSession(cardioExercises, profile.sessionMinutes),
    },
  ];
}
