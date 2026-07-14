import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { PlanExercise } from "@/lib/types";

export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  goal: text("goal").notNull(),
  experience: text("experience").notNull(),
  daysPerWeek: integer("days_per_week").notNull(),
  weekdays: jsonb("weekdays").$type<number[]>().notNull(),
  sessionMinutes: integer("session_minutes").notNull(),
  equipment: jsonb("equipment").$type<string[]>().notNull(),
  units: text("units").notNull().default("kg"),
  cardioFinisher: boolean("cardio_finisher").notNull().default(false),
  cardioDay: boolean("cardio_day").notNull().default(false),
  weeklyActivities: jsonb("weekly_activities")
    .$type<import("@/lib/types").WeeklyActivity[]>()
    .notNull()
    .default([]),
  restSeconds: integer("rest_seconds").notNull().default(60),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  isActive: boolean("is_active").notNull().default(true),
  params: jsonb("params").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const planDays = pgTable("plan_days", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  /** position within the training week (0-based sequence order) */
  position: integer("position").notNull(),
  focus: text("focus").notNull(),
  exercises: jsonb("exercises").$type<PlanExercise[]>().notNull(),
});

export const workouts = pgTable("workouts", {
  id: serial("id").primaryKey(),
  planDayId: integer("plan_day_id").references(() => planDays.id, {
    onDelete: "set null",
  }),
  /** snapshot of what this session prescribes (after compression/swaps/folds) */
  exercises: jsonb("exercises").$type<PlanExercise[]>().notNull(),
  status: text("status").notNull().default("in_progress"),
  skipDecision: text("skip_decision"),
  /** id of the workout this skipped session's primaries were folded into */
  foldedInto: integer("folded_into"),
  targetMinutes: integer("target_minutes"),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** Non-gym activity log (badminton, hiking, …) — duration-based. */
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  minutes: integer("minutes").notNull(),
  performedAt: timestamp("performed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sets = pgTable("sets", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id")
    .notNull()
    .references(() => workouts.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull(),
  setNumber: integer("set_number").notNull(),
  reps: integer("reps").notNull(),
  weight: real("weight").notNull().default(0),
  /** cardio sets: duration logged instead of reps×weight */
  durationMin: integer("duration_min"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
});
