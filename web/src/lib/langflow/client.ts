/**
 * Server-side Langflow client (add-symptom-extraction design, "Web client").
 *
 * `runFlow(name, input)` posts to `<base>/api/v1/run/<name>` with the API key
 * in `x-api-key`, aborts after the timeout (15 s by default) and returns the
 * chat output text, or a reason why there is none. It never throws and never
 * retries: the next check-in is the retry. Only server code imports this
 * module (the key lives in server config), so the browser has no route to
 * Langflow.
 */

export type FlowFailure = "disabled" | "timeout" | "network" | "http" | "shape";
export type FlowResult = { ok: true; text: string } | { ok: false; reason: FlowFailure; status?: number };

export interface FlowClientOptions {
  baseUrl: string;
  /** Empty or undefined: rules-only mode, no request is made. */
  apiKey: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
/** Verified on Langflow 1.12.1 (langflow/README.md). */
export const RUN_PATH = "/api/v1/run/";

export type RunFlow = (name: string, input: unknown, opts?: { timeoutMs?: number }) => Promise<FlowResult>;

/** `outputs[0].outputs[0].results.message.text` of a run response, or null. */
export function chatOutputText(body: unknown): string | null {
  const runs = (body as { outputs?: unknown })?.outputs;
  if (!Array.isArray(runs)) return null;
  for (const run of runs) {
    const outs = (run as { outputs?: unknown })?.outputs;
    if (!Array.isArray(outs)) continue;
    for (const out of outs) {
      const msg = (out as { results?: { message?: { text?: unknown } } })?.results?.message;
      if (msg && typeof msg.text === "string") return msg.text;
    }
  }
  return null;
}

export function createFlowClient(options: FlowClientOptions): RunFlow {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");
  return async (name, input, opts = {}) => {
    if (!options.apiKey) return { ok: false, reason: "disabled" };
    const timeoutMs = opts.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}${RUN_PATH}${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "x-api-key": options.apiKey },
        body: JSON.stringify({
          input_value: typeof input === "string" ? input : JSON.stringify(input),
          input_type: "chat",
          output_type: "chat",
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, reason: "http", status: res.status };
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return controller.signal.aborted ? { ok: false, reason: "timeout" } : { ok: false, reason: "shape" };
      }
      const text = chatOutputText(body);
      return text === null ? { ok: false, reason: "shape" } : { ok: true, text };
    } catch {
      return controller.signal.aborted ? { ok: false, reason: "timeout" } : { ok: false, reason: "network" };
    } finally {
      clearTimeout(timer);
    }
  };
}
