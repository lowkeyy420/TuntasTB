import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds the production client bundle with marker secret values and asserts
 * none of them appear in any file served to the browser (`.next/static`).
 *
 * This performs a full `next build`, so it is gated behind RUN_BUNDLE_TEST=1
 * to keep the default `npm test` fast. CI and the maintainer run it explicitly.
 */

const webRoot = fileURLToPath(new URL("../..", import.meta.url));

const MARKERS = {
  SESSION_SECRET: "MARKER_SESSION_SECRET_zzzzzzzzzzzzzzzzzzzz",
  HASH_PEPPER: "MARKER_HASH_PEPPER_zzzzzzzzzzzzzzzzzzzzzzzz",
  LANGFLOW_API_KEY: "MARKER_LANGFLOW_KEY_zzzzzzzzzzzz",
  INTERNAL_API_TOKEN: "MARKER_INTERNAL_TOKEN_zzzzzzzzzz",
  DATABASE_URL: "postgres://MARKER_DB_USER:MARKER_DB_PASS@localhost:5432/marker",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const run = process.env.RUN_BUNDLE_TEST === "1";

describe.skipIf(!run)("client bundle contains no secrets", () => {
  it("has none of the marker secret values in .next/static", () => {
    execFileSync("npx", ["next", "build"], {
      cwd: webRoot,
      env: {
        ...process.env,
        ...MARKERS,
        APP_BASE_URL: "http://localhost:3000",
      },
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    const staticDir = join(webRoot, ".next", "static");
    const files = walk(staticDir);
    const leaks: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const [name, value] of Object.entries(MARKERS)) {
        if (content.includes(value)) leaks.push(`${name} in ${file}`);
      }
    }
    expect(leaks, `secret leaks: ${leaks.join(", ")}`).toEqual([]);
  }, 300_000);
});
