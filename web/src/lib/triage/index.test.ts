import { describe, expect, it } from "vitest";
import * as triageApi from "./index";

describe("triage public API", () => {
  it("exports the engine, loaders and helpers", () => {
    for (const name of [
      "triage",
      "maxLevel",
      "normalise",
      "normaliseSentence",
      "loadRules",
      "validateRuleData",
      "RulesValidationError",
      "lexiconProtectedTerms",
      "redactAndTriage",
      "matchEntry",
      "parseDurationDays",
    ]) {
      expect(triageApi, name).toHaveProperty(name);
    }
    expect(triageApi.LEVELS).toEqual(["GREEN", "YELLOW", "RED"]);
  });
});
