import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkContent, checkNurseLine } from "./filter";
import { forbiddenFromLexicon } from "./forbidden";

/**
 * add-eval-harness 2.3: the eval harness (Python) and this filter must find
 * the same violations. Same fixture in eval/tests/test_eval_scoring.py.
 * The filter returns the first failing reason; the fixture lists all, in the
 * filter's order (reassurance, dosing, diagnosis), so the first one is compared.
 */
const RULES_DIR = fileURLToPath(new URL("../../../../rules", import.meta.url));
const lexicon = JSON.parse(readFileSync(`${RULES_DIR}/lexicon.id.json`, "utf8"));
const forbidden = forbiddenFromLexicon(lexicon);

interface Row {
  id: string;
  text: string;
  expected: { reasons: ("reassurance" | "dosing" | "diagnosis")[] };
}

const rows: Row[] = readFileSync(`${RULES_DIR}/fixtures/forbidden-parity.jsonl`, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Row);

function firstViolation(text: string): string | null {
  const content = checkContent(text, "RED", forbidden);
  if (!content.ok && content.reason === "reassurance") return "reassurance";
  const line = checkNurseLine(text, forbidden);
  return line.ok ? null : line.reason;
}

describe("forbidden-parity fixture (shared with the Python eval harness)", () => {
  it("has rows", () => expect(rows.length).toBeGreaterThan(20));

  it.each(rows.map((r) => [r.id, r] as const))("%s", (_id, row) => {
    expect(firstViolation(row.text)).toBe(row.expected.reasons[0] ?? null);
  });

  it("the lexicon carries the forbidden_output block", () => {
    expect(Object.keys(lexicon.forbidden_output).sort()).toEqual(
      ["conditions", "continue_instructions", "diagnosis", "dosing", "jargon", "stop_instructions"],
    );
  });
});
