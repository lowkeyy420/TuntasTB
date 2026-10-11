import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { triage } from "@/lib/triage/engine";
import { loadRulesFromDir } from "@/lib/triage/loadFiles";
import { lexiconProtectedTerms } from "@/lib/triage/protectedTerms";
import { redactAndTriage } from "@/lib/triage/redactTriage";
import type { Level } from "@/lib/triage/types";
import { ADDRESS_MAX_TOKENS, redact } from "./redact";
import { defaultProtectedTerms, redactWithLexicon } from "./withLexicon";

const RULES_DIR = fileURLToPath(new URL("../../../../rules", import.meta.url));
const rules = loadRulesFromDir(RULES_DIR);
const protectedTerms = lexiconProtectedTerms(rules.lexicon);

const redFlagKeywords = (): string[] => [
  ...new Set(
    Object.values(rules.lexicon.red_flags).flatMap((e) => [...(e.any ?? []), ...(e.combo ?? []).flat()]),
  ),
];

describe("redact: an address never swallows a symptom (regression)", () => {
  it("keeps 'mata kuning' after 'rumah di Jalan Mawar'", () => {
    const out = redactWithLexicon("rumah di Jalan Mawar mata kuning");
    expect(out).toBe("rumah di [ALAMAT] mata kuning");
  });

  it("keeps the symptom even when no lexicon is supplied (shape bound alone)", () => {
    expect(redact("rumah di Jalan Mawar mata kuning")).toBe("rumah di [ALAMAT] mata kuning");
  });

  it("the sentence stays RED after redaction", () => {
    const text = redactWithLexicon("rumah di Jalan Mawar mata kuning");
    expect(triage({ chips: [], text }, rules).level).toBe("RED");
  });

  it("still redacts the whole street, number and RT/RW", () => {
    expect(redact("Jl. Kebon Jeruk Raya No. 12 RT 03/RW 05, mata kuning", { protectedTerms })).toBe(
      "[ALAMAT], mata kuning",
    );
  });

  it("stops at a sentence end and keeps the next sentence", () => {
    expect(redact("rumah di Jalan Mawar. Mata kuning sejak kemarin", { protectedTerms })).toBe(
      "rumah di [ALAMAT]. Mata kuning sejak kemarin",
    );
  });

  it("stops at a protected term even when it is capitalised like a street word", () => {
    expect(redact("Jalan Mawar Muntah terus", { protectedTerms })).toBe("[ALAMAT] Muntah terus");
  });

  it("stops at a clause word", () => {
    expect(redact("Jalan Mawar Indah dan saya mual", { protectedTerms })).toBe("[ALAMAT] dan saya mual");
  });

  it("caps the number of tokens", () => {
    const street = Array.from({ length: ADDRESS_MAX_TOKENS + 3 }, (_, i) => `Kata${i}`).join(" ");
    const out = redact(`Jalan ${street}`, { protectedTerms });
    expect(out).toBe("[ALAMAT] Kata8 Kata9 Kata10");
  });

  it("leaves a protected first token alone ('Jalan Muntah' is not treated as an address)", () => {
    expect(redact("Jalan Muntah terus", { protectedTerms })).toBe("Jalan Muntah terus");
  });

  it("handles several addresses and a trailing quoted token", () => {
    const out = redact("Jl. Mawar 3 lalu Jl. Melati 5", { protectedTerms });
    expect(out).toBe("[ALAMAT] lalu [ALAMAT]");
  });
});

describe("redact: a name never swallows a symptom", () => {
  it("keeps a capitalised protected term after the name", () => {
    expect(redact("nama saya Budi Demam sejak kemarin", { protectedTerms })).toBe(
      "nama saya [NAMA] Demam sejak kemarin",
    );
    expect(redact("Nama saya Budi Santoso Kuning", { protectedTerms })).toBe("Nama saya [NAMA] Kuning");
  });

  it("keeps the whole match when the first token is protected", () => {
    expect(redact("namanya Sempoyongan", { protectedTerms: ["Sempoyongan"] })).toBe("namanya Sempoyongan");
  });
});

describe("redact: lexicon helper", () => {
  it("feeds the lexicon by default", () => {
    expect(defaultProtectedTerms()).toContain("kuning");
    expect(defaultProtectedTerms()).toBe(defaultProtectedTerms());
  });
});

describe("redaction never lowers triage: every red-flag keyword", () => {
  const level = (text: string): Level => triage({ chips: [], text }, rules).level;
  const keywords = redFlagKeywords();

  it("has a meaningful number of keywords", () => {
    expect(keywords.length).toBeGreaterThan(80);
  });

  it.each([
    ["rumah di Jalan Mawar", (kw: string) => `rumah di Jalan Mawar ${kw}`],
    ["nama saya Budi", (kw: string) => `nama saya Budi ${kw}`],
    ["capitalised name", (kw: string) => `Nama saya Budi Santoso ${kw}`],
    ["address with number", (kw: string) => `Jl. Mawar No. 3 ${kw}`],
  ])("%s <kw>: level(redacted) equals level(raw)", (_label, build) => {
    for (const kw of keywords) {
      const raw = build(kw);
      const redacted = redactWithLexicon(raw);
      expect(level(redacted), `"${raw}" -> "${redacted}"`).toBe(level(raw));
    }
  });

  it("redactAndTriage returns the raw level for every keyword in both shapes", () => {
    for (const kw of keywords) {
      for (const raw of [`rumah di Jalan Mawar ${kw}`, `nama saya Budi ${kw}`]) {
        const out = redactAndTriage({ chips: [], rawText: raw }, rules);
        const rawLevel = level(raw);
        expect(out.result.level, raw).toBe(rawLevel);
        // The stored/sent text on its own already reaches that level.
        expect(level(out.redactedText), `${raw} -> ${out.redactedText}`).toBe(rawLevel);
      }
    }
  });
});
