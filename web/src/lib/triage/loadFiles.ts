import fs from "node:fs";
import path from "node:path";
import { loadRules } from "./rules";
import type { Rules } from "./types";

/**
 * File access for the rule data. Kept apart from the engine so the engine
 * stays free of I/O. Directory: `RULES_DIR`, else the nearest `rules/`
 * directory (containing triage-table.json) found walking up from the cwd.
 */
export function findRulesDir(start: string = process.cwd()): string {
  const fromEnv = process.env.RULES_DIR;
  if (fromEnv) return fromEnv;
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, "rules");
    if (fs.existsSync(path.join(candidate, "triage-table.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("rules/triage-table.json not found; set RULES_DIR");
    }
    dir = parent;
  }
}

export function readRuleJson(dir: string, file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
}

/** Reads, validates and compiles `triage-table.json` and `lexicon.id.json`. */
export function loadRulesFromDir(dir: string = findRulesDir()): Rules {
  return loadRules(readRuleJson(dir, "triage-table.json"), readRuleJson(dir, "lexicon.id.json"));
}

let cached: Rules | undefined;

/** Process-wide rules, loaded once. Throws when the files are invalid (use at start-up). */
export function defaultRules(): Rules {
  cached ??= loadRulesFromDir();
  return cached;
}

/** Start-up check: throws `RulesValidationError` when the rule files are broken. */
export function assertRulesValid(dir?: string): void {
  loadRulesFromDir(dir);
}
