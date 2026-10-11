import { describe, it, expect } from "vitest";
import {
  registrationSchema,
  updateSchema,
  fieldErrors,
} from "./schema";
import { copy } from "@/copy/nurse.id";

const TODAY = "2026-03-18";
const v = copy.patients.validation;

const valid = {
  code: "JKT-0042",
  startDate: "2026-03-01",
  phase: "intensive",
  pickupIntervalDays: 7,
};

function errorsFor(input: unknown): Record<string, string> {
  const r = registrationSchema(TODAY).safeParse(input);
  if (r.success) return {};
  return fieldErrors(r.error);
}

describe("registrationSchema (2.1)", () => {
  it("accepts a valid registration, with and without a PMO phone", () => {
    expect(registrationSchema(TODAY).safeParse(valid).success).toBe(true);
    expect(
      registrationSchema(TODAY).safeParse({ ...valid, pmoPhone: "0812-3456-7890" })
        .success,
    ).toBe(true);
    expect(
      registrationSchema(TODAY).safeParse({ ...valid, pmoPhone: "" }).success,
    ).toBe(true);
  });

  it("names the missing start date in Bahasa", () => {
    const { startDate: _omit, ...rest } = valid;
    void _omit;
    expect(errorsFor(rest)).toEqual({ startDate: v.startDateRequired });
    expect(errorsFor({ ...valid, startDate: "" }).startDate).toBe(
      v.startDateRequired,
    );
  });

  it("rejects a start date in the future but accepts today", () => {
    expect(errorsFor({ ...valid, startDate: "2026-03-19" })).toEqual({
      startDate: v.startDateFuture,
    });
    expect(errorsFor({ ...valid, startDate: TODAY })).toEqual({});
  });

  it("rejects a date that does not exist", () => {
    expect(errorsFor({ ...valid, startDate: "2026-02-31" }).startDate).toBe(
      v.startDateInvalid,
    );
  });

  it("rejects a pickup interval of 0, 61 and a fraction; accepts 1 and 60", () => {
    for (const bad of [0, 61, 7.5, -3]) {
      expect(errorsFor({ ...valid, pickupIntervalDays: bad })).toEqual({
        pickupIntervalDays: v.pickupRange,
      });
    }
    expect(errorsFor({ ...valid, pickupIntervalDays: 1 })).toEqual({});
    expect(errorsFor({ ...valid, pickupIntervalDays: 60 })).toEqual({});
  });

  it("rejects a missing pickup interval", () => {
    const { pickupIntervalDays: _p, ...rest } = valid;
    void _p;
    expect(errorsFor(rest)).toEqual({ pickupIntervalDays: v.pickupRequired });
  });

  it("rejects a code with a space or lowercase letters and shows the format", () => {
    expect(errorsFor({ ...valid, code: "Budi Santoso" })).toEqual({
      code: v.codeFormat,
    });
    expect(errorsFor({ ...valid, code: "jkt-0042" }).code).toBe(v.codeFormat);
  });

  it("enforces code length 3 to 20 and requires a code", () => {
    expect(errorsFor({ ...valid, code: "AB" }).code).toBe(v.codeFormat);
    expect(errorsFor({ ...valid, code: "A".repeat(21) }).code).toBe(v.codeFormat);
    expect(errorsFor({ ...valid, code: "ABC" })).toEqual({});
    expect(errorsFor({ ...valid, code: "A".repeat(20) })).toEqual({});
    expect(errorsFor({ ...valid, code: "" }).code).toBe(v.codeRequired);
  });

  it("rejects an unknown phase", () => {
    expect(errorsFor({ ...valid, phase: "other" }).phase).toBe(v.phaseRequired);
  });

  it("rejects an invalid PMO phone", () => {
    expect(errorsFor({ ...valid, pmoPhone: "abc" }).pmoPhone).toBe(v.pmoInvalid);
  });

  it.each(["name", "dateOfBirth", "address", "nik"])(
    "rejects an extra %s key",
    (key) => {
      const r = registrationSchema(TODAY).safeParse({ ...valid, [key]: "x" });
      expect(r.success).toBe(false);
    },
  );
});

describe("updateSchema (2.5)", () => {
  it("accepts phase and/or pickup interval only", () => {
    expect(updateSchema.safeParse({ phase: "continuation" }).success).toBe(true);
    expect(updateSchema.safeParse({ pickupIntervalDays: 30 }).success).toBe(true);
  });

  it("rejects empty, out-of-range and unknown fields", () => {
    expect(updateSchema.safeParse({}).success).toBe(false);
    expect(updateSchema.safeParse({ pickupIntervalDays: 61 }).success).toBe(false);
    expect(updateSchema.safeParse({ code: "NEW-1" }).success).toBe(false);
    expect(updateSchema.safeParse({ name: "x" }).success).toBe(false);
  });
});
