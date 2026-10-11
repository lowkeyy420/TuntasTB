"""Make ``langflow/components`` importable and expose the shared rule files to tests."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RULES_DIR = ROOT / "rules"
sys.path.insert(0, str(ROOT / "langflow" / "components"))


def read_json(name: str):
    return json.loads((RULES_DIR / name).read_text(encoding="utf-8"))


def read_jsonl(name: str):
    return [
        json.loads(line)
        for line in (RULES_DIR / name).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


@pytest.fixture(scope="session")
def rules_dir() -> Path:
    return RULES_DIR
