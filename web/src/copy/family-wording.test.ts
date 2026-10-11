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

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
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

describe("neutral wording on family surfaces", () => {
  it("family copy contains no forbidden term", () => {
    expect(findForbidden("family copy", familyCopy)).toEqual([]);
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
    // A word that merely contains the letters t-b is NOT matched.
    expect(findForbidden("probe", "obat diminum")).toEqual([]);
  });
});
