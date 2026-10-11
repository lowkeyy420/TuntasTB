import { describe, it, expect } from "vitest";
import { copy } from "@/copy/family.id";
import { loadRulesFromDir } from "@/lib/triage/loadFiles";
import type { Level } from "@/lib/triage/types";
import {
  checkGenerated,
  checkNurseLine,
  checkStatic,
  wordCount,
  type GeneratedContext,
} from "./filter";
import { DEFAULT_FORBIDDEN, forbiddenFromLexicon, type ForbiddenOutput } from "./forbidden";
import { BUILTIN_MANIFEST, DEFAULT_CITATION_ID, defaultCitation } from "./sources";

const rules = loadRulesFromDir();
const CITE = [{ id: "efek-samping-ringan#umum", label: "x" }];

function ctx(over: Partial<GeneratedContext> = {}): GeneratedContext {
  return {
    level: "GREEN",
    flowLevel: "GREEN",
    citations: CITE,
    manifest: BUILTIN_MANIFEST,
    forbidden: DEFAULT_FORBIDDEN,
    action: "Tetap minum obat sesuai jadwal.",
    ...over,
  };
}

const reason = (text: string | null | undefined, over: Partial<GeneratedContext> = {}) => {
  const r = checkGenerated(text, ctx(over));
  return r.ok ? "ok" : r.reason;
};

describe("generated explanation: pass and empty", () => {
  it("accepts a clean, cited, level-matching explanation", () => {
    expect(reason("Air kencing merah sering terjadi karena obat.")).toBe("ok");
  });
  it.each([null, undefined, "", "   "])("rejects empty text %j", (t) => {
    expect(reason(t)).toBe("empty");
  });
});

describe("never says 'aman' (3.1)", () => {
  it("rejects 'aman' in any case and accepts 'nyaman'", () => {
    expect(reason("Ini aman, tidak perlu khawatir")).toBe("reassurance");
    expect(reason("AMAN")).toBe("reassurance");
    expect(reason("Dijamin Aman.")).toBe("reassurance");
    expect(reason("Badan terasa nyaman setelah minum obat.")).toBe("ok");
    expect(reason("Keamanan makanan perlu dijaga.")).toBe("ok");
  });
});

describe("no dosing content (3.1)", () => {
  it.each([
    "Minum 300 mg setiap hari.",
    "Dosisnya 2 tablet.", // "dosis" is a whole word only when alone; the tablet count catches this
    "minum 2 tablet saja",
    "Minum 1 kapsul setelah makan",
    "Satu butir 3 butir sehari",
    "kurangi dosis",
    "Kurangi obatnya dulu",
    "ganti obat saja",
    "Gandakan obat besok",
    "lewati obat hari ini",
    "Tambahkan satu lagi",
    "dosis",
    "0,5 miligram",
  ])("rejects %j", (text) => {
    expect(reason(text)).toBe("dosing");
  });

  it("does not reject ordinary numbers", () => {
    expect(reason("Biasanya hilang dalam 2 sampai 4 minggu.")).toBe("ok");
  });
});

describe("no diagnosis (3.1)", () => {
  it.each([
    "ini tanda hepatitis",
    "Anda menderita sakit hati",
    "Anda terkena penyakit",
    "Sudah didiagnosis dokter",
    "Mungkin diabetes",
    "Ini TBC",
    "Ini tb paru",
  ])("rejects %j", (text) => {
    expect(reason(text)).toBe("diagnosis");
  });

  it("does not match words that merely contain a condition", () => {
    expect(reason("Mereka berbicara tentang tbilisi")).toBe("ok");
  });
});

