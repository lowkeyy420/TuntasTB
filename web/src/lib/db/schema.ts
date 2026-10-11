import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  integer,
  jsonb,
  boolean,
  bigserial,
  unique,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Base schema for TuntasTB.
 *
 * Privacy note: there is deliberately NO column that stores a patient's name.
 * Patients are identified by `code` only. The PMO contact and family link
 * token are stored as hashes, never in clear text. Free text in `checkins`
 * is stored redacted (`text_redacted`).
 */

export const puskesmas = pgTable("puskesmas", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const nurses = pgTable(
  "nurses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    puskesmasId: uuid("puskesmas_id")
      .notNull()
      .references(() => puskesmas.id, { onDelete: "cascade" }),
    // Stored lower-cased; unique across the system.
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("nurses_email_unique").on(t.email)],
);

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    puskesmasId: uuid("puskesmas_id")
      .notNull()
      .references(() => puskesmas.id, { onDelete: "cascade" }),
    // Patient code, unique per Puskesmas. No name is ever stored.
    code: text("code").notNull(),
    startDate: date("start_date").notNull(),
    // 'intensive' | 'continuation'
    phase: text("phase").notNull(),
    pickupIntervalDays: integer("pickup_interval_days").notNull().default(14),
    pmoContactHash: text("pmo_contact_hash"),
    familyTokenHash: text("family_token_hash"),
    tokenRevokedAt: timestamp("token_revoked_at", { withTimezone: true }),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("patients_puskesmas_code_unique").on(t.puskesmasId, t.code),
    unique("patients_family_token_hash_unique").on(t.familyTokenHash),
    index("patients_puskesmas_idx").on(t.puskesmasId),
  ],
);

export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    // Idempotency key supplied by the client, unique per patient.
    clientId: text("client_id").notNull(),
    occurredOn: date("occurred_on").notNull(),
    treatmentDay: integer("treatment_day"),
    doseStatus: text("dose_status"),
    symptomsJson: jsonb("symptoms_json"),
    // Free text is ALWAYS stored redacted.
    textRedacted: text("text_redacted"),
    localLevel: text("local_level"),
    flowLevel: text("flow_level"),
    triageLevel: text("triage_level"),
    riskScore: integer("risk_score"),
    riskBand: text("risk_band"),
    riskReasonsJson: jsonb("risk_reasons_json"),
    familyMessage: text("family_message"),
    nurseLine: text("nurse_line"),
    citationsJson: jsonb("citations_json"),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    // Reply bookkeeping (family-reply): was the static template shown instead
    // of a generated explanation, why, and the fixed action line that was
    // shown (kept so a repeated request returns exactly the same reply).
    replyTemplateUsed: boolean("reply_template_used").notNull().default(true),
    replyReplaceReason: text("reply_replace_reason"),
    replyAction: text("reply_action"),
    // Nurse override (nurse-queue): the original `triage_level` is never changed.
    // The effective level is `override_level ?? triage_level`.
    overrideLevel: text("override_level"),
    // Stored redacted, like every free text.
    overrideNote: text("override_note"),
    overriddenBy: uuid("overridden_by").references(() => nurses.id, {
      onDelete: "set null",
    }),
    overriddenAt: timestamp("overridden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("checkins_patient_client_unique").on(t.patientId, t.clientId),
    index("checkins_patient_idx").on(t.patientId),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkinId: uuid("checkin_id")
      .notNull()
      .references(() => checkins.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    puskesmasId: uuid("puskesmas_id")
      .notNull()
      .references(() => puskesmas.id, { onDelete: "cascade" }),
    level: text("level").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acknowledgedBy: uuid("acknowledged_by").references(() => nurses.id, {
      onDelete: "set null",
    }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  },
  (t) => [
    unique("alerts_checkin_unique").on(t.checkinId),
    index("alerts_puskesmas_idx").on(t.puskesmasId),
  ],
);

export const pickups = pgTable(
  "pickups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    dueDate: date("due_date").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pickups_patient_idx").on(t.patientId),
    // A patient has at most one open pickup at any time (pickup-planner).
    uniqueIndex("pickups_one_open_per_patient")
      .on(t.patientId)
      .where(sql`${t.doneAt} IS NULL`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    // Plain string, NOT a foreign key, so entries outlive the patient.
    target: text("target"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    metaJson: jsonb("meta_json"),
  },
  (t) => [index("audit_log_target_idx").on(t.target)],
);
