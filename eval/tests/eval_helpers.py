"""Shared helpers for the eval tests (imported as a plain module)."""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

from tuntas_eval import cli, golden, paths


def write_jsonl(path: Path, rows: list) -> Path:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    return path


def case(cid: str, text: str, level: str, category: str = "green", **extra: Any) -> dict:
    expected = {"level": level, **extra.pop("expected", {})}
    return {
        "id": cid,
        "category": category,
        "input": {"dose_status": extra.pop("dose", "yes"), "chips": extra.pop("chips", []), "text": text},
        "expected": expected,
        "review": {"status": "draft", "by": None},
        **extra,
    }


def real_cases() -> list[dict]:
    return golden.load_checkins()


def run_cli(tmp_path: Path, *args: str, golden_rows: list | None = None, rules_dir: Path | None = None,
            baseline: Path | None = None, family_copy: Path | None = None) -> tuple[int, str]:
    """Run the CLI with every output path inside ``tmp_path``."""
    argv = list(args)
    if golden_rows is not None:
        argv += ["--golden", str(write_jsonl(tmp_path / "golden.jsonl", golden_rows))]
    argv += ["--reports-dir", str(tmp_path / "reports")]
    argv += ["--baseline", str(baseline if baseline is not None else tmp_path / "baseline.json")]
    if rules_dir is not None:
        argv += ["--rules-dir", str(rules_dir)]
    if family_copy is not None:
        argv += ["--family-copy", str(family_copy)]
    out = io.StringIO()
    code = cli.main(argv, out=out)
    return code, out.getvalue()


def latest_json(tmp_path: Path, mode: str = "offline") -> dict:
    return json.loads((tmp_path / "reports" / f"latest-{mode}.json").read_text(encoding="utf-8"))


ROOT = paths.ROOT