describe("level checks (3.2)", () => {
  it("rejects a message written for another level", () => {
    expect(reason("Mata kuning perlu diperiksa.", { level: "RED", flowLevel: "GREEN" })).toBe("level_mismatch");
    expect(reason("Mata kuning perlu diperiksa.", { level: "RED", flowLevel: null })).toBe("level_mismatch");
    expect(reason("Mata kuning perlu diperiksa.", { level: "RED", flowLevel: undefined })).toBe("level_mismatch");
  });

  it("rejects a stop instruction below RED", () => {
    for (const level of ["GREEN", "YELLOW"] as Level[]) {
      expect(reason("Sebaiknya berhenti minum obat.", { level, flowLevel: level })).toBe("contradiction");
      expect(reason("Stop obat dulu.", { level, flowLevel: level })).toBe("contradiction");
    }
  });

  it("allows a negated stop instruction", () => {
    expect(reason("Jangan berhenti minum obat.", { level: "YELLOW", flowLevel: "YELLOW" })).toBe("ok");
    expect(reason("Tidak boleh berhenti minum obat.", { level: "YELLOW", flowLevel: "YELLOW" })).toBe("ok");
  });

  it("rejects a continue instruction at RED", () => {
    expect(reason("Tetap minum obat seperti biasa.", { level: "RED", flowLevel: "RED" })).toBe("contradiction");
    expect(reason("Lanjutkan minum obat.", { level: "RED", flowLevel: "RED" })).toBe("contradiction");
  });

  it("allows a stop instruction at RED", () => {
    expect(reason("Berhenti minum obat dan segera periksa.", { level: "RED", flowLevel: "RED" })).toBe("ok");
  });
});

describe("plain language (3.2)", () => {
  it("rejects jargon", () => {
    expect(reason("Obat ini bisa bersifat hepatotoksik.")).toBe("jargon");
    expect(reason("Gejala NEUROPATI muncul.")).toBe("jargon");
  });

  it("rejects a sentence longer than 20 words and accepts exactly 20", () => {
    const words = (n: number) => Array.from({ length: n }, () => "kata").join(" ");
    expect(reason(`${words(28)}.`)).toBe("sentence_length");
    expect(reason(`Pendek. ${words(21)}.`)).toBe("sentence_length");
    expect(reason(`${words(20)}.`)).toBe("ok");
  });
});

describe("citation and length (3.3)", () => {
  it("rejects no citation, an unknown id and two citations", () => {
    expect(reason("Keluhan ini umum.", { citations: [] })).toBe("citation");
    expect(reason("Keluhan ini umum.", { citations: [{ id: "tidak-ada#x", label: "x" }] })).toBe("citation");
    expect(reason("Keluhan ini umum.", { citations: [...CITE, ...CITE] })).toBe("citation");
  });

  it("accepts an inherited object key only if it is really in the manifest", () => {
    expect(reason("Keluhan ini umum.", { citations: [{ id: "toString", label: "x" }] })).toBe("citation");
  });

  it("allows exactly 60 words of explanation plus action and rejects 61", () => {
    const action = "Tetap minum obat sesuai jadwal."; // 5 words
    const sentences = (n: number) =>
      Array.from({ length: n }, () => "Kata kata kata kata kata kata kata kata kata kata.").join(" "); // 10 words each
    expect(wordCount(action)).toBe(5);
    const fiftyFive = `${sentences(5)} Kata kata kata kata kata.`; // 55 words
    expect(wordCount(fiftyFive)).toBe(55);
    expect(reason(fiftyFive, { action })).toBe("ok");
    expect(reason(`${fiftyFive} Satu.`, { action })).toBe("too_long");
  });

  it("counts words by whitespace after trimming", () => {
    expect(wordCount("  satu   dua\ntiga ")).toBe(3);
    expect(wordCount("   ")).toBe(0);
  });

  it("reports the first failing reason in the documented order", () => {
    // Both reassurance and a missing citation: reassurance comes first.
    expect(reason("Ini aman.", { citations: [] })).toBe("reassurance");
    // Level mismatch comes before content checks.
    expect(reason("Ini aman.", { level: "RED", flowLevel: "YELLOW" })).toBe("level_mismatch");
  });
});

describe("empty phrase lists", () => {
  it("never match anything", () => {
    const none: ForbiddenOutput = {
      dosing: [],
      diagnosis: [],
      conditions: [],
      jargon: [],
      stop_instructions: [],
      continue_instructions: [],
    };
    expect(reason("Kurangi obat, hepatitis, hepatotoksik.", { forbidden: none })).toBe("ok");
  });
});

