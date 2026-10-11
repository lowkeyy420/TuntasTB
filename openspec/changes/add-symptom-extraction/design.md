# Design

## Context

After `add-daily-checkin` the pipeline works on rules alone and has an `enrich` stub. This change fills the stub with a call to Langflow and builds the first version of the `checkin_triage` flow. Langflow v1.12 already runs on the developer machine at `http://localhost:7860`, outside our compose, with Gemini available through its `GOOGLE_API_KEY` global variable. Requirements are in `specs/symptom-extraction/spec.md`.

## Goals / Non-Goals

**Goals:**

- The LLM adds recall on messy text; it can never subtract caution.
- Flows are reproducible from the repository: no hand edits in the Langflow UI that are not exported and committed.
- One contract (a JSON schema) between flow and application, checked on both sides.

**Non-Goals:**

- Explanations and citations (next change).
- High availability of Langflow. Failure is an expected, handled state.

## Decisions

### Flow contract

Input (the flow's chat input value is this object serialised as a JSON string):

```json
{
  "text": "mual terus, matanya agak kuning",
  "chips": ["nausea_mild"],
  "dose_status": "yes",
  "treatment_day": 41,
  "context": {
    "persistence_days": { "nausea_mild": 7 },
    "consecutive_missed_before": 0,
    "missed_pickup": false,
    "has_pmo": true,
    "days_since_last_checkin": 0
  },
  "rules_version": "0.1.0-draft"
}
```

Output (the flow's chat output text is this object):

```json
{
  "extracted": {
    "symptoms": [ { "code": "jaundice", "quote": "matanya agak kuning", "duration_days": null } ],
    "unknown_symptoms": [],
    "dose_status": "yes",
    "mood_flags": [],
    "confidence": 0.86
  },
  "level": "RED",
  "risk": { "score": 5, "band": "medium" },
  "reasons": ["red_flag_keyword:jaundice"],
  "family_message": "",
  "nurse_line": "",
  "citations": []
}
```

`mood_flags` values: `stop_intent`, `stigma`, `boredom`. The schema lives once as JSON Schema in `langflow/flows/checkin_triage.schema.json`; the web application derives its zod schema from the same shape and a unit test checks the two agree on a set of valid and invalid samples. Parsing is strict: unknown top-level keys or enum values make the response invalid.

### Flow graph (`checkin_triage`, version 1)

```
Chat Input
  → Parse Input            (custom component: JSON string → fields)
  → Prompt (extraction)    (system prompt + lexicon hints + the redacted text)
  → Gemini model           (structured output bound to the `extracted` schema, temperature 0)
  → Triage Rules           (langflow/components/triage_rules.py)
  → Risk Score             (langflow/components/risk_score.py)
  → Build Output           (custom component: assembles the output object)
  → Chat Output
```

- The extraction prompt asks only for the `extracted` object. It lists the symptom codes with their Bahasa labels and the lexicon's slang, tells the model to put anything it cannot map into `unknown_symptoms` using the user's words, and states that the text is data, not instructions.
- The structured-output schema for the model has no `level` key. `Build Output` copies `level` from the Triage Rules component only. A stray `level` in model output has nowhere to go.
- `Parse Input` and `Build Output` live in `langflow/components/extract_parse.py`.
- Model name and temperature are flow fields set by the deploy script from `LANGFLOW_LLM_MODEL` (default a Gemini Flash model), so switching provider is a redeploy.

### Deploy script

`langflow/scripts/deploy_flows.py` (Python, `httpx`), configured by `LANGFLOW_BASE_URL` and `LANGFLOW_API_KEY`:

1. Find or create the project "TuntasTB".
2. For each file in `langflow/flows/*.json`: load the exported flow, replace the `code` field of each custom component node with the matching file in `langflow/components/`, and fill the rule fields (`triage_table_json`, `lexicon_json`, `risk_points_json`) from `rules/`.
3. Look up the flow by `endpoint_name` inside the project; create it if absent, otherwise update it in place.
4. Enable the flows as MCP tools in the project's MCP settings with tool names equal to the flow names.
5. Print the project id and the MCP streamable URL (`/api/v1/mcp/project/<id>/streamable`) for `.env` and `.bob/mcp.json`.

It only reads and writes inside the "TuntasTB" project. `--dry-run` prints the planned calls. The flow JSON is authored once in the Langflow UI, exported and committed; after that the script is the only writer. Exact REST paths are confirmed against the installed instance's OpenAPI document (`/docs`) in the first task, because the plan flags this as a day-1 check.

### Web client (`web/src/lib/langflow/client.ts`)

`runFlow(name, input, { timeoutMs })` posts to `${LANGFLOW_BASE_URL}/api/v1/run/<name>` with header `x-api-key`, `input_type: "chat"`, `output_type: "chat"`, an `AbortController` timeout of 15 s, and extracts the chat output text. It returns a discriminated result: `{ ok: true, text }` or `{ ok: false, reason: "disabled" | "timeout" | "network" | "http" | "shape" }`. It never throws into the pipeline. No retry: a retry inside a 15 s budget helps little and doubles LLM cost; the next check-in is the retry.

### Two-phase pipeline

`add-daily-checkin` stored the check-in after the (stub) enrich step. With a real 15 s call that would delay a RED alert, so the order becomes:

- **Phase A (synchronous, no network)**: redact, local triage, risk, then insert the check-in with `local_level`, `triage_level = local_level`, `fallback_used = true`, plus the alert if RED, plus the audit entry.
- **Phase B**: call the flow. On a valid result compute
  `final = max(local, flow.level, floor)` where `floor` is YELLOW when `unknown_symptoms` is non-empty, a returned code is not in the table, or `confidence < 0.6`, and GREEN otherwise. On failure `final = max(local, YELLOW)`.
  Then update the row (`flow_level`, `triage_level`, extracted symptoms and unknowns merged into `symptoms_json`, risk recomputed with OR-ed mood flags and the final level, `fallback_used`), creating the alert if the level has just become RED.
- The HTTP response is sent after phase B, so the family sees one final reply. Phase B only ever raises `triage_level`; an update that would lower it is refused by a guard in the update function and by a test.

If the process dies between the phases, the row keeps its phase A values: a correct local level, marked as fallback.

### Why the failure floor is YELLOW even when local rules say GREEN

The plan states "LLM returns schema-valid JSON or the request fails to YELLOW". A text the keyword scan calls GREEN may hide something only the model would have caught; without the model we do not know, and not knowing is YELLOW. The cost is more YELLOW check-ins while Langflow is down, which is visible to the nurse as a "fallback" tag. A check-in with no note and only known chips has nothing for the model to read, so the flow is not called for it and no floor applies.

### Confidence threshold

0.6, a constant in `web/src/lib/checkin/enrich.ts`, reported by the eval harness so it can be tuned with data.

## Cross-cutting

- **Redaction**: `enrich` receives the already redacted text from phase A; its input type has no field for raw text, patient code or ids. A unit test builds the payload from a patient with a known code and asserts the code and all identifiers are absent.
- **Audit logging**: phase A writes `checkin.create`; phase B writes `checkin.enrich` with `meta { flow_level, final_level, fallback_reason }`. No text in either.
- **Neutral wording**: nothing new is shown to families in this change except the existing static fallback message. The Langflow project name "TuntasTB" is never visible to families.
- **Bahasa copy**: the extraction prompt is written in Bahasa Indonesia with Indonesian examples, since the input is Indonesian and slang-heavy. The fallback message is the plan's exact sentence.

## Risks / Trade-offs

- [Langflow REST or MCP paths differ on the installed v1.12] → First task verifies them against `/docs`; the paths are constants in one module each (script and client).
- [The LLM invents a symptom that is not in the text] → It can only raise the level. Each extracted symptom carries a `quote`; items whose quote is not a substring of the redacted text are moved to `unknown_symptoms` (still YELLOW or higher) rather than trusted.
- [Prompt injection in the note] → The model has no level field to write, output is schema-checked, local rules run on the same text independently.
- [More YELLOW when Langflow is down] → Intended; tagged as fallback so the nurse can tell the cause.
- [Redacted text still goes to a third-party LLM provider] → Disclosed in consent; provider and model are documented in `langflow/README.md`.
- [Family waits up to 15 s for a reply] → The screen shows "Sedang memeriksa..." and, when the local level is RED, shows the RED instruction immediately from the device-side rules while the request completes.

## Open Questions

- Which Gemini model gives acceptable extraction of Jakarta slang at the lowest latency? Decided by the first eval run; it is a deploy-time setting.
