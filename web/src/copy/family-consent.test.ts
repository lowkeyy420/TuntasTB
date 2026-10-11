import { describe, it, expect } from "vitest";
import { copy } from "@/copy/family.id";

const FORBIDDEN = /\b(TB|TBC|tuberkulosis|TuntasTB)\b/i;

/** Every string on the consent and invalid-link surfaces, functions excluded. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => strings(v, out));
  return out;
}

describe("consent copy (6.1)", () => {
  const c = copy.consent;

  it("states what is collected", () => {
    expect(c.collected).toMatch(/obat diminum atau tidak/);
    expect(c.collected).toMatch(/keluhan/);
    expect(c.collected).toMatch(/catatan singkat/);
    expect(c.collected).toMatch(/Jangan tulis nama atau alamat/);
  });

  it("states who can see it", () => {
    expect(c.visibility).toMatch(/hanya dapat dilihat oleh perawat Puskesmas/);
  });

  it("states that an automated system reads it after personal data is removed", () => {
    expect(c.automated).toMatch(/sistem otomatis/);
    expect(c.automated).toMatch(/data pribadi dihapus/);
  });

  it("states the service does not replace the nurse", () => {
    expect(c.notReplacement).toMatch(/tidak menggantikan perawat/);
  });

  it("states how to withdraw", () => {
    expect(c.withdraw).toMatch(/berhenti kapan saja/);
    expect(c.withdraw).toMatch(/menghubungi Puskesmas/);
  });

  it("offers 'Saya setuju' and 'Tidak setuju'", () => {
    expect(c.agree).toBe("Saya setuju");
    expect(c.decline).toBe("Tidak setuju");
  });

  it("names no illness on consent, declined, invalid-link or landing surfaces", () => {
    const all = [
      ...strings(copy.consent),
      ...strings(copy.declined),
      ...strings(copy.invalidLink),
      ...strings(copy.landing),
      copy.declined.contact("Contoh", "021-555"),
    ];
    expect(all.filter((s) => FORBIDDEN.test(s))).toEqual([]);
  });

  it("uses the exact invalid-link wording from the spec", () => {
    expect(copy.invalidLink.body).toBe(
      "Tautan tidak berlaku. Hubungi petugas Puskesmas.",
    );
  });
});
