import fs from "node:fs";
import path from "node:path";
import { findRulesDir } from "@/lib/triage/loadFiles";

/**
 * Review status of the guideline corpus (`corpus/manifest.json`), shown in the
 * nurse console footer. Null when the manifest is not present (for example in
 * an image built without it) or has no status.
 */
export function corpusReviewStatus(dir: string = path.resolve(findRulesDir(), "..", "corpus")): string | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as {
      review_status?: unknown;
    };
    return typeof manifest.review_status === "string" ? manifest.review_status : null;
  } catch {
    return null;
  }
}
