import { describe, it, expect } from "vitest";
import { createSession, readSession, SESSION_TTL_SECONDS } from "./session";
import { hashPassword, verifyPassword, verifyAgainstDummy } from "./password";

const SECRET = "s".repeat(48);
const PEPPER = "p".repeat(48);

describe("session", () => {
  it("round-trips a valid session", async () => {
    const token = await createSession(
      { nurseId: "n1", puskesmasId: "pk1" },
      SECRET,
    );
    const payload = await readSession(token, SECRET);
    expect(payload).toEqual({ nurseId: "n1", puskesmasId: "pk1" });
  });

  it("rejects a tampered token", async () => {
    const token = await createSession(
      { nurseId: "n1", puskesmasId: "pk1" },
      SECRET,
    );
    const tampered = token.slice(0, -3) + "aaa";
    expect(await readSession(tampered, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSession(
      { nurseId: "n1", puskesmasId: "pk1" },
      SECRET,
    );
    expect(await readSession(token, "d".repeat(48))).toBeNull();
  });

  it("rejects an expired token", async () => {
    const past = new Date(Date.now() - (SESSION_TTL_SECONDS + 60) * 1000);
    const token = await createSession(
      { nurseId: "n1", puskesmasId: "pk1" },
      SECRET,
      past,
    );
    expect(await readSession(token, SECRET)).toBeNull();
  });

  it("rejects a missing token", async () => {
    expect(await readSession(undefined, SECRET)).toBeNull();
  });
});

describe("password", () => {
  it("hashes and verifies a password with the pepper", async () => {
    const hash = await hashPassword("demo12345", PEPPER);
    expect(hash).not.toBe("demo12345");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("demo12345", hash, PEPPER)).toBe(true);
  });

  it("fails verification with a wrong password", async () => {
    const hash = await hashPassword("demo12345", PEPPER);
    expect(await verifyPassword("wrong", hash, PEPPER)).toBe(false);
  });

  it("fails verification when the pepper differs", async () => {
    const hash = await hashPassword("demo12345", PEPPER);
    expect(await verifyPassword("demo12345", hash, "x".repeat(48))).toBe(false);
  });

  it("verifyAgainstDummy always returns false", async () => {
    expect(await verifyAgainstDummy("anything", PEPPER)).toBe(false);
  });
});
