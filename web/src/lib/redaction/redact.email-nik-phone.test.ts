import { describe, it, expect } from "vitest";
import { redact } from "./redact";

describe("redact: email, NIK, phone", () => {
  it("redacts a local phone number", () => {
    expect(redact("hubungi saya di 0812-3456-7890 ya")).toBe(
      "hubungi saya di [TELEPON] ya",
    );
  });

  it("redacts an international phone and leaves no digits from it", () => {
    const out = redact("wa +62 812 3456 7890");
    expect(out).toContain("[TELEPON]");
    expect(out).not.toMatch(/\d/);
  });

  it("redacts a 16-digit NIK", () => {
    expect(redact("NIK 3174012345678901")).toBe("NIK [NIK]");
  });

  it("redacts NIK before treating it as a phone", () => {
    const out = redact("3174012345678901");
    expect(out).toBe("[NIK]");
  });

  it("redacts an email address", () => {
    expect(redact("email rina@example.com")).toBe("email [EMAIL]");
  });

  it("leaves a plain sentence with no PII unchanged", () => {
    const s = "pasien batuk dan demam ringan";
    expect(redact(s)).toBe(s);
  });
});
