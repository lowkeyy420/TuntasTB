import { describe, expect, it } from "vitest";
import * as riskApi from "./index";

describe("risk public API", () => {
  it("exports the scorer, loaders and helpers", () => {
    for (const name of [
      "scoreRisk",
      "bandFor",
      "loadRiskPoints",
      "loadRiskPointsFromDir",
      "validateRiskPoints",
      "RiskPointsError",
      "detectMoodFlags",
      "mergeMoodFlags",
      "deriveSnapshot",
      "latestPerDay",
      "consecutiveMissedBefore",
      "persistenceDays",
      "symptomCodesFromJson",
      "dayDiff",
      "addDays",
      "jakartaDate",
    ]) {
      expect(riskApi, name).toHaveProperty(name);
    }
    expect(riskApi.FACTOR_IDS).toHaveLength(11);
  });
});
