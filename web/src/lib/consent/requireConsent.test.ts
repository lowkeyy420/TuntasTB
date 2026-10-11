import { describe, it, expect } from "vitest";
import {
  requireConsent,
  recordConsent,
  ConsentRequiredError,
  PatientNotFoundError,
  type ConsentReader,
  type ConsentWriter,
} from "./requireConsent";

describe("requireConsent", () => {
  it("returns the consent timestamp when present", async () => {
    const when = new Date("2024-01-01T00:00:00Z");
    const reader: ConsentReader = { getConsentAt: async () => when };
    await expect(requireConsent(reader, "p1")).resolves.toBe(when);
  });

  it("throws ConsentRequiredError when consent is null", async () => {
    const reader: ConsentReader = { getConsentAt: async () => null };
    await expect(requireConsent(reader, "p1")).rejects.toBeInstanceOf(
      ConsentRequiredError,
    );
  });

  it("throws PatientNotFoundError when the patient is missing", async () => {
    const reader: ConsentReader = { getConsentAt: async () => undefined };
    await expect(requireConsent(reader, "p1")).rejects.toBeInstanceOf(
      PatientNotFoundError,
    );
  });
});

describe("recordConsent", () => {
  it("sets the consent time and writes a consent audit entry", async () => {
    const updates: unknown[] = [];
    const audits: unknown[] = [];
    const tx: ConsentWriter = {
      update: () => ({
        set: (values) => ({
          where: async () => {
            updates.push(values);
          },
        }),
      }),
      insert: () => ({
        values: async (row) => {
          audits.push(row);
        },
      }),
    };
    const now = new Date("2024-02-02T03:04:05Z");
    await recordConsent(tx, "patient-9", now);

    expect(updates).toEqual([{ consentAt: now }]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "patient.consent",
      target: "patient-9",
    });
  });
});
