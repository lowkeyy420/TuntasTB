import { describe, expect, it } from "vitest";
import { todayJakarta } from "@/lib/time";
import { daysOverdue, daysUntil, firstDueDate, nextDueDate, NUDGE_DAYS, pickupState } from "./dates";

describe("firstDueDate", () => {
  it("new patient: start today, 7-day interval -> due in 7 days", () => {
    expect(firstDueDate("2026-03-20", 7, "2026-03-20")).toBe("2026-03-27");
  });

  it("registered 20 March with start 1 March and a 7-day interval -> 22 March", () => {
    expect(firstDueDate("2026-03-01", 7, "2026-03-20")).toBe("2026-03-22");
  });

  it("a due date that falls exactly on today counts (>= today)", () => {
    expect(firstDueDate("2026-03-01", 7, "2026-03-15")).toBe("2026-03-15");
    expect(firstDueDate("2026-03-01", 7, "2026-03-16")).toBe("2026-03-22");
  });

  it("a start date in the future still gives the first interval", () => {
    expect(firstDueDate("2026-03-25", 14, "2026-03-20")).toBe("2026-04-08");
  });

  it("crosses month and year ends", () => {
    expect(firstDueDate("2025-12-20", 14, "2025-12-28")).toBe("2026-01-03");
  });
});

describe("nextDueDate", () => {
  it("on time: due 8 March, done 8 March, 7 days -> 15 March", () => {
    expect(nextDueDate("2026-03-08", 7)).toBe("2026-03-15");
  });
  it("late: done 10 March -> 17 March", () => {
    expect(nextDueDate("2026-03-10", 7)).toBe("2026-03-17");
  });
  it("early: done 6 March -> 13 March", () => {
    expect(nextDueDate("2026-03-06", 7)).toBe("2026-03-13");
  });
});

describe("daysUntil and daysOverdue", () => {
  it("counts calendar days, negative when overdue", () => {
    expect(daysUntil("2026-03-10", "2026-03-08")).toBe(2);
    expect(daysUntil("2026-03-10", "2026-03-10")).toBe(0);
    expect(daysUntil("2026-03-10", "2026-03-13")).toBe(-3);
  });

  it("23:30 Jakarta on 8 March is still 8 March: two days to a 10 March pickup", () => {
    const now = new Date("2026-03-08T16:30:00Z"); // 23:30 WIB
    expect(todayJakarta(now)).toBe("2026-03-08");
    expect(daysUntil("2026-03-10", todayJakarta(now))).toBe(2);
    // One hour later it is 9 March in Jakarta.
    expect(daysUntil("2026-03-10", todayJakarta(new Date("2026-03-08T17:30:00Z")))).toBe(1);
  });

  it("daysOverdue is 0 unless the pickup is past due", () => {
    expect(daysOverdue("2026-03-10", "2026-03-13")).toBe(3);
    expect(daysOverdue("2026-03-10", "2026-03-10")).toBe(0);
    expect(daysOverdue("2026-03-10", "2026-03-08")).toBe(0);
  });
});

describe("pickupState", () => {
  const today = "2026-03-08";
  it.each([
    ["3 days away", "2026-03-11", false, "upcoming"],
    ["2 days away", "2026-03-10", false, "nudge"],
    ["1 day away", "2026-03-09", false, "nudge"],
    ["today", "2026-03-08", false, "due_today"],
    ["yesterday", "2026-03-07", false, "missed"],
    ["done and in the past", "2026-03-07", true, "done"],
    ["done and in the future", "2026-03-20", true, "done"],
  ] as const)("%s -> %s", (_label, due, done, expected) => {
    expect(pickupState(due, done, today)).toBe(expected);
  });

  it("the nudge starts 2 days before", () => {
    expect(NUDGE_DAYS).toBe(2);
  });
});
