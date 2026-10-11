import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { copy } from "@/copy/nurse.id";
import { loadRiskPointsFromDir } from "./points";
import { FACTOR_IDS } from "./types";

const points = loadRiskPointsFromDir(fileURLToPath(new URL("../../../../rules", import.meta.url)));

describe("risk reason copy (add-dropout-risk-score 1.2)", () => {
  it("has a Bahasa text for every factor in the point table", () => {
    for (const id of FACTOR_IDS) {
      expect(copy.risk.reasons[id], id).toBeTruthy();
    }
    expect(Object.keys(copy.risk.reasons).sort()).toEqual([...FACTOR_IDS].sort());
  });

  it("matches the text the scorer and the Langflow component use", () => {
    for (const id of FACTOR_IDS) {
      expect(copy.risk.reasons[id], id).toBe(points.factors[id].text_id);
    }
  });

  it("day-count factors carry the {n} placeholder", () => {
    for (const id of ["consecutive_missed_day", "unresolved_side_effect", "no_checkin"]) {
      expect(copy.risk.reasons[id]).toContain("{n}");
    }
  });

  it("never reassures, doses or names the illness", () => {
    for (const text of Object.values(copy.risk.reasons)) {
      expect(text).not.toMatch(/\b(aman|dosis|mg|tablet|TB|TBC|tuberkulosis)\b/i);
    }
  });
});
