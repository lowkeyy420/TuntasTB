import { describe, it, expect } from "vitest";
import { copy } from "@/copy/family.id";
import { loadRiskPointsFromDir } from "@/lib/risk/points";
import type { RiskReason } from "@/lib/risk/types";
import { loadRulesFromDir } from "@/lib/triage/loadFiles";
import type { Level } from "@/lib/triage/types";
import { actionFor, composeReply, templateFor, type ComposeInput } from "./compose";
import { wordCount } from "./filter";
import { DEFAULT_FORBIDDEN } from "./forbidden";
import { buildNurseLine, chooseNurseLine, MAX_NURSE_LINE } from "./nurseLine";
import { BUILTIN_MANIFEST } from "./sources";

const rules = loadRulesFromDir();
const table = rules.table;
const contact = { name: "Contoh", phone: "021-555 0100" };
const CITE = [{ id: "efek-samping-ringan#umum", label: "ignored" }];

function input(over: Partial<ComposeInput> = {}): ComposeInput {
  return { level: "GREEN", table, contact, fallbackUsed: false, ...over };
}

describe("reply structure (4.1)", () => {
  it("GREEN with a valid generated message: explanation, one action, one source, contact last", () => {
    const text = "Air kencing merah sering terjadi karena obat ini.";
    const r = composeReply(
      input({ flowLevel: "GREEN", generated: { text, citations: CITE }, doseMissed: false }),
    );
    expect(r.explanation).toBe(text);
    expect(r.action).toBe(table.levels.GREEN.action_id);
    expect(r.citations).toEqual([
      { id: "efek-samping-ringan#umum", label: BUILTIN_MANIFEST["efek-samping-ringan#umum"].label },
    ]);
    expect(r.contactLine).toBe("Puskesmas Contoh, telepon 021-555 0100.");
    expect(r.templateUsed).toBe(false);
    expect(r.replaceReason).toBeNull();
    expect(r.warning).toBeNull();
  });

  it("uses the static template and records why when the generated text is rejected", () => {
    const r = composeReply(
      input({ flowLevel: "GREEN", generated: { text: "Ini aman, tenang saja.", citations: CITE } }),
    );
    expect(r.explanation).toBe(table.levels.GREEN.message_id);
    expect(r.templateUsed).toBe(true);
    expect(r.replaceReason).toBe("reassurance");
    expect(r.explanation + r.action).not.toMatch(/\baman\b/i);
  });

  it("records no_generated when there is nothing generated", () => {
    const r = composeReply(input({ generated: null }));
    expect(r).toMatchObject({ templateUsed: true, replaceReason: "no_generated" });
    expect(composeReply(input()).replaceReason).toBe("no_generated");
  });

  it("a message written for a lower level is replaced after the level was raised", () => {
    const r = composeReply(
      input({
        level: "RED",
        flowLevel: "GREEN",
        generated: { text: "Keluhan ini umum.", citations: CITE },
      }),
    );
    expect(r.replaceReason).toBe("level_mismatch");
    expect(r.explanation).toBe(table.levels.RED.message_id);
    expect(r.action).toBe(table.levels.RED.action_id);
  });

  it("the action never comes from the generated text", () => {
    const r = composeReply(
      input({
        level: "YELLOW",
        flowLevel: "YELLOW",
        generated: { text: "Hubungi perawat nanti sore.", citations: CITE },
      }),
    );
    expect(r.action).toBe(table.levels.YELLOW.action_id);
    expect(r.explanation).toBe("Hubungi perawat nanti sore.");
  });

  it.each(["GREEN", "YELLOW", "RED"] as Level[])("%s: contact last, at most 60 words, no 'aman'", (level) => {
    const r = composeReply(input({ level, fallbackUsed: true }));
    expect(r.contactLine).toMatch(/telepon 021-555 0100\.$/);
    expect(wordCount(`${r.explanation} ${r.action}`)).toBeLessThanOrEqual(60);
    expect(JSON.stringify(r)).not.toMatch(/\baman\b/i);
    expect(r.citations).toHaveLength(1);
  });

  it("RED tells the family to go to the Puskesmas or IGD today and that the nurse was told", () => {
    const r = composeReply(input({ level: "RED", fallbackUsed: true }));
    expect(r.action).toMatch(/Puskesmas atau IGD hari ini/);
    expect(r.explanation).toMatch(/Perawat sudah diberi tahu/);
  });

  it("YELLOW keeps taking the medicine and says the nurse calls within 1 working day", () => {
    const r = composeReply(input({ level: "YELLOW" }));
    expect(r.action).toMatch(/Tetap minum obat/);
    expect(r.action).toMatch(/1 hari kerja/);
  });

  it("adds the standing warning when the flow was not used", () => {
    expect(composeReply(input({ fallbackUsed: true })).warning).toBe(table.fallback_warning_id);
    expect(table.fallback_warning_id).toBe(
      "Kalau ada mata/kulit kuning, ruam, atau gangguan penglihatan, segera ke Puskesmas.",
    );
  });

  it("demo day 41: YELLOW with stop intent says not to stop yet", () => {
    const r = composeReply(input({ level: "YELLOW", stopIntent: true, fallbackUsed: true }));
    expect(r.action).toBe(copy.reply.variants.stopIntentAction);
    expect(r.action).toMatch(/^Jangan berhenti dulu\./);
    expect(r.action).toMatch(/1 hari kerja/);
    expect(wordCount(`${r.explanation} ${r.action}`)).toBeLessThanOrEqual(60);
  });

  it("stop intent changes only the YELLOW action", () => {
    expect(actionFor("GREEN", table, true)).toBe(table.levels.GREEN.action_id);
    expect(actionFor("RED", table, true)).toBe(table.levels.RED.action_id);
    expect(actionFor("YELLOW", table, false)).toBe(table.levels.YELLOW.action_id);
  });

  it("GREEN with no symptom uses the two thank-you variants and never mentions catching up a dose", () => {
    expect(templateFor("GREEN", table, { noSymptom: true })).toBe(copy.reply.variants.noSymptom);
    const missed = templateFor("GREEN", table, { noSymptom: true, doseMissed: true });
    expect(missed).toBe(copy.reply.variants.doseMissed);
    expect(missed).not.toMatch(/susul|ganti|dobel|tambah/i);
    expect(templateFor("GREEN", table, { doseMissed: true })).toBe(table.levels.GREEN.message_id);
    expect(templateFor("YELLOW", table, { noSymptom: true })).toBe(table.levels.YELLOW.message_id);
  });

  it("works with a custom manifest and forbidden lists", () => {
    const manifest = { "a#b": { label: "Label A" } };
    const r = composeReply(
      input({
        flowLevel: "GREEN",
        manifest,
        forbidden: DEFAULT_FORBIDDEN,
        generated: { text: "Keluhan ini umum.", citations: [{ id: "a#b", label: "" }] },
      }),
    );
    expect(r.citations).toEqual([{ id: "a#b", label: "Label A" }]);
  });
});

