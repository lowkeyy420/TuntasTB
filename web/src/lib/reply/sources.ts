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

export function defaultCitation(level: Level, manifest: SourceManifest = BUILTIN_MANIFEST): Citation {
  const id = DEFAULT_CITATION_ID[level];
  return { id, label: (manifest[id] ?? BUILTIN_MANIFEST[id]).label };
}
