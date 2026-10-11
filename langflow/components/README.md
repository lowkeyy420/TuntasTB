# langflow/components/

Custom Python components for the TuntasTB flows. Pure functions at module level (pytest
imports them without Langflow); Langflow classes behind a guarded import. The deploy
script feeds Langflow one class per node (`deploy_flows.component_source`).

| File | Components (Langflow `name`) | Flow |
| --- | --- | --- |
| `triage_rules.py` | `TriageRules` | checkin_triage |
| `risk_score.py` | `RiskScore` | checkin_triage |
| `extract_parse.py` | `TuntasParseInput`, `TuntasExtractionGuard`, `TuntasRiskSnapshot`, `TuntasBuildOutput` | checkin_triage |
| `ask_parts.py` | `TuntasParseQuestion`, `TuntasRelevanceGate`, `TuntasBuildAnswer` | ask_guideline |
| `queue_reader.py` | `TuntasQueueReader`, `TuntasDigestMerge` | nurse_digest |
| `corpus_ingest.py` | `TuntasCorpusSync`, `TuntasIngestReport` | ingest_corpus |
