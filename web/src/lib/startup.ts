import { assertRulesValid } from "@/lib/triage/loadFiles";
import { loadRiskPointsFromDir } from "@/lib/risk/points";

/** Thrown at server start when the rule files cannot be used. */
export class StartupError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "StartupError";
  }
}

/**
 * Fail-fast check of the shared rule data (triage table, lexicon, risk
 * points). The server must not run with a broken table: a wrong level is the
 * one error this product cannot afford. Called from `instrumentation.ts`.
 */
export function assertStartupRules(dir?: string): void {
  try {
    assertRulesValid(dir);
    loadRiskPointsFromDir(dir);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const message = `Cannot start: the rule files in rules/ are invalid (RULES_DIR=${dir ?? process.env.RULES_DIR ?? "auto"}).\n${reason}`;
    console.error(`[startup] ${message}`);
    throw new StartupError(message, e);
  }
}
