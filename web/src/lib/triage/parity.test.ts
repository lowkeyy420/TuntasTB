import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { triage } from "./engine";
import { loadRulesFromDir } from "./loadFiles";
import { matchCodes } from "./match";
import { normalise } from "./normalise";
import type { Rules, TriageInput } from "./types";

const RULES_DIR = fileURLToPath(new URL("../../../../rules", import.meta.url));
const rules = loadRulesFromDir(RULES_DIR);

interface ParityCase {
  id: string;
  input: TriageInput;
  expected: { level: string; symptoms: string[]; redFlags: string[]; decidedBy?: string };
}

export function loadParityCases(): ParityCase[] {
  return readFileSync(`${RULES_DIR}/fixtures/parity.jsonl`, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ParityCase);
}

/** Names every rule entry that no fixture case exercises. */
export function findUncoveredEntries(r: Rules, cases: ParityCase[]): string[] {
  const missing: string[] = [];
  for (const s of r.table.symptoms) {
    if (!cases.some((c) => c.expected.symptoms.includes(s.code))) missing.push(`symptom:${s.code}`);
  }
  for (const entry of r.redFlagEntries) {
    if (!cases.some((c) => c.expected.redFlags.includes(entry.code))) missing.push(`red_flag:${entry.code}`);
  }
  r.table.duration_rules.forEach((rule, i) => {
    for (const code of rule.codes) {
      const covered = cases.some(
        (c) => c.expected.decidedBy === "duration_rule" && c.expected.symptoms.includes(code),
      );
      if (!covered) missing.push(`duration_rule[${i}]:${code}`);
    }
  });
  return missing;
}

const cases = loadParityCases();

describe("parity fixture (shared with pytest)", () => {
  it("has at least 60 well-formed cases with unique ids", () => {
    expect(cases.length).toBeGreaterThanOrEqual(60);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(typeof c.id).toBe("string");
      expect(Array.isArray(c.input.chips)).toBe(true);
      expect(typeof c.input.text).toBe("string");
      expect(["GREEN", "YELLOW", "RED"]).toContain(c.expected.level);
      expect(Array.isArray(c.expected.symptoms)).toBe(true);
      expect(Array.isArray(c.expected.redFlags)).toBe(true);
    }
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const result = triage(c.input, rules);
    expect(result.level).toBe(c.expected.level);
    expect(result.symptoms).toEqual(c.expected.symptoms);
    expect(result.redFlags).toEqual(c.expected.redFlags);
    if (c.expected.decidedBy) expect(result.decidedBy).toBe(c.expected.decidedBy);
  });

  it("repeatable: every case evaluated 100 times gives identical output", () => {
    for (const c of cases) {
      const first = JSON.stringify(triage(c.input, rules));
      for (let i = 0; i < 100; i++) expect(JSON.stringify(triage(c.input, rules))).toBe(first);
    }
  });

  it("never returns GREEN when a case expects a red flag, and RED recall is 100% on the fixture", () => {
    for (const c of cases.filter((x) => x.expected.level === "RED")) {
      expect(triage(c.input, rules).level, c.id).toBe("RED");
    }
  });
});

describe("table coverage by fixtures", () => {
  it("every symptom code, red-flag code and duration rule has a fixture case", () => {
    expect(findUncoveredEntries(rules, cases)).toEqual([]);
  });

  it("names the entry when a fixture line is removed", () => {
    const without = cases.filter((c) => !c.expected.redFlags.includes("confusion"));
    expect(findUncoveredEntries(rules, without)).toContain("red_flag:confusion");
    const noDuration = cases.filter((c) => c.expected.decidedBy !== "duration_rule");
    expect(findUncoveredEntries(rules, noDuration)).toEqual(
      expect.arrayContaining(["duration_rule[0]:nausea_mild", "duration_rule[0]:appetite_loss"]),
    );
  });

  it("names a symptom code added to the table without a fixture", () => {
    const table = JSON.parse(readFileSync(`${RULES_DIR}/triage-table.json`, "utf8"));
    table.symptoms.push({ code: "new_symptom", level: "YELLOW", label_id: "Baru", chip_only: true });
    const extended = { ...rules, table };
    expect(findUncoveredEntries(extended, cases)).toEqual(["symptom:new_symptom"]);
  });
});

describe("every lexicon pattern is exercised", () => {
  const sections = [
    ["symptoms", rules.symptomEntries],
    ["red_flags", rules.redFlagEntries],
  ] as const;

  for (const [section, entries] of sections) {
    for (const entry of entries) {
      it(`${section}.${entry.code}: every phrase and combo matches its code`, () => {
        for (const phrase of entry.any) {
          expect(matchCodes(normalise(phrase), [entry]), `${entry.code}: "${phrase}"`).toEqual([entry.code]);
        }
        if (entry.combo.length > 0) {
          // First term of each group, in either order, in one sentence.
          const terms = entry.combo.map((g) => g[0]);
          expect(matchCodes([terms.join(" ")], [entry])).toEqual([entry.code]);
          expect(matchCodes([[...terms].reverse().join(" ")], [entry])).toEqual([entry.code]);
          // Every term of every group works with the first term of the other groups.
          entry.combo.forEach((group, gi) => {
            for (const term of group) {
              const sentence = entry.combo.map((g, i) => (i === gi ? term : g[0])).join(" ");
              expect(matchCodes([sentence], [entry]), `${entry.code}: "${sentence}"`).toEqual([entry.code]);
            }
          });
        }
      });
    }
  }

  it("every red-flag phrase alone is RED, even in a sentence with negation", () => {
    for (const entry of rules.redFlagEntries) {
      const phrases = [
        ...entry.any,
        ...(entry.combo.length > 0 ? [entry.combo.map((g) => g[0]).join(" ")] : []),
      ];
      for (const p of phrases) {
        expect(triage({ chips: [], text: p }, rules).level, p).toBe("RED");
        expect(triage({ chips: [], text: `tidak ada ${p} kayaknya` }, rules).level, p).toBe("RED");
      }
    }
  });
});
