import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lexiconProtectedTerms } from "@/lib/triage/protectedTerms";
import { redact } from "./redact";

/**
 * add-eval-harness 5.5: the eval harness's Python port of `redact` must give
 * the same output. Same fixture in eval/tests/test_eval_scoring.py.
 * `protected: "lexicon"` = protectedTerms from rules/lexicon.id.json.
 */
const RULES_DIR = fileURLToPath(new URL("../../../../rules", import.meta.url));
const lexicon = JSON.parse(readFileSync(`${RULES_DIR}/lexicon.id.json`, "utf8"));
const terms = lexiconProtectedTerms(lexicon);

interface Row {
  id: string;
  text: string;
  protected: "lexicon";
  expected: string;
}

const rows: Row[] = readFileSync(`${RULES_DIR}/fixtures/redaction-parity.jsonl`, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Row);

describe("redaction-parity fixture (shared with the Python eval harness)", () => {
  it("has rows", () => expect(rows.length).toBeGreaterThan(10));

  it.each(rows.map((r) => [r.id, r] as const))("%s", (_id, row) => {
    expect(row.protected).toBe("lexicon");
    expect(redact(row.text, { protectedTerms: terms })).toBe(row.expected);
  });
});
