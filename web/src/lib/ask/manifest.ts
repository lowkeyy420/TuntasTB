import fs from "node:fs";
import path from "node:path";
import { findRulesDir } from "@/lib/triage/loadFiles";
import type { SourceManifest } from "@/lib/reply/sources";

/**
 * The citable sections of the guideline corpus: `corpus/manifest.json` as
 * `id -> { label }`. A missing or unreadable manifest gives an empty one, so
 * no citation is valid and every question abstains.
 */
export function manifestFromJson(raw: unknown): SourceManifest {
  const sections = (raw as { sections?: unknown } | null)?.sections;
  const out: Record<string, { label: string }> = {};
  if (!Array.isArray(sections)) return out;
  for (const s of sections) {
    const { id, label } = (s ?? {}) as { id?: unknown; label?: unknown };
    if (typeof id === "string" && id !== "" && typeof label === "string" && label.trim() !== "") {
      out[id] = { label };
    }
  }
  return out;
}

export function loadCorpusManifest(dir: string = path.resolve(findRulesDir(), "..", "corpus")): SourceManifest {
  try {
    return manifestFromJson(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")));
  } catch {
    return {};
  }
}

let cached: SourceManifest | undefined;

/** Process-wide manifest, read once. */
export function corpusManifest(): SourceManifest {
  cached ??= loadCorpusManifest();
  return cached;
}
