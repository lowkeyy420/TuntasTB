import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { flowInputSchema, flowOutputSchema, parseFlowOutput } from "./flowSchema";

/**
 * add-symptom-extraction 4.1 (zod schema) and 4.2 (agreement with the JSON
 * Schema). The samples file is shared with langflow/tests/test_flow_samples.py,
 * which asserts the same `valid` flags against checkin_triage.schema.json.
 */
const FLOWS = fileURLToPath(new URL("../../../../langflow/flows", import.meta.url));
const samples = JSON.parse(readFileSync(`${FLOWS}/checkin_triage.samples.json`, "utf8"));

type Path = (string | number)[];
interface Sample {
  id: string;
  valid: boolean;
  set?: [Path, unknown][];
  delete?: Path[];
}

/** Same edit language as the Python test; "@<n>" is a string of n characters. */
function build(base: unknown, sample: Sample): unknown {
  const obj = structuredClone(base) as Record<string | number, unknown>;
  const walk = (path: Path) => {
    let cur = obj as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) cur = cur[key] as Record<string | number, unknown>;
    return cur;
  };
  for (const [path, raw] of sample.set ?? []) {
    const value = typeof raw === "string" && /^@\d+$/.test(raw) ? "x".repeat(Number(raw.slice(1))) : raw;
    walk(path)[path[path.length - 1]] = value;
  }
  for (const path of sample.delete ?? []) delete walk(path)[path[path.length - 1]];
  return obj;
}

describe("flow output zod schema agrees with the JSON Schema samples (4.2)", () => {
  it.each((samples.output as Sample[]).map((s) => [s.id, s] as const))("output %s", (_id, s) => {
    expect(flowOutputSchema.safeParse(build(samples.base_output, s)).success).toBe(s.valid);
  });
  it.each((samples.input as Sample[]).map((s) => [s.id, s] as const))("input %s", (_id, s) => {
    expect(flowInputSchema.safeParse(build(samples.base_input, s)).success).toBe(s.valid);
  });
});

describe("parseFlowOutput (4.1)", () => {
  const valid = samples.base_output;

  it("accepts a valid object", () => {
    expect(parseFlowOutput(JSON.stringify(valid))).toEqual(valid);
  });
  it("rejects text that is not JSON", () => {
    expect(parseFlowOutput("Maaf, saya tidak bisa membantu.")).toBeNull();
    expect(parseFlowOutput("")).toBeNull();
  });
  it("rejects a missing field", () => {
    const { extracted: _drop, ...rest } = valid;
    void _drop;
    expect(parseFlowOutput(JSON.stringify(rest))).toBeNull();
  });
  it("rejects a wrong type", () => {
    expect(parseFlowOutput(JSON.stringify({ ...valid, reasons: "red_flag_keyword:jaundice" }))).toBeNull();
  });
  it('rejects level "SAFE"', () => {
    expect(parseFlowOutput(JSON.stringify({ ...valid, level: "SAFE" }))).toBeNull();
  });
  it("rejects a JSON value that is not an object", () => {
    expect(parseFlowOutput("[]")).toBeNull();
    expect(parseFlowOutput("null")).toBeNull();
  });
});
