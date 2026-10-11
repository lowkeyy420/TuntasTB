import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalise, normaliseSentence } from "./normalise";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../rules/fixtures/normalise.json", import.meta.url)), "utf8"),
) as { id: string; input: string; sentences: string[] }[];

describe("normalise", () => {
  it.each(fixture)("fixture case $id", ({ input, sentences }) => {
    expect(normalise(input)).toEqual(sentences);
  });

  it("lower-cases", () => {
    expect(normaliseSentence("MATA Kuning")).toBe("mata kuning");
  });

  it("replaces punctuation with spaces", () => {
    expect(normaliseSentence("mual,muntah-(sedikit)")).toBe("mual muntah sedikit");
  });

  it("collapses runs of three or more identical letters", () => {
    expect(normaliseSentence("MUALLL banget")).toBe("mual banget");
    expect(normaliseSentence("baal")).toBe("baal");
  });

  it("strips -nya, -ku, -mu only when three letters remain", () => {
    expect(normaliseSentence("matanya kakiku badanmu")).toBe("mata kaki badan");
    expect(normaliseSentence("aku tamu")).toBe("aku tamu");
  });

  it("splits sentences on . ! ? ; and line breaks but not on commas", () => {
    expect(normalise("a b. c d! e f? g h; i j\nk l, m n")).toEqual([
      "a b",
      "c d",
      "e f",
      "g h",
      "i j",
      "k l m n",
    ]);
  });

  it("returns no sentences for empty or punctuation-only text", () => {
    expect(normalise("")).toEqual([]);
    expect(normalise(" ?!. ")).toEqual([]);
  });
});
