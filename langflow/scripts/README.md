# langflow/scripts/

- `deploy_flows.py` — create or update the TuntasTB project, its four flows, MCP tools and
  corpus ingest (`--dry-run`, `--skip-ingest`, `--export`). See `../README.md`.
- `build_flows.py` — one-time authoring of the flow graphs from live node templates
  (read-only against Langflow); writes `../flows/*.json`.
