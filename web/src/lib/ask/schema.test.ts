import { describe, expect, it } from "vitest";
import { askRequestSchema, flowOutputSchema, QUESTION_MAX } from "./schema";

describe("askRequestSchema", () => {
  it("accepts a question and trims it", () => {
    expect(askRequestSchema.parse({ question: "  kenapa kencingnya jadi merah?  " })).toEqual({
      question: "kenapa kencingnya jadi merah?",
    });
  });

  it("accepts the shortest and the longest allowed question", () => {
    expect(askRequestSchema.safeParse({ question: "abc" }).success).toBe(true);
    expect(askRequestSchema.safeParse({ question: "a".repeat(QUESTION_MAX) }).success).toBe(true);
  });

  it.each([
    ["empty", { question: "" }],
    ["only spaces", { question: "     " }],
    ["two characters", { question: "ab" }],
    ["301 characters", { question: "a".repeat(QUESTION_MAX + 1) }],
    ["not a string", { question: 42 }],
    ["missing", {}],
    ["an extra key", { question: "boleh puasa?", patientId: "x" }],
    ["not an object", "boleh puasa?"],
  ])("rejects %s", (_name, body) => {
    expect(askRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("flowOutputSchema", () => {
  const valid = {
    answer: "Itu sering terjadi karena obat.",
    citations: [{ id: "efek-samping-ringan#urin-merah", label: "x" }],
    retrieved_ids: ["efek-samping-ringan#urin-merah"],
    abstained: false,
  };

  it("accepts the flow contract and ignores the citation label", () => {
    const parsed = flowOutputSchema.parse(valid);
    expect(parsed.citations).toEqual([{ id: "efek-samping-ringan#urin-merah" }]);
  });

  it("accepts an abstention", () => {
    expect(flowOutputSchema.safeParse({ answer: "", citations: [], retrieved_ids: [], abstained: true }).success).toBe(true);
  });

  it.each([
    ["no abstained flag", { ...valid, abstained: undefined }],
    ["answer not a string", { ...valid, answer: null }],
    ["citation without id", { ...valid, citations: [{}] }],
    ["citation with empty id", { ...valid, citations: [{ id: "" }] }],
    ["citations as strings", { ...valid, citations: ["a"] }],
    ["no retrieved ids", { ...valid, retrieved_ids: undefined }],
    ["a string", "hello"],
    ["null", null],
  ])("rejects %s", (_name, value) => {
    expect(flowOutputSchema.safeParse(value).success).toBe(false);
  });
});
