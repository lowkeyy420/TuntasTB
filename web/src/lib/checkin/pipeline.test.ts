import { describe, it, expect, vi } from "vitest";
import { loadRulesFromDir } from "@/lib/triage/loadFiles";
import { loadRiskPointsFromDir } from "@/lib/risk/points";
import { deriveSnapshot, type HistoryCheckin } from "@/lib/risk/history";
import { addDays } from "@/lib/risk/dates";
import { composeReply } from "@/lib/reply/compose";
import { noEnrich, type Enrich } from "./enrich";
import { runPipeline, type PipelineDeps } from "./pipeline";
import { replyFromStored, toReply } from "./reply";
import type { CheckinBodyInput } from "./schema";
import { checkinBodySchema } from "./schema";

const rules = loadRulesFromDir();
const riskPoints = loadRiskPointsFromDir();
const contact = { name: "Demo", phone: "021-5550123" };
const CLIENT_ID = "6f1c1f0e-8a39-4a1e-9f5e-0d5c0a1b2c3d";

/** 12:00 Jakarta on the given day. */
const noon = (day: string) => new Date(`${day}T05:00:00Z`);

function makeDeps(opts: { history?: HistoryCheckin[]; enrich?: Enrich; hasPmo?: boolean } = {}): PipelineDeps {
  const history = opts.history ?? [];
  return {
    rules,
    riskPoints,
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

function run(
  body: Omit<CheckinBodyInput, "clientId">,
  day: string,
  start = "2026-03-01",
  deps: PipelineDeps = makeDeps(),
) {
  return runPipeline(
    {
      patient: { id: "patient-1", startDate: start },
      contact,
      body: checkinBodySchema.parse({ ...body, clientId: CLIENT_ID }),
      now: noon(day),
    },
    deps,
  );
}

describe("demo cases in rules-only mode (2.1)", () => {
  it("day 18, dose yes, 'kencingnya merah': the rules return GREEN and nothing lowers it", async () => {
    const d = await run({ doseStatus: "yes", text: "kencingnya merah" }, "2026-03-18");
    expect(d.treatmentDay).toBe(18);
    expect(d.localLevel).toBe("GREEN");
    expect(d.level).toBe("GREEN");
    expect(d.symptoms.symptoms).toEqual(["urine_orange"]);
    expect(d.risk.band).toBe("low");
    expect(d.reply.action).toBe(rules.table.levels.GREEN.action_id);
  });

  it("the same case as a chip is GREEN too", async () => {
    const d = await run({ doseStatus: "yes", chips: ["urine_orange"] }, "2026-03-18");
    expect(d.level).toBe("GREEN");
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

  it("no flow means fallbackUsed, no flow level and the standing warning", async () => {
    const d = await run({ doseStatus: "yes" }, "2026-03-18");
    expect(d.fallbackUsed).toBe(true);
    expect(d.flowLevel).toBeNull();
    expect(d.reply.warning).toBe(rules.table.fallback_warning_id);
    expect(d.reply.templateUsed).toBe(true);
    expect(d.reply.explanation).toBe("Terima kasih sudah melapor hari ini.");
  });

  it("dose status 'no' scores at least 2 with the missed dose among the reasons", async () => {
    const d = await run({ doseStatus: "no" }, "2026-03-18");
    expect(d.risk.score).toBeGreaterThanOrEqual(2);
    expect(d.risk.reasons.map((r) => r.factor)).toContain("missed_dose_today");
    expect(d.reply.explanation).toMatch(/jujur melapor/);
  });

  it("an unknown chip code is accepted and floors the level at YELLOW", async () => {
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

  it("the enrich seam and the stored draft never see a phone number or NIK", async () => {
    const enrich = vi.fn<Enrich>(async () => null);
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
  });
});

describe("the enrich seam can only raise the level", () => {
  const flow = (level: "GREEN" | "YELLOW" | "RED", extra = {}): Enrich => async () => ({ level, ...extra });

  it("takes the higher of the local and flow levels", async () => {
    const raised = await run({ doseStatus: "yes" }, "2026-03-18", "2026-03-01", makeDeps({ enrich: flow("RED") }));
    expect(raised).toMatchObject({ localLevel: "GREEN", flowLevel: "RED", level: "RED", fallbackUsed: false });
    expect(raised.reply.warning).toBeNull();

    const lowered = await run(
      { doseStatus: "yes", text: "matanya kuning" },
      "2026-03-23",
      "2026-03-01",
      makeDeps({ enrich: flow("GREEN") }),
    );
    expect(lowered).toMatchObject({ localLevel: "RED", flowLevel: "GREEN", level: "RED" });
  });

  it("a thrown error means no flow: the local result stands", async () => {
    const boom: Enrich = async () => {
      throw new Error("langflow down");
    };
    const d = await run({ doseStatus: "yes" }, "2026-03-18", "2026-03-01", makeDeps({ enrich: boom }));
    expect(d).toMatchObject({ level: "GREEN", flowLevel: null, fallbackUsed: true });
  });

  it("merges flow mood flags and shows a clean generated message and nurse line", async () => {
    const enrich = flow("GREEN", {
      moodFlags: ["stop_intent"],
      nurseLine: "pasien ingin berhenti",
      generated: {
        text: "Air kencing merah sering terjadi karena obat ini.",
        citations: [{ id: "efek-samping-ringan#umum", label: "" }],
      },
    });
    const d = await run({ doseStatus: "yes", chips: ["urine_orange"] }, "2026-03-18", "2026-03-01", makeDeps({ enrich }));
    expect(d.risk.reasons.map((r) => r.factor)).toContain("stop_intent");
    expect(d.nurseLine).toBe("pasien ingin berhenti");
    expect(d.reply.templateUsed).toBe(false);
    expect(d.reply.explanation).toBe("Air kencing merah sering terjadi karena obat ini.");
  });

  it("a generated message with 'aman' is replaced and the reason is recorded", async () => {
    const enrich = flow("GREEN", {
      generated: { text: "Ini aman.", citations: [{ id: "efek-samping-ringan#umum", label: "" }] },
    });
    const d = await run({ doseStatus: "yes", chips: ["urine_orange"] }, "2026-03-18", "2026-03-01", makeDeps({ enrich }));
    expect(d.reply).toMatchObject({ templateUsed: true, replaceReason: "reassurance" });
    expect(JSON.stringify(d.reply)).not.toMatch(/\baman\b/i);
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
