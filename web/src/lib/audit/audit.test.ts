import { describe, it, expect, vi } from "vitest";
import { audit, assertSafeMeta, UnsafeAuditMetaError } from "./audit";
import type { AuditExecutor } from "./audit";

function fakeExecutor(): { exec: AuditExecutor; rows: unknown[] } {
  const rows: unknown[] = [];
  const exec: AuditExecutor = {
    insert: () => ({
      values: async (row) => {
        rows.push(row);
      },
    }),
  };
  return { exec, rows };
}

describe("assertSafeMeta", () => {
  it("rejects a 'text' key", () => {
    expect(() => assertSafeMeta({ text: "hi" })).toThrow(UnsafeAuditMetaError);
  });

  it("rejects a 'token' key", () => {
    expect(() => assertSafeMeta({ token: "abc" })).toThrow(UnsafeAuditMetaError);
  });

  it("rejects a forbidden key nested in an object", () => {
    expect(() => assertSafeMeta({ info: { password: "x" } })).toThrow(
      UnsafeAuditMetaError,
    );
  });

  it("allows identifiers and enums", () => {
    expect(() =>
      assertSafeMeta({ patientId: "uuid", level: "RED", count: 3 }),
    ).not.toThrow();
  });

  it("allows undefined meta", () => {
    expect(() => assertSafeMeta(undefined)).not.toThrow();
  });
});

describe("audit", () => {
  it("writes an entry via the executor", async () => {
    const { exec, rows } = fakeExecutor();
    await audit(exec, {
      actor: "nurse:123",
      action: "patient.read",
      target: "patient-abc",
      meta: { via: "console" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: "nurse:123",
      action: "patient.read",
      target: "patient-abc",
    });
  });

  it("throws and does not write when meta is unsafe", async () => {
    const insert = vi.fn();
    const exec = { insert } as unknown as AuditExecutor;
    await expect(
      audit(exec, {
        actor: "system",
        action: "patient.read",
        target: "p1",
        meta: { token: "secret" },
      }),
    ).rejects.toThrow(UnsafeAuditMetaError);
    expect(insert).not.toHaveBeenCalled();
  });
});
