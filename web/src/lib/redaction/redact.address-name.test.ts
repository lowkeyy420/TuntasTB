import { describe, it, expect } from "vitest";
import { redact } from "./redact";

describe("redact: address and name", () => {
  it("redacts a name after a self-naming phrase", () => {
    expect(redact("nama saya Budi Santoso, mual terus")).toBe(
      "nama saya [NAMA], mual terus",
    );
  });

  it("redacts an address and keeps the symptom text", () => {
    const out = redact(
      "rumah di Jl. Kebon Jeruk No. 12 RT 03/RW 05, mata kuning",
    );
    expect(out).toContain("[ALAMAT]");
    expect(out).not.toContain("Kebon Jeruk");
    expect(out).toContain("mata kuning");
  });

  it("leaves 'saya mual dan jalan sempoyongan' unchanged", () => {
    const s = "saya mual dan jalan sempoyongan";
    expect(redact(s)).toBe(s);
  });

  it("redacts a capitalised name after bare 'saya'", () => {
    expect(redact("saya Andi, demam sejak kemarin")).toBe(
      "saya [NAMA], demam sejak kemarin",
    );
  });

  it("respects protectedTerms so a symptom keyword is not treated as a name", () => {
    // Contrived: a capitalised symptom term after a naming phrase.
    const out = redact("namanya Sempoyongan", {
      protectedTerms: ["Sempoyongan"],
    });
    expect(out).toBe("namanya Sempoyongan");
  });

  it("redacts the name after 'nama ibu saya'", () => {
    expect(redact("nama ibu saya Siti Aminah")).toBe("nama ibu saya [NAMA]");
  });
});
