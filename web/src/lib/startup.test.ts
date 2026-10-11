import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertStartupRules, StartupError } from "./startup";
import { register } from "@/instrumentation";

const REAL = fileURLToPath(new URL("../../../rules", import.meta.url));

function copyRules(mutate?: (dir: string) => void): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuntas-rules-"));
  for (const f of ["triage-table.json", "lexicon.id.json", "risk-points.json"]) {
    fs.copyFileSync(path.join(REAL, f), path.join(dir, f));
  }
  mutate?.(dir);
  return dir;
}

const dirs: string[] = [];
const rulesCopy = (mutate?: (dir: string) => void) => {
  const d = copyRules(mutate);
  dirs.push(d);
  return d;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("start-up rule check (add-triage-rules 6.1)", () => {
  it("accepts the real rule files", () => {
    expect(() => assertStartupRules(REAL)).not.toThrow();
  });

  it("stops with a clear error on a corrupted triage table", () => {
    const dir = rulesCopy((d) => {
      const file = path.join(d, "triage-table.json");
      const table = JSON.parse(fs.readFileSync(file, "utf8"));
      table.symptoms[0].level = "PURPLE";
      fs.writeFileSync(file, JSON.stringify(table));
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => assertStartupRules(dir)).toThrow(StartupError);
    expect(() => assertStartupRules(dir)).toThrow(/Cannot start: the rule files in rules\/ are invalid/);
    expect(log).toHaveBeenCalled();
  });

  it("stops on a file that is not JSON", () => {
    const dir = rulesCopy((d) => fs.writeFileSync(path.join(d, "lexicon.id.json"), "{not json"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => assertStartupRules(dir)).toThrow(StartupError);
  });

  it("stops on broken risk points", () => {
    const dir = rulesCopy((d) => fs.writeFileSync(path.join(d, "risk-points.json"), "{}"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => assertStartupRules(dir)).toThrow(/risk-points/);
  });

  it("names the rules directory in the message", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("RULES_DIR", "/definitely/not/here");
    expect(() => assertStartupRules()).toThrow(/RULES_DIR=\/definitely\/not\/here/);
  });

  it("register() checks the rules on the Node runtime and does nothing on the edge", async () => {
    vi.stubEnv("RULES_DIR", rulesCopy((d) => fs.writeFileSync(path.join(d, "triage-table.json"), "[]")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await expect(register()).resolves.toBeUndefined();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await expect(register()).rejects.toThrow(StartupError);
  });

  it("register() passes with the real rule files", async () => {
    vi.stubEnv("RULES_DIR", REAL);
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await expect(register()).resolves.toBeUndefined();
  });
});
