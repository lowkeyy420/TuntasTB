import { describe, it, expect, vi } from "vitest";
import { loadRulesFromDir } from "@/lib/triage/loadFiles";
import { loadRiskPointsFromDir } from "@/lib/risk/points";
import { deriveSnapshot, type HistoryCheckin } from "@/lib/risk/history";
import { addDays } from "@/lib/risk/dates";
import { composeReply } from "@/lib/reply/compose";
import { loadManifest } from "@/lib/reply/manifestFile";
import type { FlowOutput } from "@/lib/langflow/flowSchema";
import { noEnrich, type Enrich } from "./enrich";
import { runPhaseA, runPhaseB, runPipeline, type PipelineDeps } from "./pipeline";
import { replyFromStored, toReply } from "./reply";
import type { CheckinBodyInput } from "./schema";
import { checkinBodySchema } from "./schema";

const rules = loadRulesFromDir();
const riskPoints = loadRiskPointsFromDir();
const manifest = loadManifest();
const contact = { name: "Demo", phone: "021-5550123" };
const CLIENT_ID = "6f1c1f0e-8a39-4a1e-9f5e-0d5c0a1b2c3d";

/** 12:00 Jakarta on the given day. */
const noon = (day: string) => new Date(`${day}T05:00:00Z`);

function makeDeps(opts: { history?: HistoryCheckin[]; enrich?: Enrich; hasPmo?: boolean } = {}): PipelineDeps {
  const history = opts.history ?? [];
  return {
    rules,
    riskPoints,
    manifest,
    enrich: opts.enrich ?? noEnrich,
    loadHistory: async () => history,
    buildSnapshot: async (_id, asOf, today) =>
      deriveSnapshot({
        asOf,
        history,
        rules,
        today,
        patient: { registeredOn: "2026-03-01", hasPmo: opts.hasPmo ?? true, pickups: [] },
      }),
  };
}

function input(body: Omit<CheckinBodyInput, "clientId">, day: string, start = "2026-03-01") {
  return {
    patient: { id: "patient-1", startDate: start },
    contact,
    body: checkinBodySchema.parse({ ...body, clientId: CLIENT_ID }),
    now: noon(day),
  };
}

function run(
  body: Omit<CheckinBodyInput, "clientId">,
  day: string,
  start = "2026-03-01",
  deps: PipelineDeps = makeDeps(),
) {
  return runPipeline(input(body, day, start), deps);
}

type Over = Partial<Omit<FlowOutput, "extracted">> & { extracted?: Partial<FlowOutput["extracted"]> };

/** A schema-valid `checkin_triage` output. */
function out(over: Over = {}): FlowOutput {
  const { extracted, ...rest } = over;
  return {
    extracted: {
      symptoms: [],
      unknown_symptoms: [],
      dose_status: "yes",
      mood_flags: [],
      confidence: 0.9,
      ...extracted,
    },
    level: "GREEN",
    risk: { score: 0, band: "low" },
    reasons: [],
    family_message: "",
    nurse_line: "",
    citations: [],
    ...rest,
  };
}

const flowReturning = (o: FlowOutput) => vi.fn<Enrich>(async () => ({ ok: true, output: o }));

