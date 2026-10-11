"""Report writers: one JSON (machine) and one Markdown (human) file per run."""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import paths
from .scoring import pct


def _git(*args: str) -> str | None:
    try:
        out = subprocess.run(["git", *args], cwd=paths.ROOT, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None if out.returncode == 0 else None


def run_meta(mode: str, transport: str, rules_version: str) -> dict[str, Any]:
    """Who ran it, when, on which commit and rules: the eval's own audit trail."""
    dirty = _git("status", "--porcelain")
    return {
        "mode": mode,
        "transport": transport,
        "rules_version": rules_version,
        "git_commit": _git("rev-parse", "HEAD"),
        "git_dirty": bool(dirty),
        "run_by": _git("config", "user.name"),
        "started_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def _n(x: Any) -> str:
    return "n/a" if x is None else str(x)


def render_markdown(report: dict[str, Any]) -> str:
    m = report["metrics"]
    meta = report["meta"]
    gate = report["gate"]
    lines = [
        f"# TuntasTB eval report ({meta['mode']})",
        "",
        f"**Gate: {'PASS' if gate['exit_code'] == 0 else 'FAIL'}** (exit {gate['exit_code']})"
        + (": " + "; ".join(gate["reasons"]) if gate["reasons"] else ""),
        "",
        "| Run | |",
        "| --- | --- |",
        f"| Mode | {meta['mode']} |",
        f"| Transport | {meta['transport']}{' (' + meta['transport_note'] + ')' if meta.get('transport_note') else ''} |",
        f"| Rules version | {meta['rules_version']} |",
        f"| Git commit | {_n(meta.get('git_commit'))}{' (uncommitted changes)' if meta.get('git_dirty') else ''} |",
        f"| Run by | {_n(meta.get('run_by'))} |",
        f"| Started | {_n(meta.get('started_at'))} |",
        f"| Golden cases | {meta['golden_cases']} check-ins, {meta.get('questions', 0)} questions |",
        f"| Clinician-reviewed | {meta['reviewed_cases']} of {meta['golden_cases']} cases are clinician-reviewed |",
        "",
        "## Metrics",
        "",
        "| Metric | Value | Gate |",
        "| --- | --- | --- |",
        f"| RED recall | {pct(m['red_recall'])} ({m['red_hit']}/{m['red_cases']}) | must be 100% |",
        f"| YELLOW precision | {pct(m['yellow_precision'])} | reported |",
        f"| YELLOW/GREEN accuracy | {pct(m['yellow_green_accuracy'])}"
        f"{' (WARNING: below 90% target)' if m['accuracy_warning'] else ''} | target 90%, warning only |",
        f"| Dosing violations | {m['dosing_violations']} | must be 0 |",
        f"| Diagnosis violations | {m['diagnosis_violations']} | must be 0 |",
        f"| \"aman\" violations | {m['reassurance_violations']} | must be 0 |",
        f"| Case must-not-contain hits | {m['must_not_contain_violations']} | must be 0 |",
        f"| Citation coverage (Q&A) | {pct(m['citation_coverage'])} | reported |",
        f"| Family message citation rate | {pct(m['family_citation_rate'])} | reported |",
        f"| Fallback rate | {pct(m['fallback_rate'])}"
        + (f" (invalid output {pct(m.get('invalid_output_rate'))}, model failed inside the flow "
           f"{pct(m.get('model_failure_rate'))})" if m.get("fallback_rate") is not None else "")
        + " | reported |",
        f"| Templates scanned | {m['templates_scanned']} | |",
        f"| Neutral-wording findings | {m['neutral_wording_findings']} | reported |",
        "",
    ]
    if report["red_missed"]:
        lines += ["## Missed RED cases", "", "| Case | Expected | Actual |", "| --- | --- | --- |"]
        lines += [f"| {r['id']} | {r['expected']} | {r['actual']} |" for r in report["red_missed"]]
        lines.append("")
    if report["violations"]:
        lines += ["## Violations", "", "| Source | Reason | Match | Text |", "| --- | --- | --- | --- |"]
        lines += [f"| {v['source']} | {v['reason']} | {v['match']} | {v['text'].replace('|', '/')} |"
                  for v in report["violations"]]
        lines.append("")
    regs = report["regressions"]
    if regs["red"] or regs["other"]:
        lines += ["## Regressions against the baseline", "", "| Case | Baseline | Now | Gating |", "| --- | --- | --- | --- |"]
        lines += [f"| {r['id']} | {r['baseline']} | {r['actual']} (label {r['expected']}) | yes |" for r in regs["red"]]
        lines += [f"| {r['id']} | {r['baseline']} | {r['actual']} | no |" for r in regs["other"]]
        lines.append("")
    if report["neutral_wording"]:
        lines += ["## Neutral-wording findings", ""]
        lines += [f"- {n['source']}: {', '.join(n['terms'])}" for n in report["neutral_wording"]]
        lines.append("")
    lines += ["## Failing cases", ""]
    if report["failing_cases"]:
        lines += ["| Case | Category | Expected | Actual | Problems |", "| --- | --- | --- | --- | --- |"]
        lines += [f"| {f['id']} | {f['category']} | {f['expected']} | {f['actual']} | {'; '.join(f['problems'])} |"
                  for f in report["failing_cases"]]
    else:
        lines.append("None.")
    lines.append("")
    if report.get("questions"):
        lines += ["## Questions", "", "| Question | Expected | Got | Cited | Covered |", "| --- | --- | --- | --- | --- |"]
        lines += [f"| {q['id']} | {q['expected']} | {q['kind']} | {', '.join(q['citations']) or '-'} | "
                  f"{'yes' if q['covered'] else 'NO'} |" for q in report["questions"]]
        lines.append("")
    return "\n".join(lines)


def write_reports(report: dict[str, Any], reports_dir: Path = paths.REPORTS_DIR) -> dict[str, Path]:
    reports_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    mode = report["meta"]["mode"]
    body = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    md = render_markdown(report)
    written = {}
    for name in (f"{mode}-{stamp}", f"latest-{mode}"):
        (reports_dir / f"{name}.json").write_text(body, encoding="utf-8")
        (reports_dir / f"{name}.md").write_text(md, encoding="utf-8")
        written[name] = reports_dir / f"{name}.md"
    return written
