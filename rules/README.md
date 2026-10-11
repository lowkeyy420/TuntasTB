# rules/

Shared, versioned rule data read by both the TypeScript triage engine in `web/`
and the Langflow Python components. Keeping one copy here guarantees the two
sides make the same decision.

Populated by the `add-triage-rules` change with:

- `triage-table.json` — the fixed GREEN / YELLOW / RED guideline table.
- `lexicon.id.json` — Bahasa Indonesia symptom keywords and red-flag terms.

This directory is copied into the `web` Docker image at build time so the
container reads exactly the files committed here.