describe("demo cases (2.1, with and without the flow)", () => {
  it("day 18, 'kencingnya merah': GREEN locally; GREEN with a confident flow", async () => {
    const enrich = flowReturning(
      out({ extracted: { symptoms: [{ code: "urine_orange", quote: "kencingnya merah", duration_days: null }] } }),
    );
    const d = await run({ doseStatus: "yes", text: "kencingnya merah" }, "2026-03-18", "2026-03-01", makeDeps({ enrich }));
    expect(d.treatmentDay).toBe(18);
    expect(d).toMatchObject({ localLevel: "GREEN", flowLevel: "GREEN", level: "GREEN", fallbackUsed: false });
    expect(d.symptoms.symptoms).toEqual(["urine_orange"]);
    expect(d.risk.band).toBe("low");
    expect(d.reply.action).toBe(rules.table.levels.GREEN.action_id);
    expect(d.reply.warning).toBeNull();
    // The static template's source is the section about the symptom.
    expect(d.reply.citations[0].id).toBe("efek-samping-ringan#urin-merah");
  });

  it("the same case as a chip is GREEN with no flow call", async () => {
    const enrich = vi.fn<Enrich>(noEnrich);
    const d = await run({ doseStatus: "yes", chips: ["urine_orange"] }, "2026-03-18", "2026-03-01", makeDeps({ enrich }));
    expect(d).toMatchObject({ level: "GREEN", fallbackUsed: false, flowLevel: null });
    expect(enrich).not.toHaveBeenCalled();
  });

  it("day 41, 'mual terus seminggu, Dimas bilang sudah sembuh, mau berhenti': YELLOW with high risk", async () => {
    const d = await run(
      { doseStatus: "yes", text: "mual terus seminggu, Dimas bilang sudah sembuh, mau berhenti" },
      "2026-04-10",
    );
    expect(d.treatmentDay).toBe(41);
    expect(d.level).toBe("YELLOW");
    expect(d.risk.band).toBe("high");
    expect(d.risk.score).toBe(8);
    expect(d.risk.reasons.map((r) => r.factor)).toEqual(["stop_intent", "unresolved_side_effect", "yellow_today"]);
    expect(d.reply.action).toMatch(/^Jangan berhenti dulu\./);
    expect(d.nurseLine).toBe("mual 7 hari + bilang sudah sembuh atau mau berhenti");
  });

  it("day 23, 'matanya kuning': RED", async () => {
    const d = await run({ doseStatus: "yes", text: "matanya kuning" }, "2026-03-23");
    expect(d.treatmentDay).toBe(23);
    expect(d.level).toBe("RED");
    expect(d.localLevel).toBe("RED");
    expect(d.symptoms.symptoms).toContain("jaundice");
    expect(d.reply.action).toBe(rules.table.levels.RED.action_id);
    expect(d.risk.reasons.map((r) => r.factor)).toContain("red_today");
  });

  it("no note and no chip: no flow call, no fallback mark, the no-symptom text", async () => {
    const d = await run({ doseStatus: "yes" }, "2026-03-18");
    expect(d).toMatchObject({ level: "GREEN", fallbackUsed: false, flowLevel: null });
    expect(d.reply.warning).toBeNull();
    expect(d.reply.templateUsed).toBe(true);
    expect(d.reply.explanation).toBe("Terima kasih sudah melapor hari ini.");
  });

  it("dose status 'no' scores at least 2 with the missed dose among the reasons", async () => {
    const d = await run({ doseStatus: "no" }, "2026-03-18");
    expect(d.risk.score).toBeGreaterThanOrEqual(2);
    expect(d.risk.reasons.map((r) => r.factor)).toContain("missed_dose_today");
    expect(d.reply.explanation).toMatch(/jujur melapor/);
  });

  it("an unknown chip code without a note is accepted and floors the level at YELLOW", async () => {
    const d = await run({ doseStatus: "yes", chips: ["sesuatu_baru"] }, "2026-03-18");
    expect(d.level).toBe("YELLOW");
    expect(d.symptoms.unknown).toContain("sesuatu_baru");
  });

  it("symptom persistence from earlier days lifts nausea to YELLOW", async () => {
    const day = "2026-03-18";
    const history: HistoryCheckin[] = [1, 2, 3, 4, 5, 6].map((n) => ({
      occurredOn: addDays(day, -n),
      createdAt: Date.parse(`${addDays(day, -n)}T03:00:00Z`),
      doseStatus: "yes",
      symptomCodes: ["nausea_mild"],
      textRedacted: null,
      triageLevel: "GREEN",
    }));
    const d = await run({ doseStatus: "yes", chips: ["nausea_mild"] }, day, "2026-03-01", makeDeps({ history }));
    expect(d.level).toBe("YELLOW");
    expect(d.risk.reasons.map((r) => r.factor)).toContain("unresolved_side_effect");
    expect(d.nurseLine).toMatch(/^mual 7 hari/);
    // Without the history the same chip is GREEN.
    expect((await run({ doseStatus: "yes", chips: ["nausea_mild"] }, day)).level).toBe("GREEN");
  });

  it("dates the check-in with the device date when plausible, and the receive day otherwise", async () => {
    const ok = await run({ doseStatus: "yes", occurredOn: "2026-03-03" }, "2026-03-04");
    expect([ok.occurredOn, ok.treatmentDay]).toEqual(["2026-03-03", 3]);
    const future = await run({ doseStatus: "yes", occurredOn: "2026-03-09" }, "2026-03-04");
    expect(future.occurredOn).toBe("2026-03-04");
    const old = await run({ doseStatus: "yes", occurredOn: "2026-02-20" }, "2026-03-04");
    expect(old.occurredOn).toBe("2026-03-04");
  });
});

