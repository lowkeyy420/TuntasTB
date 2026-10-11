import { describe, it, expect } from "vitest";
import { copy as familyCopy } from "@/copy/family.id";
import manifest from "@/app/manifest";
import { metadata as familyLayoutMeta } from "@/app/f/[token]/layout";
import { metadata as familyPageMeta } from "@/app/f/[token]/page";

/**
 * Family-visible surfaces must never reveal the illness. A whole-word,
 * case-insensitive match of any forbidden term fails the build.
 */
const FORBIDDEN = /\b(TB|TBC|tuberkulosis|TuntasTB)\b/i;

/** The family is never told something is "aman". "nyaman" is a different word. */
const REASSURANCE = /\baman\b/i;

/** Dosing content a family message may never carry. */
const DOSING = /\b(\d+\s*mg|dosis|tablet|kapsul|pil)\b/i;

const MAX_SENTENCE_WORDS = 20;

/**
 * Every string in a copy tree. Function-valued copy (messages with a name,
 * a number or a date in them) is called with sample arguments so its fixed
 * wording is checked too.
 */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") collectStrings(value("Contoh", "021-555"), out);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

function findForbidden(label: string, value: unknown): string[] {
  return collectStrings(value)
    .filter((s) => FORBIDDEN.test(s))
    .map((s) => `${label}: "${s}"`);
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

describe("neutral wording on family surfaces", () => {
  it("family copy contains no forbidden term", () => {
    expect(findForbidden("family copy", familyCopy)).toEqual([]);
  });

  it("covers function-valued copy and the mockup strings", () => {
    const all = collectStrings(familyCopy);
    // Function-valued entries were called, not skipped.
    expect(all).toContain("Puskesmas Contoh, telepon 021-555.");
    expect(all).toContain(familyCopy.home.dayLabel(5).replace("5", "Contoh"));
    // Strings added for the home state and the S02..S09 mockups are in the walk.
    for (const s of [
      familyCopy.home.notReadyTitle,
      familyCopy.triage.RED.label,
      familyCopy.checkin.doseQuestion,
      familyCopy.checkin.symptoms.yellow,
      familyCopy.reply.RED.action,
      familyCopy.pickup.overdue,
      familyCopy.ask.abstain,
    ]) {
      expect(all).toContain(s);
    }
  });

  it("the PWA manifest is neutral and named 'Pengingat Harian'", () => {
    const m = manifest();
    expect(m.name).toBe("Pengingat Harian");
    expect(m.short_name).toBe("Pengingat");
    expect(findForbidden("manifest", m)).toEqual([]);
  });

  it("family route metadata contains no forbidden term", () => {
    expect(findForbidden("layout meta", familyLayoutMeta)).toEqual([]);
    expect(findForbidden("page meta", familyPageMeta)).toEqual([]);
  });

  it("the check itself catches a forbidden term (guards against false negatives)", () => {
    expect(findForbidden("probe", { x: "jadwal kontrol TBC" })).not.toEqual([]);
    expect(findForbidden("probe", "tuberkulosis paru")).not.toEqual([]);
    expect(findForbidden("probe", { f: (n: string) => `obat TB untuk ${n}` })).not.toEqual([]);
    // A word that merely contains the letters t-b is NOT matched.
    expect(findForbidden("probe", "obat diminum")).toEqual([]);
  });
});

describe("family safety wording", () => {
  const all = collectStrings(familyCopy);

  it("never says 'aman'", () => {
    expect(all.filter((s) => REASSURANCE.test(s))).toEqual([]);
    expect(REASSURANCE.test("Ini aman, tidak perlu khawatir")).toBe(true);
    expect(REASSURANCE.test("AMAN")).toBe(true);
    expect(REASSURANCE.test("terasa nyaman")).toBe(false);
  });

  it("the sample replies and the sample answer carry no dosing content", () => {
    const messages = [
      ...collectStrings(familyCopy.reply),
      familyCopy.ask.sampleAnswer,
      familyCopy.ask.abstain,
    ];
    expect(messages.filter((s) => DOSING.test(s))).toEqual([]);
    expect(DOSING.test("minum 2 tablet saja")).toBe(true);
    expect(DOSING.test("300 mg")).toBe(true);
  });

  it("each sample reply is at most 60 words (explanation plus action)", () => {
    for (const level of ["GREEN", "YELLOW", "RED"] as const) {
      const r = familyCopy.reply[level];
      expect(wordCount(`${r.explanation} ${r.action}`), level).toBeLessThanOrEqual(60);
    }
  });

  it("uses the exact triage words", () => {
    expect(familyCopy.triage.GREEN.label).toBe("Lanjutkan");
    expect(familyCopy.triage.YELLOW.label).toBe("Perawat akan menghubungi");
    expect(familyCopy.triage.RED.label).toBe("Segera ke Puskesmas");
  });

  it("uses the exact abstain wording", () => {
    expect(familyCopy.ask.abstain).toBe("Saya belum bisa menjawab ini, tanyakan ke perawat");
  });
});

describe("plain Bahasa", () => {
  it("no family sentence is longer than 20 words", () => {
    const long = collectStrings(familyCopy)
      .flatMap(sentences)
      .filter((s) => wordCount(s) > MAX_SENTENCE_WORDS);
    expect(long).toEqual([]);
  });

  it("the sentence check catches a long sentence", () => {
    const long = Array.from({ length: 21 }, () => "kata").join(" ") + ".";
    expect(sentences(`Pendek. ${long}`).filter((s) => wordCount(s) > MAX_SENTENCE_WORDS)).toHaveLength(1);
  });
});
