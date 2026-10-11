import { describe, it, expect } from "vitest";
import { checkinBodySchema } from "./schema";
import { checkinTreatmentDay, resolveOccurredOn } from "./dates";

const CLIENT_ID = "6f1c1f0e-8a39-4a1e-9f5e-0d5c0a1b2c3d";
const valid = { clientId: CLIENT_ID, doseStatus: "yes", chips: ["nausea_mild"], text: "mual" };

describe("check-in body schema (1.1)", () => {
  it("accepts a valid body and fills defaults", () => {
    expect(checkinBodySchema.parse(valid)).toEqual(valid);
    expect(checkinBodySchema.parse({ clientId: CLIENT_ID, doseStatus: "no" })).toEqual({
      clientId: CLIENT_ID,
      doseStatus: "no",
      chips: [],
      text: "",
    });
    expect(checkinBodySchema.safeParse({ ...valid, occurredOn: "2026-03-18" }).success).toBe(true);
  });

  it("accepts the three dose statuses", () => {
    for (const doseStatus of ["yes", "no", "partial"]) {
      expect(checkinBodySchema.safeParse({ ...valid, doseStatus }).success, doseStatus).toBe(true);
    }
  });

  it("rejects an invalid dose status", () => {
    expect(checkinBodySchema.safeParse({ ...valid, doseStatus: "maybe" }).success).toBe(false);
    expect(checkinBodySchema.safeParse({ ...valid, doseStatus: undefined }).success).toBe(false);
  });

  it("accepts a 500-character note and rejects 501", () => {
    expect(checkinBodySchema.safeParse({ ...valid, text: "a".repeat(500) }).success).toBe(true);
    expect(checkinBodySchema.safeParse({ ...valid, text: "a".repeat(501) }).success).toBe(false);
  });

  it("rejects a patient identifier and a treatment day", () => {
    expect(checkinBodySchema.safeParse({ ...valid, patientId: CLIENT_ID }).success).toBe(false);
    expect(checkinBodySchema.safeParse({ ...valid, treatmentDay: 99 }).success).toBe(false);
  });

  it("rejects chips that are not a list of strings, and a bad client id or date", () => {
    expect(checkinBodySchema.safeParse({ ...valid, chips: "nausea_mild" }).success).toBe(false);
    expect(checkinBodySchema.safeParse({ ...valid, chips: [1] }).success).toBe(false);
    expect(checkinBodySchema.safeParse({ ...valid, chips: [""] }).success).toBe(false);
    expect(checkinBodySchema.safeParse({ ...valid, chips: Array(31).fill("a") }).success).toBe(false);
    expect(checkinBodySchema.safeParse({ ...valid, clientId: "abc" }).success).toBe(false);
    expect(checkinBodySchema.safeParse({ ...valid, occurredOn: "18-03-2026" }).success).toBe(false);
    expect(checkinBodySchema.safeParse({ ...valid, occurredOn: "2026-02-30" }).success).toBe(false);
  });

  it("accepts an unknown chip code (the pipeline floors it at YELLOW)", () => {
    expect(checkinBodySchema.safeParse({ ...valid, chips: ["sesuatu_baru"] }).success).toBe(true);
  });
});

describe("occurred-on and treatment day (1.2)", () => {
  it("day 18 for a patient who started on 1 March and checks in on 18 March", () => {
    expect(checkinTreatmentDay("2026-03-01", "2026-03-18")).toBe(18);
  });

  it("an offline check-in made on 3 March and synced on 4 March keeps 3 March and its day", () => {
    const occurredOn = resolveOccurredOn("2026-03-03", "2026-03-04");
    expect(occurredOn).toBe("2026-03-03");
    expect(checkinTreatmentDay("2026-03-01", occurredOn)).toBe(3);
  });

  it("a date in the future becomes the day of receipt", () => {
    expect(resolveOccurredOn("2026-03-05", "2026-03-04")).toBe("2026-03-04");
  });

  it("a date more than 7 days old becomes the day of receipt; exactly 7 is kept", () => {
    expect(resolveOccurredOn("2026-03-01", "2026-03-11")).toBe("2026-03-11"); // 10 days
    expect(resolveOccurredOn("2026-03-03", "2026-03-11")).toBe("2026-03-11"); // 8 days
    expect(resolveOccurredOn("2026-03-04", "2026-03-11")).toBe("2026-03-04"); // 7 days
    expect(resolveOccurredOn("2026-03-11", "2026-03-11")).toBe("2026-03-11"); // today
  });

  it("a missing date is today", () => {
    expect(resolveOccurredOn(undefined, "2026-03-11")).toBe("2026-03-11");
    expect(resolveOccurredOn(null, "2026-03-11")).toBe("2026-03-11");
  });
});
