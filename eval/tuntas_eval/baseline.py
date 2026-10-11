"""The committed offline baseline (``eval/baseline.json``)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import paths


def load(path: Path = paths.BASELINE_PATH) -> dict[str, Any] | None:
    if not Path(path).is_file():
        return None
    return json.loads(Path(path).read_text(encoding="utf-8"))


def build(results: list[dict[str, Any]], rules_version: str, mode: str = "offline") -> dict[str, Any]:
    return {
        "rules_version": rules_version,
        "mode": mode,
        "results": {r["id"]: {"expected": r["expected"], "actual": r["actual"]} for r in sorted(results, key=lambda r: r["id"])},
    }


def save(data: dict[str, Any], path: Path = paths.BASELINE_PATH) -> None:
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
