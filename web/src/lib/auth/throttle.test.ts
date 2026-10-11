import { describe, it, expect } from "vitest";
import { LoginThrottle } from "./throttle";

describe("LoginThrottle", () => {
  it("allows up to 5 failures then blocks the 6th", () => {
    const t = new LoginThrottle();
    const email = "nurse@x.id";
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(t.isBlocked(email, now)).toBe(false);
      t.recordFailure(email, now);
    }
    expect(t.isBlocked(email, now)).toBe(true);
  });

  it("resets after the 15-minute window", () => {
    const t = new LoginThrottle();
    const email = "nurse@x.id";
    const start = 1_000_000;
    for (let i = 0; i < 5; i++) t.recordFailure(email, start);
    expect(t.isBlocked(email, start)).toBe(true);
    const later = start + 15 * 60 * 1000 + 1;
    expect(t.isBlocked(email, later)).toBe(false);
  });

  it("clears the counter on reset (successful login)", () => {
    const t = new LoginThrottle();
    const email = "nurse@x.id";
    for (let i = 0; i < 5; i++) t.recordFailure(email);
    t.reset(email);
    expect(t.isBlocked(email)).toBe(false);
  });

  it("is case-insensitive on the email", () => {
    const t = new LoginThrottle();
    const now = 2_000_000;
    for (let i = 0; i < 5; i++) t.recordFailure("Nurse@X.ID", now);
    expect(t.isBlocked("nurse@x.id", now)).toBe(true);
  });
});
