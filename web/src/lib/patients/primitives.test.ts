import { describe, it, expect } from "vitest";
import { normalisePmoContact } from "./phone";
import { hashPmoContact, InvalidPmoContactError } from "./pmo";
import { daysBetween, treatmentDay } from "@/lib/time";
import {
  generateFamilyToken,
  hashFamilyToken,
  bearerToken,
} from "@/lib/family-token";

const PEPPER = "p".repeat(48);

describe("hashPmoContact (1.2)", () => {
  it("gives the same hash for two formats of one number", () => {
    const a = hashPmoContact("0812-3456-7890", PEPPER);
    const b = hashPmoContact("+62 812 3456 7890", PEPPER);
    const c = hashPmoContact("6281234567890", PEPPER);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("returns null for empty input", () => {
    expect(hashPmoContact("", PEPPER)).toBeNull();
    expect(hashPmoContact("   ", PEPPER)).toBeNull();
    expect(hashPmoContact(null, PEPPER)).toBeNull();
    expect(hashPmoContact(undefined, PEPPER)).toBeNull();
  });

  it("is keyed: a different pepper gives a different hash", () => {
    expect(hashPmoContact("0812-3456-7890", PEPPER)).not.toBe(
      hashPmoContact("0812-3456-7890", "q".repeat(48)),
    );
  });

  it("is not the plain digits or a plain SHA-256 of them", () => {
    const h = hashPmoContact("0812-3456-7890", PEPPER)!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("81234567890");
  });

  it("rejects a non-empty value that is not a phone number", () => {
    expect(() => hashPmoContact("abc", PEPPER)).toThrow(InvalidPmoContactError);
    expect(normalisePmoContact("12345")).toBeNull();
  });

  it("normalises to +62", () => {
    expect(normalisePmoContact("0812-3456-7890")).toBe("+6281234567890");
    expect(normalisePmoContact("+62 812 3456 7890")).toBe("+6281234567890");
  });
});

describe("family token primitives (1.1)", () => {
  it("generates distinct 43-character base64url tokens", () => {
    const a = generateFamilyToken();
    const b = generateFamilyToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashes to a stable SHA-256 hex that does not contain the token", () => {
    const t = generateFamilyToken();
    expect(hashFamilyToken(t)).toBe(hashFamilyToken(t));
    expect(hashFamilyToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashFamilyToken(t)).not.toContain(t);
  });

  it("reads a bearer token from the Authorization header", () => {
    const req = (h?: string) =>
      new Request("http://x/", { headers: h ? { authorization: h } : {} });
    expect(bearerToken(req("Bearer abc"))).toBe("abc");
    expect(bearerToken(req("bearer abc"))).toBe("abc");
    expect(bearerToken(req("Basic abc"))).toBeNull();
    expect(bearerToken(req())).toBeNull();
  });
});

describe("treatment day (2.4)", () => {
  it("is day 18 on 18 March for a 1 March start", () => {
    expect(daysBetween("2026-03-01", "2026-03-18")).toBe(17);
    expect(treatmentDay("2026-03-01", "2026-03-18")).toBe(18);
  });

  it("is day 1 on the start date and crosses month and year ends", () => {
    expect(treatmentDay("2026-03-01", "2026-03-01")).toBe(1);
    expect(treatmentDay("2025-12-31", "2026-01-01")).toBe(2);
  });
});
