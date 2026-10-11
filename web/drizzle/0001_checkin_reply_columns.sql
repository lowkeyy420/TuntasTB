ALTER TABLE "checkins" ADD COLUMN "reply_template_used" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "reply_replace_reason" text;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "reply_action" text;