describe("redaction before anything leaves the request (2.2)", () => {
  const raw = "mual, telepon 081234567890 atau nik 3171234567890123 jalan Mawar 5";

  it("the enrich step and the stored draft never see a phone number or NIK", async () => {
    const enrich = vi.fn<Enrich>(noEnrich);
    const d = await run({ doseStatus: "yes", text: raw }, "2026-03-18", "2026-03-01", makeDeps({ enrich }));

    expect(enrich).toHaveBeenCalledTimes(1);
    const seen = JSON.stringify(enrich.mock.calls);
    const stored = JSON.stringify(d);
    for (const text of [seen, stored]) {
      expect(text).not.toMatch(/081234567890/);
      expect(text).not.toMatch(/3171234567890123/);
      expect(text).not.toMatch(/Mawar/);
    }
    expect(d.textRedacted).toContain("[TELEPON]");
    expect(d.textRedacted).toContain("[NIK]");
    expect(enrich.mock.calls[0][0].text).toBe(d.textRedacted);
    // No identifier field exists on the input at all.
    expect(Object.keys(enrich.mock.calls[0][0]).sort()).toEqual(
      ["chips", "context", "doseStatus", "rulesVersion", "text", "treatmentDay"],
    );
    expect(seen).not.toMatch(/patient-1/);
  });
});

describe("failure floors at YELLOW (spec: invalid output, timeout, rules-only)", () => {
  it("rules-only mode: a GREEN-looking note is stored YELLOW with the fallback mark and warning", async () => {
    const d = await run({ doseStatus: "yes", text: "kencingnya merah" }, "2026-03-18");
    expect(d).toMatchObject({ localLevel: "GREEN", flowLevel: null, level: "YELLOW", fallbackUsed: true });
    expect(d.reply.warning).toBe(rules.table.fallback_warning_id);
    expect(d.reply.templateUsed).toBe(true);
  });

  it.each(["timeout", "network", "http", "shape", "invalid_output"] as const)(
    "%s: YELLOW, fallback, static text",
    async (reason) => {
      const enrich: Enrich = async () => ({ ok: false, reason });
      const d = await run({ doseStatus: "yes", text: "kencingnya merah" }, "2026-03-18", "2026-03-01", makeDeps({ enrich }));
      expect(d).toMatchObject({ level: "YELLOW", fallbackUsed: true, flowLevel: null });
      expect(d.reply.explanation).toBe(rules.table.levels.YELLOW.message_id);
    },
  );

  it("a thrown error is a failure too", async () => {
    const boom: Enrich = async () => {
      throw new Error("langflow down");
    };
    const d = await run({ doseStatus: "yes", text: "kencingnya merah" }, "2026-03-18", "2026-03-01", makeDeps({ enrich: boom }));
    expect(d).toMatchObject({ level: "YELLOW", flowLevel: null, fallbackUsed: true });
  });

  it("invalid output with a local RED stays RED", async () => {
    const enrich: Enrich = async () => ({ ok: false, reason: "invalid_output" });
    const d = await run({ doseStatus: "yes", text: "matanya kuning" }, "2026-03-23", "2026-03-01", makeDeps({ enrich }));
    expect(d.level).toBe("RED");
  });
});

