import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { redact } from "../redaction/redact";
import { maxLevel, triage } from "./engine";
import { loadRulesFromDir } from "./loadFiles";
import { lexiconProtectedTerms } from "./protectedTerms";
import { redactAndTriage } from "./redactTriage";
import type { Level, TriageInput } from "./types";

const RULES_DIR = fileURLToPath(new URL("../../../../rules", import.meta.url));
const rules = loadRulesFromDir(RULES_DIR);
const protectedTerms = lexiconProtectedTerms(rules.lexicon);
const rank: Record<Level, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function allKeywords(): string[] {
  const lex = rules.lexicon;
  const entries = [...Object.values(lex.symptoms), ...Object.values(lex.red_flags)];
  return [
    ...new Set([
      ...entries.flatMap((e) => [...(e.any ?? []), ...(e.combo ?? []).flat()]),
      ...(lex.watch_words ?? []),
      ...lex.stop_intent,
      ...lex.stigma,
    ]),
  ];
}

describe("protectedTerms helper", () => {
  it("contains whole phrases and their single words, lower-cased and sorted", () => {
    expect(protectedTerms).toContain("kencing merah");
    expect(protectedTerms).toContain("kencing");
    expect(protectedTerms).toContain("takut ketahuan");
    expect(protectedTerms).toEqual([...protectedTerms].sort());
  });

  it("covers an empty lexicon section gracefully", () => {
    const terms = lexiconProtectedTerms({
      version: "x",
      symptoms: { a: { any: ["Mual"] } },
      red_flags: { b: { combo: [["mata"], ["kuning"]] } },
      durations: [],
      stop_intent: ["sudah sembuh"],
      stigma: ["malu"],
    });
    expect(terms).toEqual(["kuning", "mata", "mual", "malu", "sembuh", "sudah", "sudah sembuh"].sort());
  });
});

describe("Lexicon terms survive redaction", () => {
  const keywords = allKeywords();

  it("has a meaningful number of keywords", () => {
    expect(keywords.length).toBeGreaterThan(150);
  });

  it("every keyword is still present after redacting a sentence that contains it", () => {
    for (const kw of keywords) {
      for (const sentence of [`hari ini ${kw}, tolong`, `saya ${capitalise(kw)} sejak kemarin`, kw]) {
        const redacted = redact(sentence, { protectedTerms });
        expect(redacted, `keyword "${kw}"`).toBe(sentence);
      }
    }
  });

  it("every red-flag keyword stays RED after redaction", () => {
    for (const entry of rules.redFlagEntries) {
      for (const phrase of entry.any) {
        const redacted = redact(`saya ${capitalise(phrase)}`, { protectedTerms });
        expect(triage({ chips: [], text: redacted }, rules).level, phrase).toBe("RED");
      }
    }
  });
});

describe("Redaction does not lower triage", () => {
  const cases = readFileSync(`${RULES_DIR}/fixtures/parity.jsonl`, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { id: string; input: TriageInput });

  const injections: [string, (t: string) => string][] = [
    ["phone", (t) => `Hubungi 0812-3456-7890. ${t}`],
    ["name", (t) => `Nama saya Budi Santoso. ${t}`],
    ["address", (t) => `Rumah di Jl. Mawar No. 3, ${t}`],
    ["nik+email", (t) => `NIK 3171234567890001, budi@contoh.id. ${t}`],
    ["all", (t) => `Nama saya Sari Dewi, 08123456789, Jalan Melati 5, RT 03/RW 04, ${t}`],
  ];

  it.each(injections)("injected %s never lowers the level (all parity texts)", (_name, inject) => {
    for (const c of cases) {
      const plain = triage(c.input, rules).level;
      const injected = inject(c.input.text);
      const before = triage({ ...c.input, text: injected }, rules).level;
      const after = triage({ ...c.input, text: redact(injected, { protectedTerms }) }, rules).level;
      expect(rank[after], `${c.id}: redacted ${after} < original ${before}`).toBeGreaterThanOrEqual(rank[before]);
      expect(rank[after], `${c.id}: redacted ${after} < plain ${plain}`).toBeGreaterThanOrEqual(rank[plain]);
    }
  });

  it("address next to a red flag stays RED", () => {
    const text = redact("rumah di Jl. Mawar No. 3, mata kuning", { protectedTerms });
    expect(triage({ chips: [], text }, rules).level).toBe("RED");
  });

  it("combining levels after redaction never goes below the unredacted level", () => {
    expect(maxLevel("RED", "GREEN")).toBe("RED");
  });
});

describe("redactAndTriage closes the address-swallows-red-flag gap", () => {
  it.each([
    "rumah di Jalan Mawar mata kuning",
    "Jl. Mawar 3 pandangan buram",
    "tinggal di jalan Merdeka muntah terus",
  ])("%s stays RED even if redact() alone hides the flag", (rawText) => {
    const out = redactAndTriage({ chips: [], rawText }, rules);
    expect(out.result.level).toBe("RED");
    expect(out.redactedText).toContain("[ALAMAT]");
    expect(out.redactedText).not.toMatch(/Mawar|Merdeka/);
  });

  it("returns the redacted result when it is at least as high", () => {
    const out = redactAndTriage({ chips: ["urine_orange"], rawText: "Nama saya Budi. mual" }, rules);
    expect(out.redactedText).toBe("Nama saya [NAMA]. mual");
    expect(out.result.level).toBe("GREEN");
    expect(out.result.symptoms).toEqual(["nausea_mild", "urine_orange"]);
  });
});
