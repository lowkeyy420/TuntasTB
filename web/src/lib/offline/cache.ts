import { loadRules } from "@/lib/triage/rules";
import type { Lexicon, Rules, TriageTable } from "@/lib/triage/types";
import { run } from "./idb";

/**
 * Small cached documents so the screen works without a connection once it
 * has been opened online before: the rule bundle (symptom chips and the files
 * behind the provisional reply) and the last family session (consent state,
 * Puskesmas contact, treatment day).
 */

export interface RuleBundle {
  version: string;
  table: TriageTable;
  lexicon: Lexicon;
}

export interface CachedSession {
  consented: boolean;
  treatmentDay: number;
  puskesmasName: string;
  puskesmasPhone: string;
}

interface MetaRow<T> {
  key: string;
  value: T;
  savedAt: number;
}

async function put<T>(key: string, value: T, now: number): Promise<void> {
  const row: MetaRow<T> = { key, value, savedAt: now };
  await run("meta", "readwrite", (s) => s.put(row));
}

async function get<T>(key: string): Promise<MetaRow<T> | undefined> {
  return run<MetaRow<T> | undefined>("meta", "readonly", (s) => s.get(key));
}

export const saveRuleBundle = (bundle: RuleBundle, now = Date.now()) => put("rules", bundle, now);

/** Compiles a bundle into rules; null when the cached or downloaded bundle is not valid. */
export function compileBundle(bundle: RuleBundle): Rules | null {
  try {
    return loadRules(bundle.table, bundle.lexicon);
  } catch {
    return null;
  }
}

export async function loadRuleBundle(): Promise<RuleBundle | null> {
  return (await get<RuleBundle>("rules"))?.value ?? null;
}

const sessionKey = (token: string) => `session:${token}`;

export const saveSession = (token: string, session: CachedSession, now = Date.now()) =>
  put(sessionKey(token), session, now);

/**
 * The last session for this link. The treatment day is moved forward by the
 * whole days since it was cached, so the offline screen shows today's day.
 */
export async function loadSession(
  token: string,
  daysSinceSaved: (savedAt: number) => number,
): Promise<CachedSession | null> {
  const row = await get<CachedSession>(sessionKey(token));
  if (!row) return null;
  return { ...row.value, treatmentDay: row.value.treatmentDay + Math.max(0, daysSinceSaved(row.savedAt)) };
}
