import { describe, it, expect } from "vitest";
import { computeHealth } from "./health";

describe("computeHealth", () => {
  it("reports ok (200) when database and Langflow are up", async () => {
    const r = await computeHealth({
      pingDatabase: async () => true,
      probeLangflow: async () => true,
      rulesOnly: false,
    });
    expect(r).toMatchObject({
      status: "ok",
      database: "up",
      langflow: "up",
      httpStatus: 200,
    });
  });

  it("reports degraded (200) when Langflow is down", async () => {
    const r = await computeHealth({
      pingDatabase: async () => true,
      probeLangflow: async () => false,
      rulesOnly: false,
    });
    expect(r).toMatchObject({
      status: "degraded",
      database: "up",
      langflow: "down",
      httpStatus: 200,
    });
  });

  it("reports degraded (200) in rules-only mode without probing Langflow", async () => {
    let probed = false;
    const r = await computeHealth({
      pingDatabase: async () => true,
      probeLangflow: async () => {
        probed = true;
        return true;
      },
      rulesOnly: true,
    });
    expect(r).toMatchObject({
      status: "degraded",
      database: "up",
      langflow: "disabled",
      httpStatus: 200,
    });
    expect(probed).toBe(false);
  });

  it("reports unavailable (503) when the database is down", async () => {
    const r = await computeHealth({
      pingDatabase: async () => false,
      probeLangflow: async () => true,
      rulesOnly: false,
    });
    expect(r.status).toBe("unavailable");
    expect(r.httpStatus).toBe(503);
  });
});