describe("final level is the higher of local and flow (5.2)", () => {
  const green = { doseStatus: "yes" as const, text: "kencingnya merah" };
  const greenSym = [{ code: "urine_orange", quote: "kencingnya merah", duration_days: null }];
  const go = (o: FlowOutput, body: Omit<CheckinBodyInput, "clientId"> = green) =>
    run(body, "2026-03-18", "2026-03-01", makeDeps({ enrich: flowReturning(o) }));

  it("flow lower than local: local RED and flow GREEN is RED", async () => {
    const d = await run(
      { doseStatus: "yes", text: "matanya kuning" },
      "2026-03-23",
      "2026-03-01",
      makeDeps({ enrich: flowReturning(out({ level: "GREEN" })) }),
    );
    expect(d).toMatchObject({ localLevel: "RED", flowLevel: "GREEN", level: "RED" });
  });

  it("flow higher than local: 'kakinya kayak ditusuk-tusuk jarum' with a YELLOW flow is YELLOW", async () => {
    const d = await go(
      out({
        level: "YELLOW",
        extracted: { symptoms: [{ code: "tingling_feet", quote: "kakinya kayak ditusuk-tusuk jarum", duration_days: null }] },
      }),
      { doseStatus: "yes", text: "kakinya kayak ditusuk-tusuk jarum" },
    );
    expect(d).toMatchObject({ flowLevel: "YELLOW", level: "YELLOW" });
    expect(d.symptoms.symptoms).toContain("tingling_feet");
  });

  it("a RED flow raises a GREEN local", async () => {
    expect((await go(out({ level: "RED", extracted: { symptoms: greenSym } }))).level).toBe("RED");
  });

  it("unknown symptoms raise to YELLOW and are stored: 'kencingnya merah, telinganya berdenging'", async () => {
    const d = await go(
      out({ extracted: { symptoms: greenSym, unknown_symptoms: ["telinganya berdenging"] } }),
      { doseStatus: "yes", text: "kencingnya merah, telinganya berdenging" },
    );
    expect(d.level).toBe("YELLOW");
    expect(d.symptoms.unknown).toContain("telinganya berdenging");
  });

  it("a code not in the table is stored as unknown and raises to YELLOW", async () => {
    const d = await go(
      out({ extracted: { symptoms: [...greenSym, { code: "tinnitus", quote: "kencingnya merah", duration_days: null }] } }),
    );
    expect(d.level).toBe("YELLOW");
    expect(d.symptoms.unknown).toContain("kencingnya merah");
    expect(d.symptoms.symptoms).not.toContain("tinnitus");
  });

  it("confidence 0.4 with only GREEN symptoms is YELLOW", async () => {
    expect((await go(out({ extracted: { symptoms: greenSym, confidence: 0.4 } }))).level).toBe("YELLOW");
  });

  it("confidence 0.9, GREEN symptoms, no unknown, local GREEN stays GREEN", async () => {
    expect((await go(out({ extracted: { symptoms: greenSym, confidence: 0.9 } }))).level).toBe("GREEN");
  });

  it("a red-flag code the flow found (quoted) makes the app's rules say RED", async () => {
    const d = await go(
      out({
        level: "GREEN", // even if the flow's own level were wrong
        extracted: { symptoms: [...greenSym, { code: "jaundice", quote: "kencingnya merah", duration_days: null }] },
      }),
    );
    expect(d.level).toBe("RED");
  });
});

