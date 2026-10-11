/**
 * Health-check logic, separated from the route handler so it can be unit
 * tested with injected probes (no real database or network required).
 */

export type ComponentStatus = "up" | "down";
export type OverallStatus = "ok" | "degraded" | "unavailable";

export interface HealthReport {
  status: OverallStatus;
  database: ComponentStatus;
  langflow: ComponentStatus | "disabled";
  httpStatus: number;
}

export interface HealthProbes {
  /** Resolves true when the database answers a trivial query. */
  pingDatabase: () => Promise<boolean>;
  /** Resolves true when Langflow is reachable within the timeout. */
  probeLangflow: () => Promise<boolean>;
  /** When true, Langflow is intentionally not configured (rules-only mode). */
  rulesOnly: boolean;
}

/**
 * Computes the health report:
 * - database down  -> 503 unavailable (regardless of Langflow).
 * - database up, Langflow down or rules-only -> 200 degraded.
 * - everything up  -> 200 ok.
 *
 * The endpoint never returns patient data or secrets.
 */
export async function computeHealth(probes: HealthProbes): Promise<HealthReport> {
  const database: ComponentStatus = (await probes.pingDatabase()) ? "up" : "down";

  if (database === "down") {
    return {
      status: "unavailable",
      database,
      langflow: probes.rulesOnly ? "disabled" : "down",
      httpStatus: 503,
    };
  }

  if (probes.rulesOnly) {
    return { status: "degraded", database, langflow: "disabled", httpStatus: 200 };
  }

  const langflowUp = await probes.probeLangflow();
  if (!langflowUp) {
    return { status: "degraded", database, langflow: "down", httpStatus: 200 };
  }

  return { status: "ok", database, langflow: "up", httpStatus: 200 };
}
