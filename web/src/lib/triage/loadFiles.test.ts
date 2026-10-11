import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRulesValid, defaultRules, findRulesDir, loadRulesFromDir, readRuleJson } from "./loadFiles";
import { RulesValidationError } from "./rules";

const REAL = fileURLToPath(new URL("../../../../rules", import.meta.url));
const temps: string[] = [];

function tempRulesDir(mutate?: (table: Record<string, unknown>) => void): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rules-"));
  temps.push(dir);
  const table = JSON.parse(readFileSync(`${REAL}/triage-table.json`, "utf8"));
  mutate?.(table);
  writeFileSync(`${dir}/triage-table.json`, JSON.stringify(table));
  writeFileSync(`${dir}/lexicon.id.json`, readFileSync(`${REAL}/lexicon.id.json`));
  return dir;
}

afterEach(() => {
  delete process.env.RULES_DIR;
  while (temps.length > 0) rmSync(temps.pop() as string, { recursive: true, force: true });
});

describe("rule file loading", () => {
  it("finds the rules directory by walking up from the cwd", () => {
    expect(path.resolve(findRulesDir())).toBe(path.resolve(REAL));
    expect(path.resolve(findRulesDir(path.join(REAL, "fixtures")))).toBe(path.resolve(REAL));
  });

  it("honours RULES_DIR", () => {
    process.env.RULES_DIR = "/somewhere/else";
    expect(findRulesDir()).toBe("/somewhere/else");
  });

  it("fails clearly when no rules directory exists", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "norules-"));
    temps.push(empty);
    expect(() => findRulesDir(empty)).toThrow(/RULES_DIR/);
  });

  it("reads JSON and loads the default rules once", () => {
    expect((readRuleJson(REAL, "triage-table.json") as { version: string }).version).toBe("0.1.0-draft");
    expect(defaultRules()).toBe(defaultRules());
  });

  it("table edited: a changed level takes effect without any code change", () => {
    const dir = tempRulesDir((t) => {
      const symptoms = t.symptoms as { code: string; level: string }[];
      symptoms.find((s) => s.code === "urine_orange")!.level = "YELLOW";
    });
    const rules = loadRulesFromDir(dir);
    expect(rules.levelByCode.get("urine_orange")).toBe("YELLOW");
  });

  it("start-up check: a corrupted table stops with RulesValidationError", () => {
    const dir = tempRulesDir((t) => {
      t.unknown_level = "GREEN";
    });
    expect(() => assertRulesValid(dir)).toThrow(RulesValidationError);
  });

  it("start-up check passes for the shipped files", () => {
    expect(() => assertRulesValid(REAL)).not.toThrow();
  });

  it("start-up check fails on unparsable JSON", () => {
    const dir = tempRulesDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/triage-table.json`, "{ not json");
    expect(() => assertRulesValid(dir)).toThrow(SyntaxError);
  });
});
