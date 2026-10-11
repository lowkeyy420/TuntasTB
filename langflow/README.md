# langflow/

Assets for the self-hosted Langflow instance that runs the LLM work (symptom
extraction and plain-language explanations). Langflow runs **outside** this
project's default Docker Compose stack; containers reach it at
`http://host.docker.internal:7860`.

The LLM never decides a triage level — rules do. The browser never calls
Langflow directly; only the `web` server does, and only with redacted text.

- `flows/` — exported Langflow flow JSON.
- `components/` — custom Python components.
- `scripts/` — deploy / import helpers.

Delivered by `add-symptom-extraction` and later changes.