describe("contact line", () => {
  it("does not double the word Puskesmas", () => {
    expect(copy.contact("Puskesmas Demo Jakarta", "021-5550123")).toBe("Puskesmas Demo Jakarta, telepon 021-5550123.");
    expect(copy.contact("Demo", "021")).toBe("Puskesmas Demo, telepon 021.");
  });
});

describe("nurse line (4.2)", () => {
  const points = loadRiskPointsFromDir();
  const reasons = (factors: [RiskReason["factor"], string][]): RiskReason[] =>
    factors.map(([factor, text]) => ({ factor, points: points.factors[factor].points, text }));

  it("demo day 41: mentions 7 days of nausea and the stop intent", () => {
    const line = buildNurseLine({
      symptoms: ["nausea_mild"],
      unknown: [],
      durations: { nausea_mild: 7 },
      reasons: reasons([
        ["stop_intent", points.factors.stop_intent.text_id],
        ["unresolved_side_effect", "Keluhan yang sama sudah 7 hari"],
        ["yellow_today", "x"],
      ]),
    });
    expect(line).toBe("mual 7 hari + bilang sudah sembuh atau mau berhenti");
    expect(line.length).toBeLessThanOrEqual(MAX_NURSE_LINE);
  });

  it("puts counts into reasons and skips symptom-covered ones", () => {
    const line = buildNurseLine({
      symptoms: [],
      unknown: ["text_unmatched"],
      durations: {},
      reasons: reasons([
        ["missed_dose_today", "x"],
        ["consecutive_missed_day", "Tidak minum obat 3 hari berturut-turut sebelumnya"],
        ["no_checkin", "Tidak ada laporan selama 4 hari"],
      ]),
    });
    expect(line).toBe(
      "keluhan belum dikenali + tidak minum obat hari ini + tidak minum obat 3 hari berturut-turut + tidak lapor 4 hari",
    );
  });

  it("names a symptom without a duration, and an unnamed code readably", () => {
    expect(buildNurseLine({ symptoms: ["jaundice"], unknown: [], durations: { jaundice: 1 }, reasons: [] })).toBe(
      "mata atau kulit kuning",
    );
    expect(buildNurseLine({ symptoms: ["new_code"], unknown: [], durations: {}, reasons: [] })).toBe("new code");
    expect(buildNurseLine({ symptoms: [], unknown: [], durations: {}, reasons: [] })).toBe("");
  });

  it("never exceeds 120 characters and drops whole parts", () => {
    const line = buildNurseLine({
      symptoms: ["nausea_mild", "appetite_loss", "tingling_feet", "joint_ache_mild", "urine_orange", "itching_no_rash"],
      unknown: [],
      durations: { nausea_mild: 9, appetite_loss: 9, tingling_feet: 9, joint_ache_mild: 9 },
      reasons: reasons([
        ["stop_intent", "x"],
        ["stigma", "x"],
        ["missed_pickup", "x"],
        ["no_pmo", "x"],
      ]),
    });
    expect(line.length).toBeLessThanOrEqual(MAX_NURSE_LINE);
    expect(line.endsWith(" +")).toBe(false);
    expect(line.startsWith("mual 9 hari + ")).toBe(true);
  });

  it("truncates a single part that is itself too long", () => {
    const code = "x".repeat(200);
    const line = buildNurseLine({ symptoms: [code], unknown: [], durations: {}, reasons: [] });
    expect(line.length).toBe(MAX_NURSE_LINE);
  });

  it("uses the generated line only when it is clean and short", () => {
    const fallback = "mual 7 hari + bilang sudah sembuh atau mau berhenti";
    expect(chooseNurseLine("mual seminggu, ingin berhenti", fallback, DEFAULT_FORBIDDEN)).toBe(
      "mual seminggu, ingin berhenti",
    );
    expect(chooseNurseLine("  mual  ", fallback, DEFAULT_FORBIDDEN)).toBe("mual");
    expect(chooseNurseLine("kurangi dosis", fallback, DEFAULT_FORBIDDEN)).toBe(fallback);
    expect(chooseNurseLine("ini tanda hepatitis", fallback, DEFAULT_FORBIDDEN)).toBe(fallback);
    expect(chooseNurseLine("a".repeat(121), fallback, DEFAULT_FORBIDDEN)).toBe(fallback);
    expect(chooseNurseLine("a".repeat(120), fallback, DEFAULT_FORBIDDEN)).toBe("a".repeat(120));
    expect(chooseNurseLine("", fallback, DEFAULT_FORBIDDEN)).toBe(fallback);
    expect(chooseNurseLine(null, fallback, DEFAULT_FORBIDDEN)).toBe(fallback);
    expect(chooseNurseLine(undefined, fallback, DEFAULT_FORBIDDEN)).toBe(fallback);
  });
});
