import fs from "node:fs";
import path from "node:path";
import { findRulesDir } from "@/lib/triage/loadFiles";
import { BUILTIN_MANIFEST, manifestFromJson, type SourceManifest } from "./sources";

/**
 * Server side: the citable sections of `corpus/manifest.json` (next to
 * `rules/`, as in the Docker image). Falls back to the built-in set when the
 * file is absent, so a reply always has a source label.
 */
let cached: SourceManifest | undefined;

export function loadManifest(dir: string = path.resolve(findRulesDir(), "..", "corpus")): SourceManifest {
  try {
    const manifest = manifestFromJson(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")));
    return Object.keys(manifest).length > 0 ? manifest : BUILTIN_MANIFEST;
  } catch {
    return BUILTIN_MANIFEST;
  }
}

export function defaultManifest(): SourceManifest {
  cached ??= loadManifest();
  return cached;
}