describe("quote check (5.3)", () => {
  it("a symptom whose quote is not in the note becomes an unknown symptom", async () => {
    const d = await run(
      { doseStatus: "yes", text: "kencingnya merah" },
      "2026-03-18",
      "2026-03-01",
      makeDeps({
        enrich: flowReturning(
          out({ extracted: { symptoms: [{ code: "skin_rash", quote: "ada ruam di tangan", duration_days: null }] } }),
        ),
      }),
    );
    expect(d.symptoms.symptoms).not.toContain("skin_rash");
    expect(d.symptoms.unknown).toContain("ada ruam di tangan");
    expect(d.level).toBe("YELLOW");
  });
});

describe("mood flags are OR-ed (6.2)", () => {
  it("a stop-intent flag found only by extraction adds the stop-intent points", async () => {
    const enrich = flowReturning(
      out({
        extracted: {
          symptoms: [{ code: "urine_orange", quote: "kencingnya merah", duration_days: null }],
          mood_flags: ["stop_intent"],
        },
      }),
    );
    const d = await run({ doseStatus: "yes", text: "kencingnya merah" }, "2026-03-18", "2026-03-01", makeDeps({ enrich }));
    expect(d.risk.reasons.map((r) => r.factor)).toContain("stop_intent");
  });

  it("a stop-intent phrase found only locally keeps its points when the flow returns no flag", async () => {
    const text = "mual terus seminggu, Dimas bilang sudah sembuh, mau berhenti";
    const enrich = flowReturning(
      out({ level: "YELLOW", extracted: { symptoms: [{ code: "nausea_mild", quote: "mual terus", duration_days: 7 }] } }),
    );
    const d = await run({ doseStatus: "yes", text }, "2026-04-10", "2026-03-01", makeDeps({ enrich }));
    expect(d.risk.reasons.map((r) => r.factor)).toContain("stop_intent");
    expect(d.risk.score).toBe(8);
  });
});

describe("two phases (6.1)", () => {
  it("phase A is the local result marked fallback; phase B never lowers it", async () => {
    const enrich = flowReturning(out({ level: "GREEN" }));
    const deps = makeDeps({ enrich });
    const a = await runPhaseA(input({ doseStatus: "yes", text: "matanya kuning" }, "2026-03-23"), deps);
    expect(a.draft).toMatchObject({ localLevel: "RED", level: "RED", fallbackUsed: true, flowLevel: null });
    expect(enrich).not.toHaveBeenCalled(); // phase A makes no call
    const b = await runPhaseB(a, deps);
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(b.draft.level).toBe("RED");
    expect(b.meta).toEqual({ called: true, flowLevel: "GREEN", finalLevel: "RED", fallbackReason: null });
  });

  it("phase B records why the flow was not used", async () => {
    const deps = makeDeps({ enrich: async () => ({ ok: false, reason: "timeout" }) });
    const b = await runPhaseB(await runPhaseA(input({ doseStatus: "yes", text: "mual" }, "2026-03-18"), deps), deps);
    expect(b.meta).toMatchObject({ called: true, flowLevel: null, finalLevel: "YELLOW", fallbackReason: "timeout" });
  });
});

