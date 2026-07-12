ALTER TABLE "profile" ADD COLUMN "cardio_finisher" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "cardio_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "duration_min" integer;