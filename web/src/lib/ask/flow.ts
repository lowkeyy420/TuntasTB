import "server-only";

import { config } from "@/lib/config";
import { FLOW_TIMEOUT_MS } from "./service";
import type { FlowPayload } from "./schema";

export interface FlowOptions {
  baseUrl: string;
  apiKey: string | undefined;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** Endpoint name of the flow in the Langflow project (langflow/README.md). */
export const ASK_FLOW = "ask_guideline";

/**
 * Calls the `ask_guideline` flow over Langflow's REST API and returns the
 * parsed JSON the flow wrote to its chat output. Rejects on missing
 * configuration (rules-only mode), timeout, a non-200 answer or output that
 * is not JSON; the caller turns every rejection into the abstain message.
 * The API key is sent as a header and never logged.
 */
export async function callAskFlow(payload: FlowPayload, opts: FlowOptions): Promise<unknown> {
  if (!opts.apiKey) throw new Error("langflow not configured");
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl.replace(/\/+$/, "")}/api/v1/run/${ASK_FLOW}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey },
    body: JSON.stringify({
      input_value: JSON.stringify(payload),
      input_type: "chat",
      output_type: "chat",
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`langflow status ${res.status}`);
  const body = (await res.json()) as {
    outputs?: { outputs?: { results?: { message?: { text?: unknown } } }[] }[];
  };
  const text = body.outputs?.[0]?.outputs?.[0]?.results?.message?.text;
  if (typeof text !== "string") throw new Error("langflow output missing");
  return JSON.parse(text);
}

/** The route's runner: configuration from the environment, at most 15 s. */
export function runAskFlow(payload: FlowPayload): Promise<unknown> {
  return callAskFlow(payload, {
    baseUrl: config.LANGFLOW_BASE_URL,
    apiKey: config.LANGFLOW_API_KEY,
    timeoutMs: Math.min(config.LANGFLOW_TIMEOUT_MS, FLOW_TIMEOUT_MS),
  });
}