describe("static templates are checked by the same rules (3.4)", () => {
  const { table } = rules;
  const levels: Level[] = ["GREEN", "YELLOW", "RED"];
  const statics = (): { level: Level; text: string }[] => [
    ...levels.flatMap((level) => [
      { level, text: table.levels[level].message_id },
      { level, text: table.levels[level].action_id },
    ]),
    { level: "YELLOW", text: copy.reply.variants.stopIntentAction },
    { level: "GREEN", text: copy.reply.variants.noSymptom },
    { level: "GREEN", text: copy.reply.variants.doseMissed },
    { level: "GREEN", text: table.fallback_warning_id },
  ];

  it("every template and variant passes the content checks", () => {
    for (const { level, text } of statics()) {
      expect(checkStatic(text, level, DEFAULT_FORBIDDEN), text).toEqual({ ok: true });
    }
  });

  it("each template plus its action is at most 60 words", () => {
    for (const level of levels) {
      const { message_id, action_id } = table.levels[level];
      expect(wordCount(`${message_id} ${action_id}`), level).toBeLessThanOrEqual(60);
    }
    expect(
      wordCount(`${table.levels.YELLOW.message_id} ${copy.reply.variants.stopIntentAction}`),
    ).toBeLessThanOrEqual(60);
  });

  it("rejects an empty template", () => {
    expect(checkStatic(" ", "GREEN", DEFAULT_FORBIDDEN)).toEqual({ ok: false, reason: "empty" });
  });

  it("fails when 'aman' is inserted into a template", () => {
    const edited = `Keluhan ini aman. ${table.levels.GREEN.message_id}`;
    expect(checkStatic(edited, "GREEN", DEFAULT_FORBIDDEN)).toEqual({ ok: false, reason: "reassurance" });
  });

  it("every level has a default citation in the built-in manifest", () => {
    for (const level of levels) {
      expect(Object.keys(BUILTIN_MANIFEST)).toContain(DEFAULT_CITATION_ID[level]);
      expect(defaultCitation(level).label).not.toMatch(/\b(TB|TBC|tuberkulosis|TuntasTB)\b/i);
    }
    expect(defaultCitation("RED", {})).toEqual(defaultCitation("RED"));
  });
});

describe("nurse line check", () => {
  it("accepts a plain line and rejects dosing and diagnosis wording", () => {
    expect(checkNurseLine("mual 7 hari + bilang sudah sembuh", DEFAULT_FORBIDDEN)).toEqual({ ok: true });
    expect(checkNurseLine("kurangi dosis", DEFAULT_FORBIDDEN)).toEqual({ ok: false, reason: "dosing" });
    expect(checkNurseLine("ini tanda hepatitis", DEFAULT_FORBIDDEN)).toEqual({ ok: false, reason: "diagnosis" });
  });
});

describe("forbidden_output from the lexicon", () => {
  it("falls back to the defaults when the lexicon has no block", () => {
    const bare = { ...rules.lexicon, forbidden_output: undefined } as typeof rules.lexicon;
    expect(forbiddenFromLexicon(bare)).toBe(DEFAULT_FORBIDDEN);
    expect(forbiddenFromLexicon(undefined)).toBe(DEFAULT_FORBIDDEN);
  });

  it("adds to the defaults, never removes from them, and ignores malformed lists", () => {
    const lexicon = {
      ...rules.lexicon,
      forbidden_output: { dosing: ["sedot darah"], jargon: "bukan daftar", diagnosis: [""] },
    } as unknown as typeof rules.lexicon;
    const merged = forbiddenFromLexicon(lexicon);
    expect(merged.dosing).toContain("sedot darah");
    expect(merged.dosing).toContain("kurangi");
    expect(merged.jargon).toEqual(DEFAULT_FORBIDDEN.jargon);
    expect(merged.diagnosis).toEqual(DEFAULT_FORBIDDEN.diagnosis);
  });
});
