import { describe, it, expect } from "vitest";
import { todayJakarta, toJakartaDate } from "./time";

describe("time (Asia/Jakarta)", () => {
  it("treats 18:30 UTC on 1 March as 2 March in Jakarta", () => {
    // 18:30 UTC + 7h = 01:30 on the next day in Jakarta.
    const instant = new Date("2024-03-01T18:30:00.000Z");
    expect(toJakartaDate(instant)).toBe("2024-03-02");
    expect(todayJakarta(instant)).toBe("2024-03-02");
  });

  it("keeps the same calendar day earlier in the UTC day", () => {
    const instant = new Date("2024-03-01T05:00:00.000Z"); // 12:00 Jakarta
    expect(toJakartaDate(instant)).toBe("2024-03-01");
  });

  it("rolls over the year boundary", () => {
    const instant = new Date("2023-12-31T17:30:00.000Z"); // 00:30 Jakarta 1 Jan
    expect(toJakartaDate(instant)).toBe("2024-01-01");
  });

  it("formats as zero-padded YYYY-MM-DD", () => {
    const instant = new Date("2024-01-05T02:00:00.000Z");
    expect(toJakartaDate(instant)).toBe("2024-01-05");
  });
});
