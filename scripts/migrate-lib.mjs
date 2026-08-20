import crypto from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * The last migration already reflected in the production schema, which was
 * created with `drizzle-kit push` before migrations were tracked. Recording it
 * as applied is what stops 0000-0003 replaying onto existing tables.
 */
export const BASELINE_TAG = "0003_rest-timer";

export function readJournal(folder) {
  return JSON.parse(readFileSync(`${folder}/meta/_journal.json`, "utf8"));
}

export function baselineEntry(journal, tag = BASELINE_TAG) {
  const entry = journal.entries.find((e) => e.tag === tag);
  if (!entry) throw new Error(`baseline ${tag} is not in the journal`);
  return { tag: entry.tag, when: entry.when };
}

/** The hash drizzle would have stored: sha256 of the migration file. */
export function hashOf(folder, tag) {
  return crypto
    .createHash("sha256")
    .update(readFileSync(`${folder}/${tag}.sql`, "utf8"))
    .digest("hex");
}

/** Which migrations the migrator will run, given the plan. */
export function pendingAfter(journal, plan) {
  if (plan.action !== "baseline") return journal.entries;
  return journal.entries.filter((e) => e.when > plan.upTo.when);
}
