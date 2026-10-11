"""Tasks 6.3, 7.1 and 7.3: Bob configuration and ignore rules."""

from __future__ import annotations

import json
import re
import subprocess

import yaml

from tuntas_eval import paths

BOB = paths.ROOT / ".bob"


def test_mcp_example_shape():
    data = json.loads((BOB / "mcp.example.json").read_text(encoding="utf-8"))
    server = data["mcpServers"]["tuntastb-langflow"]
    assert server["type"] == "streamable-http"
    assert re.fullmatch(r"http://localhost:7860/api/v1/mcp/project/<PROJECT_ID>/streamable", server["url"])
    assert server["headers"] == {"x-api-key": "<LANGFLOW_API_KEY>"}
    assert server["alwaysAllow"] == []


def test_mcp_example_holds_no_real_key_or_project_id():
    text = (BOB / "mcp.example.json").read_text(encoding="utf-8")
    assert not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", text)
    assert not re.search(r"sk-[A-Za-z0-9_-]{10,}", text)
    env = paths.ROOT / ".env"
    if env.is_file():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("LANGFLOW_API_KEY=") and len(line.split("=", 1)[1].strip()) > 4:
                assert line.split("=", 1)[1].strip() not in text


def _modes():
    return yaml.safe_load((BOB / "custom_modes.yaml").read_text(encoding="utf-8"))["customModes"]


def test_auditor_mode_exists_with_four_instruction_blocks():
    mode = next(m for m in _modes() if m["name"] == "Auditor TB")
    assert mode["slug"] == "auditor-tb"
    text = mode["customInstructions"]
    for block in ("## 1. Eval", "## 2. Regression", "## 3. Docs and ops", "## 4. Limits"):
        assert block in text
    for tool in ("checkin_triage", "ask_guideline", "nurse_digest"):
        assert tool in text
    assert "python eval/run_eval.py --mode live" in text
    assert "RED recall" in text and "dosing" in text


def test_auditor_mode_forbids_weakening_the_gate():
    mode = next(m for m in _modes() if m["slug"] == "auditor-tb")
    limits = mode["customInstructions"].split("## 4. Limits", 1)[1]
    assert "Never edit `eval/golden/`, `eval/baseline.json` or anything in `rules/`" in limits
    assert "clinically validated" in limits and "draft" in limits
    assert "always-allow" in mode["customInstructions"]


def test_auditor_mode_cannot_edit_golden_baseline_or_rules():
    mode = next(m for m in _modes() if m["slug"] == "auditor-tb")
    edit = [g for g in mode["groups"] if isinstance(g, list) and g[0] == "edit"]
    assert "edit" not in mode["groups"], "unrestricted edit group"
    assert len(edit) == 1
    rx = re.compile(edit[0][1]["fileRegex"])
    for path in ("eval/golden/checkins.jsonl", "eval/baseline.json", "rules/lexicon.id.json", "langflow/x.py"):
        assert not rx.search(path), path
    assert rx.search("eval/reports/latest-live.md") and rx.search("docs/bob/flows.md")


def test_mode_slugs_are_unique_and_valid():
    slugs = [m["slug"] for m in _modes()]
    assert len(slugs) == len(set(slugs))
    assert all(re.fullmatch(r"[a-zA-Z0-9-]+", s) for s in slugs)


def _ignored(path: str) -> bool:
    res = subprocess.run(["git", "check-ignore", "-q", path], cwd=paths.ROOT)
    return res.returncode == 0


def test_real_bob_config_and_reports_are_ignored():
    assert _ignored(".bob/mcp.json")
    assert _ignored("eval/reports/latest-offline.json")
    assert not _ignored("eval/reports/.gitkeep")
    assert not _ignored(".bob/mcp.example.json")
    assert not _ignored("eval/baseline.json")
