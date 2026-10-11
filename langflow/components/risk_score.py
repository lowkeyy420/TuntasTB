"""Dropout-risk scoring for the Langflow ``checkin_triage`` flow.

Python mirror of ``web/src/lib/risk/score.ts``. Both read the same point table
(``rules/risk-points.json``) and must return identical scores, bands and factor
identifiers for every case in ``rules/fixtures/risk-parity.jsonl``.

The score is a sum of documented points. It only orders the nurse's list and
never changes a triage level. Inside the flow the history fields of the snapshot
arrive in the request's ``context`` object, built by the application (the flow
cannot read the database); the score the application stores is always its own.

Pure functions need only the standard library. The Langflow ``Component`` class
is defined only when Langflow is importable. Langflow loads a component from its
source alone, so this file stays self-contained.
"""

from __future__ import annotations

import json
from typing import Any

FACTOR_IDS = (
    "missed_dose_today",
    "consecutive_missed_day",
    "partial_dose",
    "stop_intent",
    "stigma",
    "unresolved_side_effect",
    "yellow_today",
    "red_today",
    "missed_pickup",
    "no_pmo",
    "no_checkin",
)
_NEEDS_MIN_DAYS = ("unresolved_side_effect", "no_checkin")
_BANDS = ("low", "medium", "high")


class RiskPointsError(ValueError):
    """Raised by ``load_risk_points`` when the point table is malformed."""

    def __init__(self, errors: list[str]):
        super().__init__("risk-points.json is invalid:\n- " + "\n- ".join(errors))
        self.errors = errors


