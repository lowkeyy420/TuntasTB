import { describe, expect, it } from "vitest";
import { loadRulesFromDir } from "./loadFiles";
import { hasAny, hasPhrase, matchCodes, matchEntry, parseDurationDays } from "./match";
import { normalise } from "./normalise";
import { fileURLToPath } from "node:url";

const rules = loadRulesFromDir(fileURLToPath(new URL("../../../../rules", import.meta.url)));
const codesFor = (text: string) => matchCodes(normalise(text), rules.symptomEntries);
const flagsFor = (text: string) => matchCodes(normalise(text), rules.redFlagEntries);
const days = (text: string) => parseDurationDays(normalise(text), rules.durations);

describe("phrase matching", () => {
  it("matches on token boundaries only", () => {
    expect(hasPhrase("mual terus", "mual")).toBe(true);
    expect(hasPhrase("mualnya", "mual")).toBe(false);
    expect(hasPhrase("kemual", "mual")).toBe(false);
    expect(hasPhrase("kencing merah", "kencing merah")).toBe(true);
    expect(hasPhrase("kencing agak merah", "kencing merah")).toBe(false);
  });

  it("hasAny looks through every sentence and phrase", () => {
    expect(hasAny(["a b", "c d"], ["x", "d"])).toBe(true);
    expect(hasAny(["a b"], ["x"])).toBe(false);
    expect(hasAny([], ["x"])).toBe(false);
  });

  it("combo: one term per group in the same sentence", () => {
    expect(flagsFor("matanya agak kuning")).toContain("jaundice");
    expect(flagsFor("kulitnya menguning")).toContain("jaundice");
    expect(flagsFor("mata baik. kuning")).not.toContain("jaundice");
  });

  it('"kencingnya kuning pekat" does not match jaundice or any symptom', () => {
    expect(flagsFor("kencingnya kuning pekat")).toEqual([]);
    expect(codesFor("kencingnya kuning pekat")).toEqual([]);
  });

  it("any-only and combo-only entries behave the same way", () => {
    const anyOnly = { code: "x", any: ["abc"], combo: [] };
    const comboOnly = { code: "y", any: [], combo: [["a"], ["b"]] };
    expect(matchEntry(["abc"], anyOnly)).toBe(true);
    expect(matchEntry(["zzz"], anyOnly)).toBe(false);
    expect(matchEntry(["a b"], comboOnly)).toBe(true);
    expect(matchEntry(["a", "b"], comboOnly)).toBe(false);
  });

  it("matchCodes keeps entry order", () => {
    const entries = [
      { code: "b", any: ["x"], combo: [] },
      { code: "a", any: ["y"], combo: [] },
    ];
    expect(matchCodes(["x y"], entries)).toEqual(["b", "a"]);
  });
});

describe("duration parser", () => {
  it('"seminggu" is 7 days', () => expect(days("mual terus seminggu")).toBe(7));
  it('"3 hari" is 3 days', () => expect(days("mual 3 hari")).toBe(3));
  it('"2 minggu" is 14 days', () => expect(days("mual 2 minggu")).toBe(14));
  it("handles a missing space and the number words", () => {
    expect(days("mual 5hari")).toBe(5);
    expect(days("mual tiga minggu")).toBe(21);
    expect(days("mual sepuluh hari")).toBe(10);
  });
  it("takes the longest stated duration across sentences", () => {
    expect(days("mual 3 hari. sakit kepala 2 minggu")).toBe(14);
  });
  it("is 0 when no duration is stated", () => {
    expect(days("mual terus")).toBe(0);
    expect(days("")).toBe(0);
  });
  it("does not match inside longer numbers or words", () => {
    expect(days("mual 1234 hari")).toBe(0);
    expect(days("mual harihari")).toBe(0);
  });
});
