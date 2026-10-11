import "server-only";

import { config } from "@/lib/config";
import { createFlowClient } from "@/lib/langflow/client";
import { flowEnrich, noEnrich, type Enrich } from "./enrich";
import { defaultServiceDeps, type ServiceDeps } from "./service";

/**
 * The production Langflow step: `checkin_triage` when an API key is
 * configured, rules-only mode (`noEnrich`, same result as a flow failure)
 * otherwise. Kept apart from `service.ts` so scripts (the seed) and tests that
 * import the service never pick up the key or call Langflow.
 */
export function liveEnrich(): Enrich {
  if (config.rulesOnly) return noEnrich;
  return flowEnrich(
    createFlowClient({
      baseUrl: config.LANGFLOW_BASE_URL,
      apiKey: config.LANGFLOW_API_KEY,
      timeoutMs: config.LANGFLOW_TIMEOUT_MS,
    }),
  );
}

export function liveServiceDeps(): ServiceDeps {
  return { ...defaultServiceDeps(), enrich: liveEnrich() };
}
