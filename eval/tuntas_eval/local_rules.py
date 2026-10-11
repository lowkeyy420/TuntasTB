"""Deterministic evaluation of one golden check-in with the flow's own rule code.

Imports ``triage`` (``langflow/components/triage_rules.py``), ``score_risk``
(``risk_score.py``) and the lexicon mood scan (``extract_parse.py``): the same
functions the ``checkin_triage`` flow nodes run. The surrounding steps mirror
the application's pipeline (``web/src/lib/checkin/pipeline.ts``): the raw note is
redacted, triaged both raw and redacted and the higher level kept
(``redactAndTriage``), mood flags come from the redacted note, and the stated
duration counts towards persistence.
"""

from __future__ import annotations

from typing import Any

from . import paths, redaction

import extract_parse  # noqa: E402  (langflow/components, put on sys.path by paths)
import risk_score  # noqa: E402
import triage_rules  # noqa: E402

RANK = {"GREEN": 0, "YELLOW": 1, "RED": 2}


def max_level(*levels: str) -> str:
    return max(levels, key=lambda lv: RANK[lv])


class Rules:
    """The three rule files, loaded and validated once."""

    def __init__(self, table: dict[str, Any] | None = None, lexicon: dict[str, Any] | None = None,
                 risk_points: dict[str, Any] | None = None):
        self.table = table if table is not None else paths.read_json(paths.RULES_DIR / "triage-table.json")
        self.lexicon = lexicon if lexicon is not None else paths.read_json(paths.RULES_DIR / "lexicon.id.json")
        points = risk_points if risk_points is not None else paths.read_json(paths.RULES_DIR / "risk-points.json")
        self.compiled = triage_rules.load_rules(self.table, self.lexicon)
        self.points = risk_score.load_risk_points(points)
        self.protected = redaction.lexicon_protected_terms(self.lexicon)
        self.known_codes = {s["code"] for s in self.table["symptoms"]}

    @property
    def version(self) -> str:
        return self.compiled["version"]

    def redact(self, text: str) -> str:
        return redaction.redact(text, self.protected)


def context_of(case: dict[str, Any]) -> dict[str, Any]:
    ctx = dict(extract_parse._DEFAULT_CONTEXT)  # same defaults as the flow's Parse Input
    ctx["persistence_days"] = {}
    ctx.update(case["input"].get("context") or {})
    return ctx


def local_triage(case: dict[str, Any], rules: Rules) -> dict[str, Any]:
    """``redactAndTriage``: triage raw and redacted text, keep the higher result."""
    inp = case["input"]
    ctx = context_of(case)
    redacted = rules.redact(inp["text"])
    base = {"chips": list(inp["chips"]), "persistenceDays": dict(ctx["persistence_days"])}
    on_redacted = triage_rules.triage({**base, "text": redacted}, rules.compiled)
    on_raw = triage_rules.triage({**base, "text": inp["text"]}, rules.compiled)
    result = on_redacted if max_level(on_raw["level"], on_redacted["level"]) == on_redacted["level"] else on_raw
    return {"result": result, "redacted_text": redacted, "raw_level": on_raw["level"],
            "redacted_level": on_redacted["level"], "context": ctx}


def risk_for(case: dict[str, Any], rules: Rules, local: dict[str, Any], level: str,
             extra_mood_flags: list[str] | tuple[str, ...] = ()) -> dict[str, Any]:
    """Risk the way the app builds today's snapshot (``history.ts`` / ``score.ts``)."""
    ctx = local["context"]
    text = local["redacted_text"]
    flags = set(extract_parse.lexicon_mood_flags(text, rules.lexicon)) | set(extra_mood_flags)
    stated_days = triage_rules.parse_duration_days(triage_rules.normalise(text), rules.compiled["durations"])
    codes = local["result"]["symptoms"]
    persistence = ctx["persistence_days"]
    max_persistence = max([0, *(max(persistence.get(c, 0), stated_days) for c in codes)])
    snapshot = {
        "doseStatus": case["input"]["dose_status"],
        "consecutiveMissedBefore": ctx["consecutive_missed_before"],
        "stopIntent": "stop_intent" in flags,
        "stigma": "stigma" in flags,
        "maxPersistenceDays": max_persistence,
        "level": level,
        "missedPickup": ctx["missed_pickup"],
        "hasPmo": ctx["has_pmo"],
        "daysSinceLastCheckin": ctx["days_since_last_checkin"],
    }
    risk = risk_score.score_risk(snapshot, rules.points)
    order = [f for f in extract_parse.MOOD_FLAGS if f in flags]
    return {"score": risk["score"], "band": risk["band"], "factors": [r["factor"] for r in risk["reasons"]],
            "mood_flags": order}


def evaluate_case(case: dict[str, Any], rules: Rules) -> dict[str, Any]:
    """Offline result for one case: level, red flags, mood flags and risk."""
    local = local_triage(case, rules)
    res = local["result"]
    risk = risk_for(case, rules, local, res["level"])
    return {
        "id": case["id"],
        "category": case["category"],
        "expected": case["expected"]["level"],
        "actual": res["level"],
        "local_level": res["level"],
        "raw_level": local["raw_level"],
        "redacted_level": local["redacted_level"],
        "redacted_text": local["redacted_text"],
        "symptoms": res["symptoms"],
        "red_flags": res["redFlags"],
        "unknown": res["unknown"],
        "decided_by": res["decidedBy"],
        "mood_flags": risk["mood_flags"],
        "risk": {"score": risk["score"], "band": risk["band"], "factors": risk["factors"]},
        "no_symptom": res["level"] == "GREEN" and res["decidedBy"] == "no_symptoms",
    }
