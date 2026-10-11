import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";

/**
 * Defence in depth: even if some future redaction pattern hid a red flag,
 * `redactAndTriage` still returns the level of the raw text. The redactor is
 * replaced here by one that deletes everything, the worst case.
 */
vi.mock("../redaction/redact", () => ({ redact: () => "[ALAMAT]" }));

import { loadRulesFromDir } from "./loadFiles";
import { redactAndTriage } from "./redactTriage";

const rules = loadRulesFromDir(fileURLToPath(new URL("../../../../rules", import.meta.url)));

describe("redactAndTriage with a redactor that hides everything", () => {
  it("still returns RED for a red flag, and the redacted text for storage", () => {
    const out = redactAndTriage({ chips: [], rawText: "rumah di Jalan Mawar mata kuning" }, rules);
    expect(out.redactedText).toBe("[ALAMAT]");
    expect(out.result.level).toBe("RED");
    expect(out.result.redFlags).toEqual(["jaundice"]);
  });
});
