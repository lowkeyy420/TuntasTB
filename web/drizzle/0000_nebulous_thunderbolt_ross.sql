CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkin_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"puskesmas_id" uuid NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "alerts_checkin_unique" UNIQUE("checkin_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"occurred_on" date NOT NULL,
	"treatment_day" integer,
	"dose_status" text,
	"symptoms_json" jsonb,
	"text_redacted" text,
	"local_level" text,
	"flow_level" text,
	"triage_level" text,
	"risk_score" integer,
	"risk_band" text,
	"risk_reasons_json" jsonb,
	"family_message" text,
	"nurse_line" text,
	"citations_json" jsonb,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_patient_client_unique" UNIQUE("patient_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "nurses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puskesmas_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nurses_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puskesmas_id" uuid NOT NULL,
	"code" text NOT NULL,
	"start_date" date NOT NULL,
	"phase" text NOT NULL,
	"pickup_interval_days" integer DEFAULT 14 NOT NULL,
	"pmo_contact_hash" text,
	"family_token_hash" text,
	"token_revoked_at" timestamp with time zone,
	"consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_puskesmas_code_unique" UNIQUE("puskesmas_id","code"),
	CONSTRAINT "patients_family_token_hash_unique" UNIQUE("family_token_hash")
);
--> statement-breakpoint
CREATE TABLE "pickups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puskesmas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_puskesmas_id_puskesmas_id_fk" FOREIGN KEY ("puskesmas_id") REFERENCES "public"."puskesmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_nurses_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."nurses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nurses" ADD CONSTRAINT "nurses_puskesmas_id_puskesmas_id_fk" FOREIGN KEY ("puskesmas_id") REFERENCES "public"."puskesmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_puskesmas_id_puskesmas_id_fk" FOREIGN KEY ("puskesmas_id") REFERENCES "public"."puskesmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_puskesmas_idx" ON "alerts" USING btree ("puskesmas_id");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target");--> statement-breakpoint
CREATE INDEX "checkins_patient_idx" ON "checkins" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "patients_puskesmas_idx" ON "patients" USING btree ("puskesmas_id");--> statement-breakpoint
CREATE INDEX "pickups_patient_idx" ON "pickups" USING btree ("patient_id");