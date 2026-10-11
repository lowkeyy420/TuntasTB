import { normaliseSentence } from "./normalise";
import {
  LEVELS,
  type CompiledDuration,
  type CompiledEntry,
  type Level,
  type Lexicon,
  type Rules,
  type TriageTable,
} from "./types";

/** Thrown by `loadRules` when the rule files are malformed. `errors` lists every problem. */
export class RulesValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Rule files are invalid:\n- ${errors.join("\n- ")}`);
    this.name = "RulesValidationError";
  }
}

const CODE_RE = /^[a-z][a-z0-9_]*$/;
const DAYS_RE = /^\$1(?:\*(\d+))?$/;

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isLevel = (v: unknown): v is Level => LEVELS.includes(v as Level);

/** Checks a list of phrases; each must hold at least one token once normalised. */
function checkPhrases(path: string, v: unknown, errors: string[]): void {
  if (!Array.isArray(v) || v.length === 0) {
    errors.push(`${path}: harus berupa daftar teks yang tidak kosong`);
    return;
  }
  v.forEach((p, i) => {
    if (!isText(p) || normaliseSentence(p) === "") {
      errors.push(`${path}[${i}]: frasa kosong atau bukan teks`);
    }
  });
}

function checkEntry(path: string, entry: unknown, errors: string[]): void {
  if (!isRecord(entry)) {
    errors.push(`${path}: harus berupa objek`);
    return;
  }
  if (entry.any === undefined && entry.combo === undefined) {
    errors.push(`${path}: perlu "any" atau "combo"`);
  }
  if (entry.any !== undefined) checkPhrases(`${path}.any`, entry.any, errors);
  if (entry.combo !== undefined) {
    if (!Array.isArray(entry.combo) || entry.combo.length < 2) {
      errors.push(`${path}.combo: perlu minimal dua kelompok`);
    } else {
      entry.combo.forEach((g, i) => checkPhrases(`${path}.combo[${i}]`, g, errors));
    }
  }
}

function validateTable(table: unknown, errors: string[]): Set<string> {
  const codes = new Set<string>();
  if (!isRecord(table)) {
    errors.push("triage-table: harus berupa objek");
    return codes;
  }
  for (const key of ["version", "review_status", "fallback_warning_id"]) {
    if (!isText(table[key])) errors.push(`triage-table.${key}: harus berupa teks`);
  }
  if (!isLevel(table.unknown_level) || table.unknown_level === "GREEN") {
    errors.push("triage-table.unknown_level: harus YELLOW atau RED (tidak boleh GREEN)");
  }

  if (!Array.isArray(table.symptoms) || table.symptoms.length === 0) {
    errors.push("triage-table.symptoms: harus berupa daftar yang tidak kosong");
  } else {
    table.symptoms.forEach((s: unknown, i: number) => {
      const path = `triage-table.symptoms[${i}]`;
      if (!isRecord(s) || typeof s.code !== "string" || !CODE_RE.test(s.code)) {
        errors.push(`${path}.code: kode tidak valid`);
        return;
      }
      if (codes.has(s.code)) errors.push(`${path}.code: kode ganda "${s.code}"`);
      codes.add(s.code);
      if (!isLevel(s.level)) errors.push(`${path}.level: level tidak valid`);
      if (!isText(s.label_id)) errors.push(`${path}.label_id: harus berupa teks`);
    });
  }

  if (!Array.isArray(table.duration_rules)) {
    errors.push("triage-table.duration_rules: harus berupa daftar");
  } else {
    table.duration_rules.forEach((r: unknown, i: number) => {
      const path = `triage-table.duration_rules[${i}]`;
      if (!isRecord(r) || !Array.isArray(r.codes) || r.codes.length === 0) {
        errors.push(`${path}.codes: harus berupa daftar kode`);
        return;
      }
      for (const c of r.codes) {
        if (!codes.has(c as string)) errors.push(`${path}.codes: kode tidak dikenal "${String(c)}"`);
      }
      if (!Number.isInteger(r.min_days) || (r.min_days as number) < 1) {
        errors.push(`${path}.min_days: harus bilangan bulat >= 1`);
      }
      if (!isLevel(r.level)) errors.push(`${path}.level: level tidak valid`);
    });
  }

  const levels = table.levels;
  for (const level of LEVELS) {
    const text = isRecord(levels) ? levels[level] : undefined;
    if (!isRecord(text) || !isText(text.action_id) || !isText(text.message_id)) {
      errors.push(`triage-table.levels.${level}: perlu action_id dan message_id`);
    }
  }
  return codes;
}

function validateLexicon(
  lexicon: unknown,
  table: unknown,
  codes: Set<string>,
  errors: string[],
): void {
  if (!isRecord(lexicon)) {
    errors.push("lexicon: harus berupa objek");
    return;
  }
  if (!isText(lexicon.version)) errors.push("lexicon.version: harus berupa teks");

  const chipOnly = new Set<string>();
  if (isRecord(table) && Array.isArray(table.symptoms)) {
    for (const s of table.symptoms) {
      if (isRecord(s) && s.chip_only === true) chipOnly.add(s.code as string);
    }
  }

  const covered = new Set<string>();
  for (const section of ["symptoms", "red_flags"]) {
    const entries = lexicon[section];
    if (!isRecord(entries)) {
      errors.push(`lexicon.${section}: harus berupa objek`);
      continue;
    }
    for (const [code, entry] of Object.entries(entries)) {
      if (!codes.has(code)) {
        errors.push(`lexicon.${section}: kode "${code}" tidak ada di triage-table`);
      }
      covered.add(code);
      checkEntry(`lexicon.${section}.${code}`, entry, errors);
    }
  }
  for (const code of codes) {
    if (!covered.has(code) && !chipOnly.has(code)) {
      errors.push(`lexicon: kode "${code}" tidak punya entri (dan bukan chip_only)`);
    }
  }

  if (lexicon.watch_words !== undefined) checkPhrases("lexicon.watch_words", lexicon.watch_words, errors);
  checkPhrases("lexicon.stop_intent", lexicon.stop_intent, errors);
  checkPhrases("lexicon.stigma", lexicon.stigma, errors);

  if (!Array.isArray(lexicon.durations)) {
    errors.push("lexicon.durations: harus berupa daftar");
    return;
  }
  lexicon.durations.forEach((d: unknown, i: number) => {
    const path = `lexicon.durations[${i}]`;
    if (!isRecord(d) || !isText(d.pattern)) {
      errors.push(`${path}.pattern: harus berupa teks`);
      return;
    }
    let groups = 0;
    try {
      groups = (new RegExp(`${d.pattern}|`).exec("") as RegExpExecArray).length - 1;
    } catch {
      errors.push(`${path}.pattern: regex tidak valid`);
      return;
    }
    if (typeof d.days === "number") {
      if (!Number.isInteger(d.days) || d.days < 1) errors.push(`${path}.days: harus >= 1`);
    } else if (typeof d.days !== "string" || !DAYS_RE.test(d.days)) {
      errors.push(`${path}.days: harus angka atau "$1" / "$1*N"`);
    } else if (groups < 1) {
      errors.push(`${path}.pattern: perlu grup tangkapan untuk "${d.days}"`);
    }
  });
}

/** Returns every problem found in the two rule files; an empty list means valid. */
export function validateRuleData(table: unknown, lexicon: unknown): string[] {
  const errors: string[] = [];
  const codes = validateTable(table, errors);
  validateLexicon(lexicon, table, codes, errors);
  return errors;
}

function compileEntries(entries: Record<string, Lexicon["symptoms"][string]>): CompiledEntry[] {
  return Object.entries(entries).map(([code, e]) => ({
    code,
    any: (e.any ?? []).map(normaliseSentence),
    combo: (e.combo ?? []).map((g) => g.map(normaliseSentence)),
  }));
}

function compileDuration(d: Lexicon["durations"][number]): CompiledDuration {
  const re = new RegExp(`(?<![a-z0-9])(?:${d.pattern})(?![a-z0-9])`, "g");
  if (typeof d.days === "number") return { re, fixed: d.days, mult: 1 };
  const mult = (DAYS_RE.exec(d.days) as RegExpExecArray)[1];
  return { re, fixed: null, mult: mult === undefined ? 1 : Number(mult) };
}

/**
 * Validates the two rule files and pre-normalises them for the engine.
 * Throws `RulesValidationError` listing every problem.
 */
export function loadRules(table: unknown, lexicon: unknown): Rules {
  const errors = validateRuleData(table, lexicon);
  if (errors.length > 0) throw new RulesValidationError(errors);
  const t = table as TriageTable;
  const l = lexicon as Lexicon;
  return {
    table: t,
    lexicon: l,
    version: `${t.version}/${l.version}`,
    levelByCode: new Map(t.symptoms.map((s) => [s.code, s.level])),
    symptomEntries: compileEntries(l.symptoms),
    redFlagEntries: compileEntries(l.red_flags),
    durations: l.durations.map(compileDuration),
    stopIntent: l.stop_intent.map(normaliseSentence),
    stigma: l.stigma.map(normaliseSentence),
    watch: (l.watch_words ?? []).map(normaliseSentence),
  };
}
