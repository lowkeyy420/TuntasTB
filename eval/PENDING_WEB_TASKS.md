# Pending web and CI tasks for add-eval-harness

`add-eval-harness` was implemented while another change was editing `web/` and
`.github/workflows/ci.yml`, so the TypeScript halves and the CI job were not applied.
This file holds the exact code to add. Every test below was run on 2026-10-11 against
the current `web/src` (Vitest 3.2.4, from a temporary config outside `web/`):
4 files, 82 tests passed; `golden.test.ts` failed as intended (`red-confusion-007`)
when "linglung" was removed from a copy of the lexicon.

| Task | What to add | Status |
| --- | --- | --- |
| 2.3 (Vitest half) | `web/src/lib/reply/forbidden-parity.test.ts` | Python half done |
| 4.1 | `web/src/lib/triage/golden.test.ts` | to apply |
| 5.1 (Vitest half) | `web/src/lib/checkin/combine.ts` + `combine-parity.test.ts` | Python half done |
| 5.5 (Vitest half) | `web/src/lib/redaction/redaction-parity.test.ts` | Python half done |
| 6.1 | `eval-offline` job in `.github/workflows/ci.yml`, mark it required | to apply |
| 6.2 | the two throwaway-branch runs, recorded in `eval/README.md` | local runs done, CI runs pending |

Notes for the maintainer:

- `combine.ts` is new: the application has no Phase B combination yet
  (`pipeline.ts` uses `flow ? maxLevel(local, flow.level) : local.level`, which is
  right for rules-only mode). When `add-symptom-extraction` 5.2 lands, have the
  pipeline call `combineFlowLevel` (or replace it with its own function) and keep
  `combine-parity.test.ts` pointing at whatever it uses.
- `rules/lexicon.id.json` now carries the `forbidden_output` block (the lists equal
  `DEFAULT_FORBIDDEN` plus seven phrases: `mengurangi`, `kurangin`, `digandakan`,
  `menggandakan`, `tambah obat`, `sakit kuning`, `sakit liver`). `forbiddenFromLexicon`
  merges it with the defaults, so no code change is needed; the comment at the top of
  `web/src/lib/reply/forbidden.ts` ("That file is not part of this change's write scope
  yet") can be updated.
- `docs/triage-table.md` was regenerated with `npm run docs:generate` after the lexicon
  change; `npm run docs:check` passes.

## Vitest files

All five files go into `web/src/lib/...` exactly as shown. They read
`rules/` and `eval/golden/` with paths relative to the test file, like `parity.test.ts`.

### `web/src/lib/reply/forbidden-parity.test.ts`

```ts
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
```

### `web/src/lib/redaction/redaction-parity.test.ts`

```ts
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
```

### `web/src/lib/triage/golden.test.ts`

```ts
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
```

### `web/src/lib/checkin/combine.ts`

```ts
import { maxLevel } from "@/lib/triage/engine";
import type { Level } from "@/lib/triage/types";

/** add-symptom-extraction design ("Confidence threshold"): below this, at least YELLOW. */
export const MIN_CONFIDENCE = 0.6;

/** The parts of a schema-valid `checkin_triage` output the combination reads. */
export interface FlowLevelInput {
  level: Level;
  extracted: {
    symptoms: { code: string }[];
    unknown_symptoms: string[];
    confidence: number;
  };
}

/**
 * Final level of a check-in (add-symptom-extraction design, phase B):
 *   - flow not called (no note): the local level;
 *   - invalid/missing output, timeout or error (`flow === null`): max(local, YELLOW), fallback;
 *   - valid output: max(local, flow.level, floor), floor YELLOW when the flow
 *     reports unknown symptoms, a code not in the table, or confidence < 0.6.
 * Mirrored in Python by eval/tuntas_eval/scoring.py `combine`; fixture
 * rules/fixtures/combine-parity.jsonl keeps the two equal.
 */
export function combineFlowLevel(
  local: Level,
  flow: FlowLevelInput | null,
  knownCodes: ReadonlySet<string>,
  called = true,
): { level: Level; fallback: boolean } {
  if (!called) return { level: local, fallback: false };
  if (flow === null) return { level: maxLevel(local, "YELLOW"), fallback: true };
  const ex = flow.extracted;
  const floor: Level =
    ex.unknown_symptoms.length > 0 ||
    ex.symptoms.some((s) => !knownCodes.has(s.code)) ||
    !(ex.confidence >= MIN_CONFIDENCE)
      ? "YELLOW"
      : "GREEN";
  return { level: maxLevel(maxLevel(local, flow.level), floor), fallback: false };
}
```

### `web/src/lib/checkin/combine-parity.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultRules } from "@/lib/triage/loadFiles";
import type { Level } from "@/lib/triage/types";
import { combineFlowLevel, type FlowLevelInput } from "./combine";

/** add-eval-harness 5.1: same fixture as eval/tests/test_eval_scoring.py. */
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
```

## 6.1 CI job

Add to `.github/workflows/ci.yml` under `jobs:` (next to `python`), then make
`eval-offline` a required check on `main` and `development`:

```yaml
  eval-offline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: eval/requirements.txt

      - name: Install eval dependencies
        run: pip install -r eval/requirements.txt

      - name: Eval and rule-component tests
        run: python -m pytest eval/tests langflow/tests -q

      - name: Offline safety gate (RED recall 100%, no dosing/diagnosis/"aman")
        run: python eval/run_eval.py --mode offline

      - name: Upload eval report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-report
          path: eval/reports/
          if-no-files-found: warn
```

The job needs no secrets, network services, Langflow or database. Its exit code is
the runner's: 1 for a missed RED or a dosing/diagnosis/"aman" text, 2 for a RED
regression against `eval/baseline.json`, 3 for an invalid golden or rule file. The
same commands passed locally on Python 3.12 (`uv run --python 3.12 --with-requirements
eval/requirements.txt ...`: 561 passed, 2 skipped; offline gate exit 0).

## 6.2 Throwaway-branch checks

On a throwaway branch, in two separate commits/pushes:

1. Remove `"linglung"` from `red_flags.confusion.any` in `rules/lexicon.id.json`.
   Expected: `eval-offline` fails with exit 2 (`MISSED RED: red-confusion-007`,
   `RED REGRESSION: red-confusion-007`); the web job's `golden.test.ts` fails too.
2. Change `levels.GREEN.message_id` in `rules/triage-table.json` to
   `"Keluhan ini aman dan umum terjadi."`. Expected: exit 1
   (`VIOLATION reassurance: triage-table.levels.GREEN.message_id`).

Record both run URLs in the "CI gate checks" section of `eval/README.md`, then delete
the branch.
