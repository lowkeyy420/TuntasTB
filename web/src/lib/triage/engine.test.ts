import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { maxLevel, triage } from "./engine";
import { loadRulesFromDir } from "./loadFiles";
import type { Level, TriageInput } from "./types";

const rules = loadRulesFromDir(fileURLToPath(new URL("../../../../rules", import.meta.url)));
const run = (input: Partial<TriageInput>) => triage({ chips: [], text: "", ...input }, rules);
const levelOfText = (text: string, chips: string[] = []) => run({ text, chips }).level;

describe("Deterministic triage table", () => {
  it.each([
    ["urine_orange", "GREEN"],
    ["nausea_mild", "GREEN"],
    ["joint_ache_mild", "GREEN"],
    ["tingling_feet", "YELLOW"],
    ["itching_no_rash", "YELLOW"],
    ["jaundice", "RED"],
    ["vision_change", "RED"],
    ["skin_rash", "RED"],
    ["vomiting_repeated", "RED"],
    ["confusion", "RED"],
    ["appetite_loss", "GREEN"],
  ])("a lone %s chip is %s", (code, level) => {
    const r = run({ chips: [code] });
    expect(r.level).toBe(level);
    expect(r.symptoms).toEqual([code]);
    expect(r.decidedBy).toBe("table");
  });

  it("repeatable result: 100 evaluations are identical", () => {
    const input: TriageInput = {
      chips: ["nausea_mild", "bogus"],
      text: "mual terus, matanya agak kuning",
      persistenceDays: { nausea_mild: 3 },
    };
    const first = JSON.stringify(triage(input, rules));
    for (let i = 0; i < 100; i++) expect(JSON.stringify(triage(input, rules))).toBe(first);
  });

  it("does not mutate its input", () => {
    const input: TriageInput = { chips: ["urine_orange"], text: "Mual", extracted: [{ code: "x" }] };
    const copy = JSON.parse(JSON.stringify(input));
    triage(input, rules);
    expect(input).toEqual(copy);
  });
});

describe("No symptoms is GREEN", () => {
  it("nothing reported", () => {
    expect(run({})).toMatchObject({ level: "GREEN", decidedBy: "no_symptoms", symptoms: [], redFlags: [], unknown: [] });
  });
});

describe("Highest level wins", () => {
  it("GREEN with RED", () => expect(run({ chips: ["urine_orange", "jaundice"] }).level).toBe("RED"));
  it("GREEN with YELLOW", () => expect(run({ chips: ["nausea_mild", "tingling_feet"] }).level).toBe("YELLOW"));
});

describe("Red-flag keyword forces RED", () => {
  it("hedged red flag", () => {
    const r = run({ text: "mual terus, matanya agak kuning" });
    expect(r.level).toBe("RED");
    expect(r.redFlags).toEqual(["jaundice"]);
  });
  it("uncertain red flag", () => expect(levelOfText("kayaknya penglihatannya buram")).toBe("RED"));
  it("red flag overrides green chips", () => {
    expect(levelOfText("muntah terus dari pagi", ["urine_orange"])).toBe("RED");
  });
  it("negated red flag still escalates", () => expect(levelOfText("matanya tidak kuning")).toBe("RED"));
  it("demo case: matanya kuning", () => expect(levelOfText("matanya kuning")).toBe("RED"));
  it("a red flag cannot be masked by any other input", () => {
    const r = run({
      chips: ["urine_orange"],
      text: "mual seminggu, mata kuning",
      persistenceDays: { nausea_mild: 0 },
      extracted: [{ code: "nausea_mild", durationDays: 0 }],
      unknownSymptoms: [],
    });
    expect(r.level).toBe("RED");
    expect(r.decidedBy).toBe("red_flag_keyword");
  });
  it.each([
    "mata kuning",
    "matanya agak kuning",
    "kulit kuning",
    "pandangan kabur",
    "buram",
    "ruam",
    "bintik merah",
    "muntah terus",
    "linglung",
    "MATANYA KUNING!!!",
  ])("%s is RED", (text) => expect(levelOfText(text)).toBe("RED"));
});

describe("Indonesian keywords and slang", () => {
  it("demo wording for urine", () => {
    const r = run({ text: "kencingnya merah" });
    expect(r.symptoms).toEqual(["urine_orange"]);
    expect(r.level).toBe("GREEN");
  });
  it("stretched spelling", () => expect(run({ text: "MUALLL banget" }).symptoms).toEqual(["nausea_mild"]));
  it("colloquial word", () => {
    const r = run({ text: "kakinya kesemutan terus" });
    expect(r.symptoms).toEqual(["tingling_feet"]);
    expect(r.level).toBe("YELLOW");
  });
  it("color word without a body part is at least YELLOW", () => {
    expect(["YELLOW", "RED"]).toContain(levelOfText("kuning"));
  });
  it('"kencingnya kuning pekat" is not jaundice', () => {
    const r = run({ text: "kencingnya kuning pekat" });
    expect(r.redFlags).toEqual([]);
    expect(r.level).toBe("YELLOW");
  });
});

