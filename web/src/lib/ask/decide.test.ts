import { describe, expect, it } from "vitest";
import { DEFAULT_FORBIDDEN } from "@/lib/reply/forbidden";
import { decide, MAX_ANSWER_WORDS, type DecideContext, type FlowCall } from "./decide";

const ID = "efek-samping-ringan#urin-merah";
const OTHER = "minum-obat-teratur#obat-terlewat";
const LABEL = "Panduan efek samping obat, bagian air kencing merah";

const ctx: DecideContext = {
  manifest: { [ID]: { label: LABEL }, [OTHER]: { label: "Panduan minum obat, bagian obat terlewat" } },
  forbidden: DEFAULT_FORBIDDEN,
};

const output = (over: Record<string, unknown> = {}): FlowCall => ({
  ok: true,
  output: {
    answer: "Air kencing merah atau oranye sering terjadi karena obat. Warna itu hilang setelah pengobatan selesai.",
    citations: [{ id: ID }],
    retrieved_ids: [ID, OTHER],
    abstained: false,
    ...over,
  },
});

const reasonOf = (call: FlowCall) => {
  const d = decide(call, ctx);
  expect(d.kind).toBe("abstain");
  return d.kind === "abstain" ? d.reason : null;
};

describe("decide: clean pass", () => {
  it("shows a cited answer with the manifest's label", () => {
    const d = decide(output(), ctx);
    expect(d).toEqual({
      kind: "answer",
      text: "Air kencing merah atau oranye sering terjadi karena obat. Warna itu hilang setelah pengobatan selesai.",
      citations: [{ id: ID, label: LABEL }],
    });
  });

  it("uses the manifest label even when the flow sends another one", () => {
    const d = decide(output({ citations: [{ id: ID, label: "label dari flow" }] }), ctx);
    expect(d.kind === "answer" && d.citations[0].label).toBe(LABEL);
  });

  it("lists two cited sections once each", () => {
    const d = decide(output({ citations: [{ id: ID }, { id: OTHER }, { id: ID }] }), ctx);
    expect(d.kind === "answer" && d.citations.map((c) => c.id)).toEqual([ID, OTHER]);
  });

  it("accepts exactly 80 words", () => {
    const sentence = "Kalimat pendek ini punya sepuluh kata saja ya ok lagi.";
    const answer = Array.from({ length: 8 }, () => sentence).join(" ");
    expect(answer.split(/\s+/)).toHaveLength(MAX_ANSWER_WORDS);
    expect(decide(output({ answer }), ctx).kind).toBe("answer");
  });
});

describe("decide: every abstain path", () => {
  it("call failure", () => expect(reasonOf({ ok: false })).toBe("call_failed"));

  it.each([
    ["a string", "hello"],
    ["null", null],
    ["a missing field", { answer: "x", citations: [] }],
    ["wrong types", { answer: 1, citations: [], retrieved_ids: [], abstained: false }],
  ])("invalid output: %s", (_n, value) => {
    expect(reasonOf({ ok: true, output: value })).toBe("invalid_output");
  });

  it("flow abstained", () => {
    expect(reasonOf(output({ abstained: true, answer: "", citations: [] }))).toBe("flow_abstained");
  });

  it("flow abstained, even with an answer and citation attached", () => {
    expect(reasonOf(output({ abstained: true }))).toBe("flow_abstained");
  });

  it("empty answer", () => {
    expect(reasonOf(output({ answer: "   " }))).toBe("empty_answer");
  });

  it("no citation", () => {
    expect(reasonOf(output({ citations: [] }))).toBe("no_citation");
  });

  it("citation not in the manifest", () => {
    expect(reasonOf(output({ citations: [{ id: "bukan#ada" }], retrieved_ids: ["bukan#ada"] }))).toBe(
      "citation_not_in_manifest",
    );
  });

  it("one good and one unknown citation", () => {
    expect(reasonOf(output({ citations: [{ id: ID }, { id: "bukan#ada" }], retrieved_ids: [ID, "bukan#ada"] }))).toBe(
      "citation_not_in_manifest",
    );
  });

  it("a prototype key is not a manifest section", () => {
    expect(reasonOf(output({ citations: [{ id: "__proto__" }], retrieved_ids: ["__proto__"] }))).toBe(
      "citation_not_in_manifest",
    );
  });

  it("citation in the manifest but not retrieved", () => {
    expect(reasonOf(output({ retrieved_ids: [OTHER] }))).toBe("citation_not_retrieved");
  });

  it("the word 'aman'", () => {
    expect(reasonOf(output({ answer: "Ini aman, tidak perlu khawatir." }))).toBe("reassurance");
  });

  it("'nyaman' is not 'aman'", () => {
    expect(decide(output({ answer: "Cari posisi yang nyaman saat minum obat." }), ctx).kind).toBe("answer");
  });

  it.each(["Minum 2 tablet saja.", "Itu dosis yang biasa.", "Obatnya boleh dikurangi."])("dosing: %s", (answer) => {
    expect(reasonOf(output({ answer }))).toBe("dosing");
  });

  it.each(["Anda menderita penyakit hati.", "Ini mungkin hepatitis."])("diagnosis: %s", (answer) => {
    expect(reasonOf(output({ answer }))).toBe("diagnosis");
  });

  it("jargon", () => {
    expect(reasonOf(output({ answer: "Itu tanda neuropati ringan." }))).toBe("jargon");
  });

  it("a 120-word answer", () => {
    const sentence = "Kalimat pendek ini punya sepuluh kata saja ya ok lagi.";
    const answer = Array.from({ length: 12 }, () => sentence).join(" ");
    expect(answer.split(/\s+/)).toHaveLength(120);
    expect(reasonOf(output({ answer }))).toBe("too_long");
  });

  it("81 words", () => {
    const answer = Array.from({ length: 8 }, () => "Kalimat pendek ini punya sepuluh kata saja ya ok lagi.").join(" ") + " Satu.";
    expect(answer.split(/\s+/)).toHaveLength(MAX_ANSWER_WORDS + 1);
    expect(reasonOf(output({ answer }))).toBe("too_long");
  });

  it("records the first failure when several apply", () => {
    // no citation comes before the content checks
    expect(reasonOf(output({ answer: "Ini aman.", citations: [] }))).toBe("no_citation");
  });
});
