"""Repository paths used by the harness. Nothing here touches the network."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RULES_DIR = ROOT / "rules"
FIXTURES_DIR = RULES_DIR / "fixtures"
EVAL_DIR = ROOT / "eval"
GOLDEN_DIR = EVAL_DIR / "golden"
REPORTS_DIR = EVAL_DIR / "reports"
BASELINE_PATH = EVAL_DIR / "baseline.json"
COMPONENTS_DIR = ROOT / "langflow" / "components"
FLOW_SCHEMA_PATH = ROOT / "langflow" / "flows" / "checkin_triage.schema.json"
MANIFEST_PATH = ROOT / "corpus" / "manifest.json"
FAMILY_COPY_PATH = ROOT / "web" / "src" / "copy" / "family.id.ts"

# The flow's rule components are plain modules; import them by path so the
# harness runs the exact code the Langflow nodes run.
if str(COMPONENTS_DIR) not in sys.path:
    sys.path.insert(0, str(COMPONENTS_DIR))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[Any]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows
