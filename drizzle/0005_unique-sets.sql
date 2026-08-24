--> drop duplicate rows for the same set of the same exercise, keeping the most
--> recent. They came from a repeat tap on the log button before the first
--> insert returned; the constraint below is what stops them recurring.
DELETE FROM "sets" WHERE "id" NOT IN (
	SELECT MAX("id") FROM "sets" GROUP BY "workout_id", "exercise_id", "set_number"
);
--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_workout_exercise_set_number" UNIQUE("workout_id","exercise_id","set_number");
