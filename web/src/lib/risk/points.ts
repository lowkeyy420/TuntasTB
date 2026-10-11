import fs from "node:fs";
import path from "node:path";
import { findRulesDir } from "../triage/loadFiles";
import { FACTOR_IDS, type RiskPoints } from "./types";

const BANDS = ["low", "medium", "high"];
const NEEDS_MIN_DAYS = ["unresolved_side_effect", "no_checkin"];

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0;

/** Thrown by `loadRiskPoints` when `rules/risk-points.json` is malformed. */
export class RiskPointsError extends Error {
  constructor(public readonly errors: string[]) {
    super(`risk-points.json is invalid:\n- ${errors.join("\n- ")}`);
    this.name = "RiskPointsError";
  }
}

/** Every problem found in the point table; an empty list means valid. */
export function validateRiskPoints(data: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(data)) return ["risk-points: harus berupa objek"];
  if (typeof data.version !== "string" || data.version === "") errors.push("risk-points.version: harus berupa teks");

  const factors = data.factors;
  for (const id of FACTOR_IDS) {
    const f = isRecord(factors) ? factors[id] : undefined;
    if (!isRecord(f)) {
      errors.push(`factors.${id}: tidak ada`);
      continue;
    }
    if (!isCount(f.points)) errors.push(`factors.${id}.points: harus bilangan bulat >= 0`);
    if (f.cap !== undefined && !isCount(f.cap)) errors.push(`factors.${id}.cap: harus bilangan bulat >= 0`);
    if (NEEDS_MIN_DAYS.includes(id) && !(Number.isInteger(f.min_days) && (f.min_days as number) >= 1)) {
      errors.push(`factors.${id}.min_days: harus bilangan bulat >= 1`);
    }
    if (typeof f.text_id !== "string" || f.text_id.trim() === "") errors.push(`factors.${id}.text_id: harus berupa teks`);
  }

  const bands = data.bands;
  if (!Array.isArray(bands) || bands.length < 2) {
    errors.push("risk-points.bands: perlu minimal dua band");
    return errors;
  }
  let previous = -1;
  bands.forEach((b: unknown, i: number) => {
    const last = i === bands.length - 1;
    if (!isRecord(b) || !BANDS.includes(b.band as string)) {
      errors.push(`bands[${i}].band: harus low, medium atau high`);
    } else if (last && b.max !== undefined) {
      errors.push(`bands[${i}]: band terakhir tidak boleh punya max`);
    } else if (!last && !(isCount(b.max) && (b.max as number) > previous)) {
      errors.push(`bands[${i}].max: harus bilangan bulat yang naik`);
    } else if (!last) {
      previous = b.max as number;
    }
  });
  return errors;
}

/** Validates the point table. Throws `RiskPointsError` listing every problem. */
export function loadRiskPoints(data: unknown): RiskPoints {
  const errors = validateRiskPoints(data);
  if (errors.length > 0) throw new RiskPointsError(errors);
  return data as RiskPoints;
}

/** Reads and validates `risk-points.json` from the rules directory. */
export function loadRiskPointsFromDir(dir: string = findRulesDir()): RiskPoints {
  return loadRiskPoints(JSON.parse(fs.readFileSync(path.join(dir, "risk-points.json"), "utf8")));
}
