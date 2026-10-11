import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRules, RulesValidationError, validateRuleData } from "./rules";

const RULES_DIR = fileURLToPath(new URL("../../../../rules", import.meta.url));
const read = (file: string) => JSON.parse(readFileSync(`${RULES_DIR}/${file}`, "utf8"));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// --- minimal JSON Schema (draft-07 subset) checker used only to prove the files match rules/schema ---
function check(schema: Json, value: unknown, root: Json, path = "$"): string[] {
  if (schema.$ref) {
    const target = (schema.$ref as string).replace("#/", "").split("/").reduce((o: Json, k) => o[k], root);
    return check(target, value, root, path);
  }
  const errors: string[] = [];
  if (schema.oneOf) {
    const ok = (schema.oneOf as Json[]).filter((s) => check(s, value, root, path).length === 0).length;
    if (ok !== 1) errors.push(`${path}: matches ${ok} of oneOf`);
    return errors;
  }
  const isObj = typeof value === "object" && value !== null && !Array.isArray(value);
  const type = schema.type as string | undefined;
  if (type === "object" && !isObj) return [`${path}: expected object`];
  if (type === "array" && !Array.isArray(value)) return [`${path}: expected array`];
  if (type === "string" && typeof value !== "string") return [`${path}: expected string`];
  if (type === "boolean" && typeof value !== "boolean") return [`${path}: expected boolean`];
  if (type === "integer" && !Number.isInteger(value)) return [`${path}: expected integer`];
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) errors.push(`${path}: not in enum`);
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: pattern`);
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: below minimum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.items) value.forEach((v, i) => errors.push(...check(schema.items, v, root, `${path}[${i}]`)));
  }
  if (isObj) {
    const obj = value as Json;
    for (const k of schema.required ?? []) if (!(k in obj)) errors.push(`${path}: missing ${k}`);
    const props = (schema.properties ?? {}) as Json;
    for (const [k, v] of Object.entries(obj)) {
      if (k in props) errors.push(...check(props[k], v, root, `${path}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected ${k}`);
      else if (typeof schema.additionalProperties === "object") {
        errors.push(...check(schema.additionalProperties, v, root, `${path}.${k}`));
      }
    }
  }
  return errors;
}

describe("rule files against rules/schema", () => {
  it.each([
    ["triage-table.json", "triage-table.schema.json"],
    ["lexicon.id.json", "lexicon.id.schema.json"],
    ["risk-points.json", "risk-points.schema.json"],
  ])("%s validates against %s", (file, schemaFile) => {
    const schema = read(`schema/${schemaFile}`);
    expect(check(schema, read(file), schema)).toEqual([]);
  });

  it("the checker rejects a malformed table (guards the guard)", () => {
    const schema = read("schema/triage-table.schema.json");
    const bad = clone(read("triage-table.json"));
    bad.symptoms[0].level = "BLUE";
    expect(check(schema, bad, schema)).not.toEqual([]);
  });
});

describe("table content", () => {
  const table = read("triage-table.json");
  const levelOf = Object.fromEntries(table.symptoms.map((s: Json) => [s.code, s.level]));

  it("lists the eleven symptom codes with the planned levels", () => {
    expect(levelOf).toEqual({
      urine_orange: "GREEN",
      nausea_mild: "GREEN",
      joint_ache_mild: "GREEN",
      appetite_loss: "GREEN",
      tingling_feet: "YELLOW",
      itching_no_rash: "YELLOW",
      jaundice: "RED",
      vision_change: "RED",
      skin_rash: "RED",
      vomiting_repeated: "RED",
      confusion: "RED",
    });
  });

  it("is labelled draft and unknown input is YELLOW", () => {
    expect(table.review_status).toMatch(/draft/);
    expect(table.unknown_level).toBe("YELLOW");
  });

  it("duration rule: nausea and appetite loss at 7 days is YELLOW", () => {
    expect(table.duration_rules).toEqual([
      { codes: ["nausea_mild", "appetite_loss"], min_days: 7, level: "YELLOW" },
    ]);
  });

  it("every code has at least five lexicon variants and the five RED codes have a red-flag entry", () => {
    const lex = read("lexicon.id.json");
    const count = (e: Json) => (e.any?.length ?? 0) + (e.combo?.flat().length ?? 0);
    for (const code of Object.keys(levelOf)) {
      const entry = lex.symptoms[code] ?? lex.red_flags[code];
      expect(entry, code).toBeDefined();
      expect(count(entry), code).toBeGreaterThanOrEqual(5);
    }
    const reds = Object.keys(levelOf).filter((c) => levelOf[c] === "RED");
    expect(Object.keys(lex.red_flags).sort()).toEqual(reds.sort());
  });
});

describe("loadRules", () => {
  it("accepts the shipped files and exposes a combined version", () => {
    const rules = loadRules(read("triage-table.json"), read("lexicon.id.json"));
    expect(rules.version).toBe("0.1.0-draft/0.1.0-draft");
    expect(rules.levelByCode.get("jaundice")).toBe("RED");
  });

  it("accepts a lexicon without watch_words and numeric durations", () => {
    const lex = clone(read("lexicon.id.json"));
    delete lex.watch_words;
    lex.durations = [{ pattern: "seminggu", days: 7 }];
    const rules = loadRules(read("triage-table.json"), lex);
    expect(rules.watch).toEqual([]);
    expect(rules.durations).toHaveLength(1);
  });

  it("accepts a combo-only entry (no any list)", () => {
    const lex = clone(read("lexicon.id.json"));
    lex.symptoms.nausea_mild = { combo: [["perut"], ["enek", "mual"]] };
    const rules = loadRules(read("triage-table.json"), lex);
    expect(rules.symptomEntries.find((e) => e.code === "nausea_mild")).toEqual({
      code: "nausea_mild",
      any: [],
      combo: [["perut"], ["enek", "mual"]],
    });
  });

  it("accepts a chip_only symptom without a lexicon entry", () => {
    const table = clone(read("triage-table.json"));
    table.symptoms.push({ code: "chip_extra", level: "YELLOW", label_id: "Ekstra", chip_only: true });
    expect(validateRuleData(table, read("lexicon.id.json"))).toEqual([]);
  });

  it("throws RulesValidationError naming the unknown code (lexicon references a missing code)", () => {
    const lex = clone(read("lexicon.id.json"));
    lex.symptoms.not_in_table = { any: ["halo"] };
    try {
      loadRules(read("triage-table.json"), lex);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RulesValidationError);
      expect((e as RulesValidationError).errors.join()).toContain("not_in_table");
      expect((e as Error).message).toContain("not_in_table");
    }
  });
});

describe("validation rejects malformed rule files", () => {
  // [name, mutate(table, lexicon), expected error fragment]
  const cases: [string, (t: Json, l: Json) => void, string][] = [
    ["table is not an object", (t) => Object.keys(t).forEach((k) => delete t[k]), "version"],
    ["missing version", (t) => delete t.version, "triage-table.version"],
    ["blank review_status", (t) => (t.review_status = "  "), "review_status"],
    ["unknown_level GREEN", (t) => (t.unknown_level = "GREEN"), "unknown_level"],
    ["unknown_level invalid", (t) => (t.unknown_level = "BLUE"), "unknown_level"],
    ["symptoms empty", (t) => (t.symptoms = []), "triage-table.symptoms"],
    ["symptoms not a list", (t) => (t.symptoms = {}), "triage-table.symptoms"],
    ["symptom is not an object", (t) => (t.symptoms[0] = 5), "symptoms[0].code"],
    ["symptom code not a string", (t) => (t.symptoms[0].code = 5), "symptoms[0].code"],
    ["symptom code malformed", (t) => (t.symptoms[0].code = "Bad Code"), "symptoms[0].code"],
    ["duplicate code", (t) => (t.symptoms[1].code = t.symptoms[0].code), "kode ganda"],
    ["invalid symptom level", (t) => (t.symptoms[0].level = "BLUE"), "symptoms[0].level"],
    ["missing label", (t) => delete t.symptoms[0].label_id, "label_id"],
    ["duration_rules not a list", (t) => (t.duration_rules = null), "duration_rules"],
    ["duration rule not an object", (t) => (t.duration_rules = [3]), "duration_rules[0].codes"],
    ["duration rule without codes", (t) => (t.duration_rules[0].codes = []), "duration_rules[0].codes"],
    ["duration rule unknown code", (t) => (t.duration_rules[0].codes = ["nope"]), "nope"],
    ["duration rule non-string code", (t) => (t.duration_rules[0].codes = [7]), "tidak dikenal"],
    ["duration rule min_days 0", (t) => (t.duration_rules[0].min_days = 0), "min_days"],
    ["duration rule min_days fraction", (t) => (t.duration_rules[0].min_days = 1.5), "min_days"],
    ["duration rule bad level", (t) => (t.duration_rules[0].level = "x"), "duration_rules[0].level"],
    ["levels missing", (t) => delete t.levels, "levels.GREEN"],
    ["level text missing message", (t) => delete t.levels.RED.message_id, "levels.RED"],
    ["level text not an object", (t) => (t.levels.YELLOW = "x"), "levels.YELLOW"],
    ["missing fallback warning", (t) => delete t.fallback_warning_id, "fallback_warning_id"],
    ["lexicon not an object", (_t, l) => Object.keys(l).forEach((k) => delete l[k]), "lexicon.version"],
    ["lexicon version missing", (_t, l) => delete l.version, "lexicon.version"],
    ["lexicon symptoms missing", (_t, l) => delete l.symptoms, "lexicon.symptoms"],
    ["lexicon red_flags not an object", (_t, l) => (l.red_flags = []), "lexicon.red_flags"],
    ["table code without entry", (_t, l) => delete l.symptoms.nausea_mild, "nausea_mild"],
    ["entry not an object", (_t, l) => (l.symptoms.nausea_mild = "mual"), "nausea_mild: harus berupa objek"],
    ["entry without any or combo", (_t, l) => (l.symptoms.nausea_mild = {}), 'perlu "any" atau "combo"'],
    ["any empty", (_t, l) => (l.symptoms.nausea_mild = { any: [] }), "nausea_mild.any"],
    ["any with blank phrase", (_t, l) => (l.symptoms.nausea_mild = { any: ["  "] }), "nausea_mild.any[0]"],
    ["any with punctuation-only phrase", (_t, l) => (l.symptoms.nausea_mild = { any: ["?!"] }), "nausea_mild.any[0]"],
    ["any with non-string phrase", (_t, l) => (l.symptoms.nausea_mild = { any: [3] }), "nausea_mild.any[0]"],
    ["combo with one group", (_t, l) => (l.symptoms.nausea_mild = { combo: [["a"]] }), "minimal dua kelompok"],
    ["combo not a list", (_t, l) => (l.symptoms.nausea_mild = { combo: "x" }), "minimal dua kelompok"],
    ["combo with empty group", (_t, l) => (l.symptoms.nausea_mild = { combo: [["a"], []] }), "combo[1]"],
    ["watch_words empty", (_t, l) => (l.watch_words = []), "watch_words"],
    ["stop_intent missing", (_t, l) => delete l.stop_intent, "stop_intent"],
    ["stigma empty", (_t, l) => (l.stigma = []), "stigma"],
    ["durations not a list", (_t, l) => (l.durations = {}), "lexicon.durations"],
    ["duration entry not an object", (_t, l) => (l.durations = [1]), "durations[0].pattern"],
    ["duration pattern blank", (_t, l) => (l.durations = [{ pattern: " ", days: 1 }]), "durations[0].pattern"],
    ["duration pattern invalid regex", (_t, l) => (l.durations = [{ pattern: "(", days: 1 }]), "regex tidak valid"],
    ["duration days 0", (_t, l) => (l.durations = [{ pattern: "a", days: 0 }]), "durations[0].days"],
    ["duration days fraction", (_t, l) => (l.durations = [{ pattern: "a", days: 1.5 }]), "durations[0].days"],
    ["duration days bad expression", (_t, l) => (l.durations = [{ pattern: "(a)", days: "$2" }]), 'harus angka atau "$1"'],
    ["duration days not a number or string", (_t, l) => (l.durations = [{ pattern: "(a)", days: null }]), "durations[0].days"],
    ["duration group reference without group", (_t, l) => (l.durations = [{ pattern: "a", days: "$1" }]), "grup tangkapan"],
  ];

  it.each(cases)("%s", (_name, mutate, fragment) => {
    const table = clone(read("triage-table.json"));
    const lexicon = clone(read("lexicon.id.json"));
    mutate(table, lexicon);
    const errors = validateRuleData(table, lexicon);
    expect(errors.join("\n")).toContain(fragment);
    expect(() => loadRules(table, lexicon)).toThrow(RulesValidationError);
  });

  it("rejects non-object inputs", () => {
    expect(validateRuleData(null, null).length).toBeGreaterThanOrEqual(2);
    expect(validateRuleData([], "x").length).toBeGreaterThanOrEqual(2);
  });
});
