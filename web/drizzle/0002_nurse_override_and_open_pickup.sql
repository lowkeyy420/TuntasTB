ALTER TABLE "checkins" ADD COLUMN "override_level" text;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "override_note" text;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "overridden_by" uuid;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "overridden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_overridden_by_nurses_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."nurses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pickups_one_open_per_patient" ON "pickups" USING btree ("patient_id") WHERE "pickups"."done_at" IS NULL;