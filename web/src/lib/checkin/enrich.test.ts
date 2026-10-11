import { describe, expect, it, vi } from "vitest";
import { loadRulesFromDir } from "@/lib/triage/loadFiles";
import { redactAndTriage } from "@/lib/triage/redactTriage";
import { flowInputSchema } from "@/lib/langflow/flowSchema";
import type { RunFlow } from "@/lib/langflow/client";
import { buildFlowPayload, checkQuotes, flowEnrich, needsFlow, noEnrich, safeEnrich, type EnrichInput } from "./enrich";

const rules = loadRulesFromDir();
const known = new Set(rules.table.symptoms.map((s) => s.code));

/** What the pipeline hands to the flow for a patient with known identifiers. */
const PATIENT = {
  id: "8b6c2a7e-1f3d-4c5b-9a8e-7d6c5b4a3f21",
  code: "DEMO-007",
  token: "fam_9Zq1x2c3v4b5n6m7",
  puskesmas: "Puskesmas Kecamatan Tebet",
};

function enrichInputFor(rawNote: string): EnrichInput {
  const { redactedText } = redactAndTriage({ chips: [], rawText: rawNote }, rules);
  return {
    text: redactedText,
    chips: ["nausea_mild", "Kode Aneh!"],
    doseStatus: "yes",
    treatmentDay: 12,
    context: {
      persistence_days: { nausea_mild: 3 },
      consecutive_missed_before: 0,
      missed_pickup: false,
      has_pmo: true,
      days_since_last_checkin: 1,
    },
    rulesVersion: "0.1.0-draft",
  };
}

describe("payload (5.1)", () => {
  const payload = buildFlowPayload(enrichInputFor("nama saya Budi, telepon 081234567890, mual"));
  const serialised = JSON.stringify(payload);

  it("carries the redaction placeholders and none of the identifiers", () => {
    expect(serialised).toContain("[NAMA]");
    expect(serialised).toContain("[TELEPON]");
    for (const secret of ["Budi", "081234567890", PATIENT.id, PATIENT.code, PATIENT.token, PATIENT.puskesmas, "Tebet"]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it("is exactly the flow input contract (strict schema), with odd chip codes left out", () => {
    expect(flowInputSchema.safeParse(payload).success).toBe(true);
    expect(payload.chips).toEqual(["nausea_mild"]);
    expect(Object.keys(payload).sort()).toEqual(
      ["chips", "context", "dose_status", "rules_version", "text", "treatment_day"],
    );
  });

  it("clamps counts and drops odd persistence keys", () => {
    const p = buildFlowPayload({
      ...enrichInputFor("mual"),
      treatmentDay: -3,
      context: {
        persistence_days: { nausea_mild: 2.5, "Bad Key": 4 },
        consecutive_missed_before: -1,
        missed_pickup: true,
        has_pmo: false,
        days_since_last_checkin: Number.NaN,
      },
    });
    expect(p.treatment_day).toBe(0);
    expect(p.context).toEqual({
      persistence_days: { nausea_mild: 0 },
      consecutive_missed_before: 0,
      missed_pickup: true,
      has_pmo: false,
      days_since_last_checkin: 0,
    });
    expect(flowInputSchema.safeParse(p).success).toBe(true);
  });
});

describe("needsFlow (5.4)", () => {
  it("no note and only known chips: no call", () => {
    expect(needsFlow("", ["urine_orange"], known)).toBe(false);
    expect(needsFlow("   ", [], known)).toBe(false);
  });
  it("a note, or an unknown chip: call", () => {
    expect(needsFlow("mual", [], known)).toBe(true);
    expect(needsFlow("", ["sesuatu_baru"], known)).toBe(true);
  });
});

describe("checkQuotes (5.3)", () => {
  const ex = (symptoms: { code: string; quote: string; duration_days: number | null }[], unknown: string[] = []) => ({
    symptoms,
    unknown_symptoms: unknown,
    dose_status: "yes" as const,
    mood_flags: [],
    confidence: 0.9,
  });

  it("keeps quoted known codes (case and spacing do not matter) and their duration", () => {
    const c = checkQuotes(ex([{ code: "nausea_mild", quote: "MUAL   terus", duration_days: 7 }]), "Mual terus, capek", known);
    expect(c.symptoms).toEqual([{ code: "nausea_mild", durationDays: 7 }]);
    expect(c.unknown).toEqual([]);
  });

  it("moves an unquoted symptom, an empty quote and an unknown code to unknown symptoms", () => {
    const c = checkQuotes(
      ex(
        [
          { code: "skin_rash", quote: "ruam di tangan", duration_days: null },
          { code: "jaundice", quote: "  ", duration_days: null },
          { code: "tinnitus", quote: "telinga berdenging", duration_days: null },
        ],
        ["pusing", " "],
      ),
      "telinga berdenging",
      known,
    );
    expect(c.symptoms).toEqual([]);
    expect(c.unknown).toEqual(["ruam di tangan", "jaundice", "telinga berdenging", "pusing"]);
  });

  it("drops duplicate codes", () => {
    const c = checkQuotes(
      ex([
        { code: "nausea_mild", quote: "mual", duration_days: null },
        { code: "nausea_mild", quote: "mual", duration_days: 3 },
      ]),
      "mual",
      known,
    );
    expect(c.symptoms).toEqual([{ code: "nausea_mild" }]);
  });
});

describe("flowEnrich", () => {
  const valid = {
    extracted: { symptoms: [], unknown_symptoms: [], dose_status: "yes", mood_flags: [], confidence: 1 },
    level: "GREEN",
    risk: { score: 0, band: "low" },
    reasons: [],
    family_message: "",
    nurse_line: "",
    citations: [],
  };

  it("sends the payload to checkin_triage and returns the parsed output", async () => {
    const runFlow = vi.fn<RunFlow>(async () => ({ ok: true, text: JSON.stringify(valid) }));
    const r = await flowEnrich(runFlow, { timeoutMs: 5 })(enrichInputFor("mual"));
    expect(r).toEqual({ ok: true, output: valid });
    expect(runFlow.mock.calls[0][0]).toBe("checkin_triage");
    expect(runFlow.mock.calls[0][2]).toEqual({ timeoutMs: 5 });
  });

  it("invalid output and client failures are values", async () => {
    const bad = flowEnrich(async () => ({ ok: true, text: JSON.stringify({ ...valid, level: "SAFE" }) }));
    expect(await bad(enrichInputFor("mual"))).toEqual({ ok: false, reason: "invalid_output" });
    const down = flowEnrich(async () => ({ ok: false, reason: "network" }));
    expect(await down(enrichInputFor("mual"))).toEqual({ ok: false, reason: "network" });
  });

  it("rules-only and thrown errors", async () => {
    expect(await noEnrich(enrichInputFor("mual"))).toEqual({ ok: false, reason: "disabled" });
    expect(
      await safeEnrich(async () => {
        throw new Error("x");
      }, enrichInputFor("mual")),
    ).toEqual({ ok: false, reason: "error" });
  });
});
