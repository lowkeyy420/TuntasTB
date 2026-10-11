"""Static family templates and variants, and the offline reply they compose.

Sources: the level texts and the standing warning in ``rules/triage-table.json``
and the string literals of the ``reply`` block of ``web/src/copy/family.id.ts``
(read as text; nothing from the web application is executed). The composition
mirrors ``web/src/lib/reply/compose.ts`` for the rules-only (fallback) path.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from . import forbidden as fb
from . import paths

_TOKEN = re.compile(
    r"""(?P<open>(?P<okey>\w+)\s*:\s*\{)"""
    r"""|(?P<close>\})"""
    r"""|(?P<str>(?P<skey>\w+)\s*:\s*"(?P<sval>(?:[^"\\]|\\.)*)")"""
    r"""|(?P<lone>"(?P<lval>(?:[^"\\]|\\.)*)")"""
    r"""|(?P<other>\{)""",
)


def _unescape(s: str) -> str:
    return s.encode("utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8") if "\\" in s else s


def family_reply_strings(path: Path = paths.FAMILY_COPY_PATH) -> dict[str, str]:
    """``{"reply.variants.noSymptom": "...", ...}`` for every string literal in ``copy.reply``."""
    source = path.read_text(encoding="utf-8")
    start = re.search(r"\n  reply:\s*\{", source)
    if not start:
        raise ValueError(f"{path}: no reply block found")
    stack: list[str] = ["reply"]
    out: dict[str, str] = {}
    pos = start.end()
    anon = 0
    while stack:
        m = _TOKEN.search(source, pos)
        if not m:
            raise ValueError(f"{path}: unbalanced reply block")
        pos = m.end()
        if m.group("open"):
            stack.append(m.group("okey"))
        elif m.group("other"):
            stack.append("{")
        elif m.group("close"):
            stack.pop()
        elif m.group("str"):
            out[".".join(k for k in stack if k != "{") + "." + m.group("skey")] = _unescape(m.group("sval"))
        elif m.group("lone"):
            anon += 1
            out[".".join(k for k in stack if k != "{") + f"#{anon}"] = _unescape(m.group("lval"))
    return out


def load_templates(table: dict[str, Any], family_copy: Path | None = paths.FAMILY_COPY_PATH) -> list[dict[str, str]]:
    """Every static family text: ``[{id, text}]``."""
    items: list[dict[str, str]] = []
    for level in ("GREEN", "YELLOW", "RED"):
        for key in ("message_id", "action_id"):
            items.append({"id": f"triage-table.levels.{level}.{key}", "text": table["levels"][level][key]})
    items.append({"id": "triage-table.fallback_warning_id", "text": table["fallback_warning_id"]})
    if family_copy is not None and Path(family_copy).is_file():
        for key, text in family_reply_strings(Path(family_copy)).items():
            items.append({"id": f"family.id.ts:{key}", "text": text})
    return items


def scan_templates(templates: list[dict[str, str]], forbidden: dict[str, list[str]]) -> dict[str, list[dict[str, Any]]]:
    """Violations (gating) and neutral-wording findings (reported) over the templates."""
    violations: list[dict[str, Any]] = []
    neutral: list[dict[str, Any]] = []
    for t in templates:
        for v in fb.scan_detail(t["text"], forbidden):
            violations.append({"source": t["id"], "reason": v["reason"], "match": v["match"], "text": t["text"]})
        hits = fb.neutral_wording_hits(t["text"])
        if hits:
            neutral.append({"source": t["id"], "terms": hits, "text": t["text"]})
    return {"violations": violations, "neutral_wording": neutral}


def template_lookup(templates: list[dict[str, str]]) -> dict[str, str]:
    return {t["id"]: t["text"] for t in templates}


def compose_offline_reply(level: str, templates: list[dict[str, str]], *, no_symptom: bool,
                          dose_missed: bool, stop_intent: bool) -> str:
    """The rules-only family reply text (explanation, action, warning), as ``composeReply``."""
    t = template_lookup(templates)
    variant = "family.id.ts:reply.variants."
    if level == "GREEN" and no_symptom and f"{variant}noSymptom" in t:
        explanation = t[f"{variant}doseMissed" if dose_missed else f"{variant}noSymptom"]
    else:
        explanation = t[f"triage-table.levels.{level}.message_id"]
    if level == "YELLOW" and stop_intent and f"{variant}stopIntentAction" in t:
        action = t[f"{variant}stopIntentAction"]
    else:
        action = t[f"triage-table.levels.{level}.action_id"]
    return " ".join([explanation, action, t["triage-table.fallback_warning_id"]])
