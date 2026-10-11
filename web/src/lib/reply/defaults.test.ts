import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateRuleData } from "@/lib/triage/rules";
import { LEVELS } from "@/lib/triage/types";
import { loadManifest } from "./manifestFile";
import { actionFor, composeReply, templateFor } from "./compose";
import { BUILTIN_MANIFEST, defaultCitation, manifestFromJson } from "./sources";
import { checkStatic } from "./filter";
import { forbiddenFromLexicon } from "./forbidden";

/**
 * add-family-reply 2.2: the triage table carries the action/message variants
 * and a default citation per level, and every default citation id exists in
 * corpus/manifest.json.
 */
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const table = JSON.parse(readFileSync(`${ROOT}rules/triage-table.json`, "utf8"));
const lexicon = JSON.parse(readFileSync(`${ROOT}rules/lexicon.id.json`, "utf8"));
const manifest = loadManifest(`${ROOT}corpus`);
const contact = { name: "Demo", phone: "021-555" };

describe("triage-table variants and default citations (2.2)", () => {
  it("validates", () => {
    expect(validateRuleData(table, lexicon)).toEqual([]);
  });

  it("every level's default citation id exists in the manifest", () => {
    for (const level of LEVELS) {
      const id = table.levels[level].citation_id;
      expect(typeof id).toBe("string");
      expect(Object.keys(manifest)).toContain(id);
    }
  });

  it("has the stop-intent, no-symptom and dose-missed variants, and the composer uses them", () => {
    expect(actionFor("YELLOW", table, true)).toBe(table.levels.YELLOW.action_variants.stop_intent);
    expect(templateFor("GREEN", table, { noSymptom: true })).toBe(table.levels.GREEN.message_variants.no_symptom);
    expect(templateFor("GREEN", table, { noSymptom: true, doseMissed: true })).toBe(
      table.levels.GREEN.message_variants.dose_missed,
    );
    const forbidden = forbiddenFromLexicon(lexicon);
    for (const [level, text] of [
      ["YELLOW", table.levels.YELLOW.action_variants.stop_intent],
      ["GREEN", table.levels.GREEN.message_variants.no_symptom],
      ["GREEN", table.levels.GREEN.message_variants.dose_missed],
    ] as const) {
      expect(checkStatic(text, level, forbidden)).toMatchObject({ ok: true });
    }
  });

  it("a static template carries a label from the manifest, preferring the symptom's own section", () => {
    for (const level of LEVELS) {
      const r = composeReply({ level, table, contact, fallbackUsed: true, manifest });
      expect(r.citations).toEqual([{ id: table.levels[level].citation_id, label: manifest[table.levels[level].citation_id].label }]);
    }
    const red = composeReply({ level: "RED", table, contact, fallbackUsed: true, manifest, symptoms: ["jaundice"] });
    expect(red.citations[0].id).toBe("tanda-bahaya#mata-kulit-kuning");
    const yellow = composeReply({ level: "YELLOW", table, contact, fallbackUsed: true, manifest, symptoms: ["nausea_mild"] });
    expect(yellow.citations[0].id).toBe("efek-samping-perlu-perawat#mual-lama");
  });

  it("rejects malformed variants and citation ids", () => {
    const bad = structuredClone(table);
    bad.levels.GREEN.citation_id = 5;
    bad.levels.YELLOW.action_variants = { stop_intent: "" };
    bad.levels.RED.message_variants = "x";
    expect(validateRuleData(bad, lexicon)).toEqual([
      "triage-table.levels.GREEN.citation_id: harus teks",
      "triage-table.levels.YELLOW.action_variants: harus objek berisi teks",
      "triage-table.levels.RED.message_variants: harus objek berisi teks",
    ]);
  });
});

describe("sources", () => {
  it("manifestFromJson keeps sections with an id and a label", () => {
    expect(
      manifestFromJson({
        sections: [{ id: "a#b", label: "L", codes: ["x", 1] }, { id: "c#d" }, { id: "e#f", label: "" }, null],
      }),
    ).toEqual({ "a#b": { label: "L", codes: ["x"] } });
    expect(manifestFromJson({})).toEqual({});
    expect(manifestFromJson({ sections: [{ id: "a#b", label: "L" }] })).toEqual({ "a#b": { label: "L", codes: [] } });
  });

  it("defaultCitation falls back to the built-in ids", () => {
    expect(defaultCitation("GREEN")).toEqual({
      id: "efek-samping-ringan#umum",
      label: BUILTIN_MANIFEST["efek-samping-ringan#umum"].label,
    });
    expect(defaultCitation("RED", { "x#y": { label: "X" } }, { tableId: "missing#id" }).id).toBe("tanda-bahaya#umum");
  });

  it("loadManifest falls back to the built-in set when the file is absent", () => {
    expect(loadManifest(`${ROOT}does-not-exist`)).toBe(BUILTIN_MANIFEST);
  });
});
