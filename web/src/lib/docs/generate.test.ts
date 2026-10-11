import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRiskPointsFromDir } from "@/lib/risk/points";
import { loadRulesFromDir } from "@/lib/triage/loadFiles";
import { generateRiskScoreDoc, generateTriageTableDoc } from "./generate";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const RULES = path.join(ROOT, "rules");
const rules = loadRulesFromDir(RULES);
const points = loadRiskPointsFromDir(RULES);
const read = (name: string) => fs.readFileSync(path.join(ROOT, "docs", name), "utf8");

describe("generated docs (add-triage-rules 6.3, add-dropout-risk-score 6.1)", () => {
  it("docs/triage-table.md matches the generator output", () => {
    expect(read("triage-table.md")).toBe(generateTriageTableDoc(rules.table, rules.lexicon));
  });

  it("docs/risk-score.md matches the generator output", () => {
    expect(read("risk-score.md")).toBe(generateRiskScoreDoc(points));
  });

  it("the triage document lists every symptom code, red flag and the review status", () => {
    const doc = generateTriageTableDoc(rules.table, rules.lexicon);
    for (const s of rules.table.symptoms) expect(doc).toContain(`| ${s.code} |`);
    for (const code of Object.keys(rules.lexicon.red_flags)) expect(doc).toContain(`| ${code} |`);
    expect(doc).toContain(rules.table.review_status);
    expect(doc).toContain(rules.table.fallback_warning_id);
  });

  it("the risk document lists every factor and the demo example scores 8, high", () => {
    const doc = generateRiskScoreDoc(points);
    for (const id of Object.keys(points.factors)) expect(doc).toContain(`| ${id} |`);
    expect(doc).toMatch(/Contoh demo: hari ke-41[\s\S]*Skor \*\*8\*\*, pita \*\*Tinggi\*\*/);
    expect(doc).toContain("0 sampai 3");
    expect(doc).toContain("8 atau lebih");
  });

  it("is deterministic and escapes table cells", () => {
    expect(generateRiskScoreDoc(points)).toBe(generateRiskScoreDoc(points));
    const table = {
      ...rules.table,
      symptoms: [{ code: "x", level: "GREEN" as const, label_id: "a | b\nc", chip_only: true }],
      duration_rules: [],
    };
    const doc = generateTriageTableDoc(table, { ...rules.lexicon, watch_words: [] });
    expect(doc).toContain("a \\| b c");
    expect(doc).toContain("hanya pilihan di layar");
    expect(doc).toContain("Tidak ada aturan lama keluhan.");
    expect(doc).not.toContain("Kata pemantau");
  });
});
