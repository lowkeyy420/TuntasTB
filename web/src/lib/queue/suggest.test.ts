import { describe, expect, it } from "vitest";
import { suggestAction } from "./suggest";
import { formatClock, formatLastCheckin } from "./format";
import type { RiskSnapshot } from "@/lib/risk/types";

const base: RiskSnapshot = {
  doseStatus: "yes",
  consecutiveMissedBefore: 0,
  stopIntent: false,
  stigma: false,
  maxPersistenceDays: 0,
  level: "GREEN",
  missedPickup: false,
  hasPmo: true,
  daysSinceLastCheckin: 0,
};
const snap = (over: Partial<RiskSnapshot>): RiskSnapshot => ({ ...base, ...over });

describe("suggestAction (nurse-queue 1.2)", () => {
  it("silent for 3 days or more -> home visit", () => {
    expect(suggestAction(snap({ daysSinceLastCheckin: 3 }), 3)).toBe("visit");
    expect(suggestAction(snap({ daysSinceLastCheckin: 9 }), 3)).toBe("visit");
  });

  it("3 or more missed doses in a row -> home visit (today counts)", () => {
    expect(suggestAction(snap({ doseStatus: "no", consecutiveMissedBefore: 2 }), 6)).toBe("visit");
    expect(suggestAction(snap({ doseStatus: "yes", consecutiveMissedBefore: 3 }), 6)).toBe("visit");
  });

  it("two missed doses in a row are not yet a visit", () => {
    expect(suggestAction(snap({ doseStatus: "no", consecutiveMissedBefore: 1 }), 4)).toBe("call");
  });

  it("a missed pickup -> early pickup, when no visit condition applies", () => {
    expect(suggestAction(snap({ missedPickup: true }), 4)).toBe("earlyPickup");
  });

  it("a visit condition wins over a missed pickup", () => {
    expect(suggestAction(snap({ missedPickup: true, daysSinceLastCheckin: 4 }), 7)).toBe("visit");
  });

  it("any other score above zero -> call", () => {
    expect(suggestAction(snap({ stopIntent: true }), 4)).toBe("call");
    expect(suggestAction(snap({ daysSinceLastCheckin: 2 }), 1)).toBe("call");
  });

  it("score zero -> none", () => {
    expect(suggestAction(snap({}), 0)).toBe("none");
  });
});

describe("formatLastCheckin", () => {
  const now = new Date("2026-03-20T03:00:00Z"); // 10.00 WIB, 20 March

  it("formats clock time in Jakarta", () => {
    expect(formatClock(new Date("2026-03-19T12:20:00Z"))).toBe("19.20");
  });

  it("says today, yesterday, n days ago and never", () => {
    expect(formatLastCheckin(new Date("2026-03-19T23:42:00Z"), now)).toBe("hari ini 06.42"); // 06.42 WIB on 20 March
    expect(formatLastCheckin(new Date("2026-03-19T12:20:00Z"), now)).toBe("kemarin 19.20");
    expect(formatLastCheckin(new Date("2026-03-17T05:00:00Z"), now)).toBe("3 hari lalu");
    expect(formatLastCheckin(null, now)).toBe("belum pernah");
  });

  it("a check-in in the future (clock skew) reads as today", () => {
    expect(formatLastCheckin(new Date("2026-03-20T04:00:00Z"), now)).toBe("hari ini 11.00");
  });
});
