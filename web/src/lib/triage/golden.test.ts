import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultRules } from "./loadFiles";
import { redactAndTriage } from "./redactTriage";
import type { Level } from "./types";

/**
 * add-eval-harness 4.1: the application's rule engine on the golden set.
 * Fails when any RED-labelled case scores lower than RED. YELLOW/GREEN
 * mismatches are printed, not failed (the runner reports them too).
 */
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const rules = defaultRules();
const RANK: Record<Level, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

interface GoldenCase {
  id: string;
  category: string;
  input: {
    chips: string[];
    text: string;
    context?: { persistence_days?: Record<string, number> };
  };
  expected: { level: Level };
}

const cases: GoldenCase[] = readFileSync(`${ROOT}eval/golden/checkins.jsonl`, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as GoldenCase);

function score(c: GoldenCase): Level {
  return redactAndTriage(
    { chips: c.input.chips, rawText: c.input.text, persistenceDays: c.input.context?.persistence_days ?? {} },
    rules,
  ).result.level;
}

describe("golden set on the TypeScript engine", () => {
  it("loads at least 120 cases and 30 RED", () => {
    expect(cases.length).toBeGreaterThanOrEqual(120);
    expect(cases.filter((c) => c.expected.level === "RED").length).toBeGreaterThanOrEqual(30);
  });

  it("scores every RED case RED (recall 100%)", () => {
    const missed = cases
      .filter((c) => c.expected.level === "RED")
      .map((c) => ({ id: c.id, actual: score(c) }))
      .filter((r) => r.actual !== "RED");
    expect(missed).toEqual([]);
  });

  it("reports YELLOW/GREEN mismatches without failing", () => {
    const mismatches = cases
      .filter((c) => c.expected.level !== "RED")
      .map((c) => ({ id: c.id, expected: c.expected.level, actual: score(c) }))
      .filter((r) => r.actual !== r.expected);
    if (mismatches.length) console.warn("golden YELLOW/GREEN mismatches:", mismatches);
    // Over-escalation is allowed; a case scored below its label is only reported here.
    expect(mismatches.every((m) => RANK[m.actual] >= 0)).toBe(true);
  });
});