def _is_count(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def validate_risk_points(data: Any) -> list[str]:
    """Every problem found in the point table; an empty list means valid."""
    if not isinstance(data, dict):
        return ["risk-points: harus berupa objek"]
    errors: list[str] = []
    if not isinstance(data.get("version"), str) or data["version"] == "":
        errors.append("risk-points.version: harus berupa teks")

    factors = data.get("factors")
    for fid in FACTOR_IDS:
        f = factors.get(fid) if isinstance(factors, dict) else None
        if not isinstance(f, dict):
            errors.append(f"factors.{fid}: tidak ada")
            continue
        if not _is_count(f.get("points")):
            errors.append(f"factors.{fid}.points: harus bilangan bulat >= 0")
        if "cap" in f and not _is_count(f["cap"]):
            errors.append(f"factors.{fid}.cap: harus bilangan bulat >= 0")
        if fid in _NEEDS_MIN_DAYS and not (_is_count(f.get("min_days")) and f["min_days"] >= 1):
            errors.append(f"factors.{fid}.min_days: harus bilangan bulat >= 1")
        if not isinstance(f.get("text_id"), str) or f["text_id"].strip() == "":
            errors.append(f"factors.{fid}.text_id: harus berupa teks")

    bands = data.get("bands")
    if not isinstance(bands, list) or len(bands) < 2:
        errors.append("risk-points.bands: perlu minimal dua band")
        return errors
    previous = -1
    for i, b in enumerate(bands):
        last = i == len(bands) - 1
        if not isinstance(b, dict) or b.get("band") not in _BANDS:
            errors.append(f"bands[{i}].band: harus low, medium atau high")
        elif last and "max" in b:
            errors.append(f"bands[{i}]: band terakhir tidak boleh punya max")
        elif not last and not (_is_count(b.get("max")) and b["max"] > previous):
            errors.append(f"bands[{i}].max: harus bilangan bulat yang naik")
        elif not last:
            previous = b["max"]
    return errors


def load_risk_points(data: Any) -> dict[str, Any]:
    """Validate the point table. Raises ``RiskPointsError``."""
    errors = validate_risk_points(data)
    if errors:
        raise RiskPointsError(errors)
    return data


def band_for(score: int, points: dict[str, Any]) -> str:
    """The first band whose ``max`` is not below the score; the last band has no max."""
    for rule in points["bands"]:
        if "max" not in rule or score <= rule["max"]:
            return rule["band"]
    raise AssertionError("unreachable: validated tables end with an open band")


def score_risk(snapshot: dict[str, Any], points: dict[str, Any]) -> dict[str, Any]:
    """Score a snapshot; same contract as the TypeScript ``scoreRisk``.

    ``snapshot`` uses the same (camelCase) keys as the TypeScript ``RiskSnapshot``.
    """
    f = points["factors"]
    reasons: list[dict[str, Any]] = []

    def add(factor: str, pts: int, n: int = 0) -> None:
        if pts <= 0:
            return
        reasons.append(
            {"factor": factor, "points": pts, "text": f[factor]["text_id"].replace("{n}", str(n))}
        )

    if snapshot["doseStatus"] == "no":
        add("missed_dose_today", f["missed_dose_today"]["points"])
    if snapshot["consecutiveMissedBefore"] > 0:
        raw = snapshot["consecutiveMissedBefore"] * f["consecutive_missed_day"]["points"]
        cap = f["consecutive_missed_day"].get("cap")
        add(
            "consecutive_missed_day",
            raw if cap is None else min(raw, cap),
            snapshot["consecutiveMissedBefore"],
        )
    if snapshot["doseStatus"] == "partial":
        add("partial_dose", f["partial_dose"]["points"])
    if snapshot["stopIntent"]:
        add("stop_intent", f["stop_intent"]["points"])
    if snapshot["stigma"]:
        add("stigma", f["stigma"]["points"])
    if snapshot["maxPersistenceDays"] >= f["unresolved_side_effect"]["min_days"]:
        add("unresolved_side_effect", f["unresolved_side_effect"]["points"], snapshot["maxPersistenceDays"])
    if snapshot["level"] == "YELLOW":
        add("yellow_today", f["yellow_today"]["points"])
    if snapshot["level"] == "RED":
        add("red_today", f["red_today"]["points"])
    if snapshot["missedPickup"]:
        add("missed_pickup", f["missed_pickup"]["points"])
    if not snapshot["hasPmo"]:
        add("no_pmo", f["no_pmo"]["points"])
    if snapshot["daysSinceLastCheckin"] >= f["no_checkin"]["min_days"]:
        add("no_checkin", f["no_checkin"]["points"], snapshot["daysSinceLastCheckin"])

    score = sum(r["points"] for r in reasons)
    return {"score": score, "band": band_for(score, points), "reasons": reasons}


# --------------------------------------------------------------------------
# Langflow component (defined only when Langflow is installed)
# --------------------------------------------------------------------------

try:  # Langflow 1.x
    from langflow.custom import Component
    from langflow.io import MultilineInput, Output
    from langflow.schema import Data

    _HAS_LANGFLOW = True
except ImportError:
    try:  # Langflow 1.7+ split packages (lfx)
        from lfx.custom.custom_component.component import Component
        from lfx.io import MultilineInput, Output
        from lfx.schema.data import Data

        _HAS_LANGFLOW = True
    except ImportError:
        _HAS_LANGFLOW = False

if _HAS_LANGFLOW:

    class RiskScoreComponent(Component):  # type: ignore[misc]
        display_name = "Risk Score"
        description = (
            "Transparent dropout-risk score from a snapshot of counts and flags. "
            "Orders the nurse's list; never changes the triage level."
        )
        icon = "Gauge"
        name = "RiskScore"

        inputs = [
            MultilineInput(
                name="risk_points_json",
                display_name="Risk points JSON",
                info="Contents of rules/risk-points.json (filled by the deploy script).",
            ),
            MultilineInput(
                name="snapshot_json",
                display_name="Snapshot JSON",
                info=(
                    "JSON built by the application from its own history: doseStatus, "
                    "consecutiveMissedBefore, stopIntent, stigma, maxPersistenceDays, level, "
                    "missedPickup, hasPmo, daysSinceLastCheckin. Counts and flags only, no text."
                ),
            ),
        ]

        outputs = [Output(display_name="Risk", name="risk", method="run_risk")]

        def run_risk(self) -> Data:
            points = load_risk_points(json.loads(self.risk_points_json))
            result = score_risk(json.loads(self.snapshot_json), points)
            self.status = f"{result['score']} ({result['band']})"
            return Data(data=result)
