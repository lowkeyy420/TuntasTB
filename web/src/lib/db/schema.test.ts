import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { patients, checkins } from "./schema";

const FORBIDDEN = /(^|_)(name|nama|full_?name)($|_)/i;

describe("schema has no patient-name column", () => {
  it("patients has no name-like column", () => {
    const cols = getTableConfig(patients).columns.map((c) => c.name);
    const offending = cols.filter((c) => FORBIDDEN.test(c));
    expect(offending, `offending columns: ${offending.join(", ")}`).toEqual([]);
  });

  it("checkins has no name-like column", () => {
    const cols = getTableConfig(checkins).columns.map((c) => c.name);
    const offending = cols.filter((c) => FORBIDDEN.test(c));
    expect(offending, `offending columns: ${offending.join(", ")}`).toEqual([]);
  });

  it("patients is identified by a code column", () => {
    const cols = getTableConfig(patients).columns.map((c) => c.name);
    expect(cols).toContain("code");
  });
});
