import type { Level } from "@/lib/triage/types";

/**
 * Citable sections. In production the manifest is `corpus/manifest.json`
 * (generated from the curated corpus). Until that corpus ships, the reply
 * layer uses this built-in set: one neutral label per level for the static
 * templates. The ids follow the corpus document names so a real manifest can
 * replace this map without touching the filter or the composer.
 *
 * Labels are shown to families, so they never name the illness.
 */
export interface SourceEntry {
  label: string;
  /** Symptom codes the section is about (from the corpus `<!-- codes: -->` line). */
  codes?: readonly string[];
}

export type SourceManifest = Readonly<Record<string, SourceEntry>>;

export interface Citation {
  id: string;
  label: string;
}

export const BUILTIN_MANIFEST: SourceManifest = {
  "efek-samping-ringan#umum": { label: "Panduan efek samping obat, bagian keluhan ringan" },
  "efek-samping-perlu-perawat#umum": {
    label: "Panduan efek samping obat, bagian keluhan yang perlu perawat",
  },
  "tanda-bahaya#umum": { label: "Panduan efek samping obat, bagian tanda bahaya" },
};

/** The citation shown with the static template of each level. */
export const DEFAULT_CITATION_ID: Record<Level, string> = {
  GREEN: "efek-samping-ringan#umum",
  YELLOW: "efek-samping-perlu-perawat#umum",
  RED: "tanda-bahaya#umum",
};

export function defaultCitation(
  level: Level,
  manifest: SourceManifest = BUILTIN_MANIFEST,
  opts: { tableId?: string; symptoms?: readonly string[] } = {},
): Citation {
  // 1. A section of the level's own document about one of the check-in's symptoms.
  const doc = LEVEL_DOC[level];
  for (const code of opts.symptoms ?? []) {
    const hit = Object.entries(manifest).find(([id, e]) => id.startsWith(`${doc}#`) && e.codes?.includes(code));
    if (hit) return { id: hit[0], label: hit[1].label };
  }
  // 2. The level's default from the triage table, 3. the built-in id.
  for (const id of [opts.tableId, DEFAULT_CITATION_ID[level]]) {
    if (id && manifest[id]) return { id, label: manifest[id].label };
  }
  const id = DEFAULT_CITATION_ID[level];
  return { id, label: BUILTIN_MANIFEST[id].label };
}

/** The corpus document whose sections back each level's static template. */
const LEVEL_DOC: Record<Level, string> = {
  GREEN: "efek-samping-ringan",
  YELLOW: "efek-samping-perlu-perawat",
  RED: "tanda-bahaya",
};

/** `corpus/manifest.json` (`{ sections: [{ id, label, codes }] }`) as a manifest. */
export function manifestFromJson(json: unknown): SourceManifest {
  const sections = (json as { sections?: unknown })?.sections;
  const out: Record<string, SourceEntry> = {};
  if (!Array.isArray(sections)) return out;
  for (const s of sections as { id?: unknown; label?: unknown; codes?: unknown }[]) {
    if (typeof s?.id !== "string" || typeof s.label !== "string" || s.label === "") continue;
    const codes = Array.isArray(s.codes) ? s.codes.filter((c): c is string => typeof c === "string") : [];
    out[s.id] = { label: s.label, codes };
  }
  return out;
}