describe("generated text from the flow", () => {
  const sym = [{ code: "urine_orange", quote: "kencingnya merah", duration_days: null }];
  const go = (o: FlowOutput) =>
    run({ doseStatus: "yes", text: "kencingnya merah" }, "2026-03-18", "2026-03-01", makeDeps({ enrich: flowReturning(o) }));

  it("shows a clean generated message with its manifest label and a clean nurse line", async () => {
    const d = await go(
      out({
        extracted: { symptoms: sym },
        nurse_line: "kencing merah, wajar karena obat",
        family_message: "Air kencing merah sering terjadi karena obat ini.",
        citations: [{ id: "efek-samping-ringan#urin-merah", label: "x" }],
      }),
    );
    expect(d.reply.templateUsed).toBe(false);
    expect(d.reply.explanation).toBe("Air kencing merah sering terjadi karena obat ini.");
    expect(d.reply.citations).toEqual([
      { id: "efek-samping-ringan#urin-merah", label: manifest["efek-samping-ringan#urin-merah"].label },
    ]);
    expect(d.nurseLine).toBe("kencing merah, wajar karena obat");
  });

  it("a generated message with 'aman' is replaced and the reason is recorded", async () => {
    const d = await go(
      out({
        extracted: { symptoms: sym },
        family_message: "Ini aman.",
        citations: [{ id: "efek-samping-ringan#urin-merah", label: "x" }],
      }),
    );
    expect(d.reply).toMatchObject({ templateUsed: true, replaceReason: "reassurance" });
    expect(JSON.stringify(d.reply)).not.toMatch(/\baman\b/i);
  });

  it("a message written for GREEN is replaced when the final level is YELLOW", async () => {
    const d = await go(
      out({
        extracted: { symptoms: sym, confidence: 0.4 },
        family_message: "Air kencing merah sering terjadi karena obat ini.",
        citations: [{ id: "efek-samping-ringan#urin-merah", label: "x" }],
      }),
    );
    expect(d.level).toBe("YELLOW");
    expect(d.reply).toMatchObject({ templateUsed: true, replaceReason: "level_mismatch" });
  });
});

describe("reply builder (2.4)", () => {
  const reply = (level: "GREEN" | "YELLOW" | "RED", over = {}) =>
    toReply(
      "id-1",
      level,
      composeReply({ level, table: rules.table, contact, fallbackUsed: true, ...over }),
      contact,
      true,
    );

  it("RED: go to the Puskesmas or IGD today, nurse informed, contact, no 'aman'", () => {
    const r = reply("RED");
    expect(r.action).toMatch(/Puskesmas atau IGD hari ini/);
    expect(r.message).toMatch(/Perawat sudah diberi tahu/);
    expect(r.contact).toEqual(contact);
    expect(r.warning).toBe(rules.table.fallback_warning_id);
    expect(JSON.stringify(r)).not.toMatch(/\baman\b/i);
  });

  it("YELLOW: keep taking the medicine, nurse in touch within 1 working day", () => {
    const r = reply("YELLOW");
    expect(r.action).toMatch(/Tetap minum obat/);
    expect(r.action).toMatch(/1 hari kerja/);
    expect(JSON.stringify(r)).not.toMatch(/\baman\b/i);
  });

  it("GREEN without the fallback has no warning", () => {
    const r = toReply(
      "id-1",
      "GREEN",
      composeReply({ level: "GREEN", table: rules.table, contact, fallbackUsed: false }),
      contact,
      false,
    );
    expect(r.warning).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/\baman\b/i);
  });

  it("no reply for any level or variant contains 'aman'", () => {
    for (const level of ["GREEN", "YELLOW", "RED"] as const) {
      for (const stopIntent of [false, true]) {
        for (const noSymptom of [false, true]) {
          for (const doseMissed of [false, true]) {
            const r = reply(level, { stopIntent, noSymptom, doseMissed });
            expect(JSON.stringify(r)).not.toMatch(/\baman\b/i);
          }
        }
      }
    }
  });

  it("rebuilds the same reply from a stored row", () => {
    const original = reply("YELLOW");
    const rebuilt = replyFromStored(
      {
        id: "id-1",
        triageLevel: "YELLOW",
        familyMessage: original.message,
        replyAction: original.action,
        citationsJson: original.citations,
        fallbackUsed: true,
      },
      contact,
      rules.table,
    );
    expect(rebuilt).toEqual(original);
  });

  it("a row with missing columns still yields a safe reply (YELLOW, empty text, no citations)", () => {
    const r = replyFromStored(
      { id: "x", triageLevel: null, familyMessage: null, replyAction: null, citationsJson: null, fallbackUsed: false },
      contact,
      rules.table,
    );
    expect(r).toMatchObject({ level: "YELLOW", message: "", action: "", citations: [], warning: null });
  });
});
