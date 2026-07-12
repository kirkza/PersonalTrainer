CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"minutes" integer NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "weekly_activities" jsonb DEFAULT '[]'::jsonb NOT NULL;