describe("Duration escalation", () => {
  it("duration stated in text", () => {
    const r = run({ text: "mual terus seminggu" });
    expect(r.level).toBe("YELLOW");
    expect(r.decidedBy).toBe("duration_rule");
  });
  it("duration from history", () => {
    expect(run({ chips: ["nausea_mild"], persistenceDays: { nausea_mild: 8 } }).level).toBe("YELLOW");
  });
  it("short duration", () => {
    expect(run({ chips: ["nausea_mild"], persistenceDays: { nausea_mild: 3 } }).level).toBe("GREEN");
  });
  it("uses the longest of text, history and extraction", () => {
    expect(run({ chips: ["appetite_loss"], text: "3 hari", persistenceDays: { appetite_loss: 9 } }).level).toBe("YELLOW");
    expect(run({ chips: ["appetite_loss"], text: "9 hari", persistenceDays: { appetite_loss: 1 } }).level).toBe("YELLOW");
    expect(
      run({ chips: ["appetite_loss"], extracted: [{ code: "appetite_loss", durationDays: 7 }] }).level,
    ).toBe("YELLOW");
  });
  it("ignores extraction durations of other codes and missing durations", () => {
    const r = run({
      chips: ["nausea_mild"],
      extracted: [{ code: "urine_orange", durationDays: 30 }, { code: "nausea_mild" }],
    });
    expect(r.level).toBe("GREEN");
  });
  it("does not apply to codes outside the rule", () => {
    expect(run({ chips: ["urine_orange"], persistenceDays: { urine_orange: 40 } }).level).toBe("GREEN");
  });
  it("is not applied when the symptom is not reported", () => {
    expect(run({ persistenceDays: { nausea_mild: 40 } }).level).toBe("GREEN");
  });
});

describe("Unknown symptoms are never GREEN", () => {
  it("unclassifiable text", () => {
    const r = run({ text: "badannya aneh rasanya" });
    expect(r.level).toBe("YELLOW");
    expect(r.decidedBy).toBe("unknown_symptom");
    expect(r.unknown).toContain("text_unmatched");
  });
  it("unknown chip code is listed in the reasons", () => {
    const r = run({ chips: ["nyeri_dada"] });
    expect(r.level).toBe("YELLOW");
    expect(r.unknown).toEqual(["nyeri_dada"]);
    expect(r.symptoms).toEqual([]);
  });
  it("unknown symptom with a known green one", () => {
    const r = run({ chips: ["urine_orange"], unknownSymptoms: ["rasa aneh"] });
    expect(r.level).toBe("YELLOW");
    expect(r.symptoms).toEqual(["urine_orange"]);
    expect(r.unknown).toEqual(["rasa aneh"]);
  });
  it("unknown extracted code", () => {
    const r = run({ extracted: [{ code: "foo" }] });
    expect(r.level).toBe("YELLOW");
    expect(r.unknown).toEqual(["foo"]);
  });
  it("watch words next to a known green symptom escalate", () => {
    const r = run({ text: "mual muntah" });
    expect(r.level).toBe("YELLOW");
    expect(r.unknown).toEqual(["watch:muntah"]);
  });
  it("stop-intent or stigma text alone is not a symptom and is YELLOW", () => {
    expect(levelOfText("capek minum obat")).toBe("YELLOW");
    expect(levelOfText("malu sama tetangga")).toBe("YELLOW");
  });
  it("a table with a RED unknown_level makes unknown input RED", () => {
    const strict = loadRulesFromDirWith("RED");
    expect(triage({ chips: ["zzz"], text: "" }, strict).level).toBe("RED");
  });
  it("decidedBy is table when an unknown matches the base level", () => {
    const r = run({ chips: ["tingling_feet", "zzz"] });
    expect(r.level).toBe("YELLOW");
    expect(r.decidedBy).toBe("table");
  });
});

describe("Reasons accompany every level", () => {
  it("red flag reasons name the symptom and the deciding rule", () => {
    const r = run({ text: "matanya agak kuning" });
    expect(r).toMatchObject({
      level: "RED",
      symptoms: ["jaundice"],
      redFlags: ["jaundice"],
      decidedBy: "red_flag_keyword",
      rulesVersion: "0.1.0-draft/0.1.0-draft",
    });
  });
  it("lists are sorted and de-duplicated", () => {
    const r = run({ chips: ["urine_orange", "nausea_mild", "urine_orange"], text: "kencing merah, mual" });
    expect(r.symptoms).toEqual(["nausea_mild", "urine_orange"]);
  });
});

describe("Escalation-only combination", () => {
  const levels: Level[] = ["GREEN", "YELLOW", "RED"];
  const rank = { GREEN: 0, YELLOW: 1, RED: 2 };
  it.each(levels.flatMap((a) => levels.map((b) => [a, b] as const)))("maxLevel(%s, %s)", (a, b) => {
    const expected = rank[a] >= rank[b] ? a : b;
    expect(maxLevel(a, b)).toBe(expected);
    expect(rank[maxLevel(a, b)]).toBeGreaterThanOrEqual(Math.max(rank[a], rank[b]));
    expect(maxLevel(b, a)).toBe(expected);
  });
  it("local RED with other GREEN is RED; local GREEN with other YELLOW is YELLOW", () => {
    expect(maxLevel("RED", "GREEN")).toBe("RED");
    expect(maxLevel("GREEN", "YELLOW")).toBe("YELLOW");
  });
});

function loadRulesFromDirWith(unknownLevel: Level) {
  const base = loadRulesFromDir(fileURLToPath(new URL("../../../../rules", import.meta.url)));
  return { ...base, table: { ...base.table, unknown_level: unknownLevel } };
}
