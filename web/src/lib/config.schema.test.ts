import { describe, it, expect } from "vitest";
import { parseConfig, ConfigError, CONFIG_KEYS } from "./config.schema";

const validEnv: Record<string, string | undefined> = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  SESSION_SECRET: "a".repeat(48),
  HASH_PEPPER: "b".repeat(48),
  APP_BASE_URL: "http://localhost:3000",
};

describe("parseConfig", () => {
  it("parses a valid environment", () => {
    const cfg = parseConfig(validEnv);
    expect(cfg.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(cfg.LANGFLOW_BASE_URL).toBe("http://host.docker.internal:7860");
    expect(cfg.LANGFLOW_TIMEOUT_MS).toBe(15000);
  });

  it("throws naming SESSION_SECRET when it is missing", () => {
    const { SESSION_SECRET: _omit, ...env } = validEnv;
    void _omit;
    expect(() => parseConfig(env)).toThrow(ConfigError);
    try {
      parseConfig(env);
    } catch (e) {
      expect((e as Error).message).toContain("SESSION_SECRET");
    }
  });

  it("rejects a too-short SESSION_SECRET", () => {
    expect(() =>
      parseConfig({ ...validEnv, SESSION_SECRET: "short" }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("runs in rules-only mode when LANGFLOW_API_KEY is absent", () => {
    const cfg = parseConfig(validEnv);
    expect(cfg.LANGFLOW_API_KEY).toBeUndefined();
    expect(cfg.rulesOnly).toBe(true);
  });

  it("is not rules-only when a Langflow API key is present", () => {
    const cfg = parseConfig({ ...validEnv, LANGFLOW_API_KEY: "key-123" });
    expect(cfg.rulesOnly).toBe(false);
  });

  it("never includes a secret value in the error message", () => {
    const env = { ...validEnv, APP_BASE_URL: "not-a-url" };
    try {
      parseConfig(env);
    } catch (e) {
      expect((e as Error).message).not.toContain(validEnv.SESSION_SECRET);
      expect((e as Error).message).not.toContain(validEnv.HASH_PEPPER);
    }
  });

  it("exposes every config key for .env.example parity", () => {
    expect(CONFIG_KEYS).toContain("DATABASE_URL");
    expect(CONFIG_KEYS).toContain("LANGFLOW_API_KEY");
    expect(CONFIG_KEYS.length).toBeGreaterThanOrEqual(10);
  });
});
