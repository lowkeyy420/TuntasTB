import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CONFIG_KEYS } from "./config.schema";

// .env.example lives at the repository root, one level above web/.
const envExamplePath = fileURLToPath(
  new URL("../../../.env.example", import.meta.url),
);

function readEnvExampleKeys(): Set<string> {
  const text = readFileSync(envExamplePath, "utf8");
  const keys = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    keys.add(trimmed.slice(0, eq).trim());
  }
  return keys;
}

describe(".env.example parity", () => {
  it("documents every configuration key", () => {
    const documented = readEnvExampleKeys();
    const missing = CONFIG_KEYS.filter((k) => !documented.has(k));
    expect(missing, `missing from .env.example: ${missing.join(", ")}`).toEqual(
      [],
    );
  });
});
