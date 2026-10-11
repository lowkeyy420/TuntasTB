import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultRules } from "@/lib/triage/loadFiles";
import type { Level } from "@/lib/triage/types";
import { combineFlowLevel, type FlowLevelInput } from "./combine";

/**
 * add-eval-harness 5.1: same fixture as eval/tests/test_eval_scoring.py.
 * `combineFlowLevel` is the function the check-in pipeline (phase B) uses.
 */
const RULES_DIR = fileURLToPath(new URL("../../../../rules", import.meta.url));
const known = new Set(defaultRules().table.symptoms.map((s) => s.code));

interface Row {
  id: string;
  local: Level;
  called: boolean;
  flow: FlowLevelInput | null;
  expected: { level: Level; fallback: boolean };
}

const rows: Row[] = readFileSync(`${RULES_DIR}/fixtures/combine-parity.jsonl`, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Row);

describe("combine-parity fixture (shared with the Python eval harness)", () => {
  it("has rows", () => expect(rows.length).toBeGreaterThan(10));

  it.each(rows.map((r) => [r.id, r] as const))("%s", (_id, row) => {
    expect(combineFlowLevel(row.local, row.flow, known, row.called)).toEqual(row.expected);
  });
});
