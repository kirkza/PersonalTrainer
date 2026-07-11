// Slims the full exercises-dataset JSON (multilingual, ~16MB) down to the
// English-only fields the app uses. Run after re-downloading the dataset:
//   curl -sL -o src/data/exercises.json https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json
//   node scripts/slim-dataset.mjs
import { readFileSync, writeFileSync, statSync } from "node:fs";

const full = JSON.parse(readFileSync("src/data/exercises.json", "utf8"));

const slim = full.map((e) => ({
  id: e.id,
  name: e.name,
  bodyPart: e.body_part,
  equipment: e.equipment,
  target: e.target,
  secondaryMuscles: e.secondary_muscles,
  image: e.image,
  gifUrl: e.gif_url,
  steps: e.instruction_steps?.en ?? [],
}));

writeFileSync("src/data/exercises.slim.json", JSON.stringify(slim));
console.log(
  `Wrote ${slim.length} exercises, ${(statSync("src/data/exercises.slim.json").size / 1024 / 1024).toFixed(2)}MB`
);
