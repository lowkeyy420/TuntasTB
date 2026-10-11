import type { Rules } from "@/lib/triage/types";
import { compileBundle, loadRuleBundle, saveRuleBundle, type RuleBundle } from "./cache";

/**
 * The rules the check-in screen needs, from the network when possible (and
 * then cached for next time) or from the device's copy when offline. The
 * bundle is the server's own `triage-table.json` and `lexicon.id.json`, so the
 * chips and the provisional reply always come from the same files the server
 * triages with. Returns null when there is neither a connection nor a copy.
 */
export async function loadRulesForScreen(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Rules | null> {
  try {
    const res = await fetchFn("/api/family/rules", {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const bundle = (await res.json()) as RuleBundle;
      const rules = compileBundle(bundle);
      if (rules) {
        await saveRuleBundle(bundle).catch(() => undefined);
        return rules;
      }
    }
  } catch {
    // Offline or a bad response: fall through to the copy on this device.
  }
  try {
    const cached = await loadRuleBundle();
    return cached ? compileBundle(cached) : null;
  } catch {
    return null;
  }
}
