"""Input parsing, extraction guarding and output assembly for ``checkin_triage``.

The flow (see ``openspec/changes/add-symptom-extraction/design.md``)::

    Chat Input -> Parse Input -> Prompt (extract.id.md)
               -> Extraction Guard <- Language Model (model handle)
               -> Triage Rules -> Risk Snapshot -> Risk Score
               -> Build Output -> Chat Output

Safety properties enforced here (the language model can only add caution):

* The model is never asked for a level. A ``level`` key in its output is discarded.
* The Extraction Guard calls the model (with a timeout) only when there is a note;
  a model error or timeout becomes ``extraction_failed`` (YELLOW at least), the flow
  still answers.
* Model output that is not a JSON object, or a symptom whose quote is not in the
  redacted text, or a code that is not in the triage table, becomes an *unknown
  symptom*, which the rule component turns into at least YELLOW.
* Invalid input, invalid model output and confidence below ``MIN_CONFIDENCE`` are
  passed to the rule component as unknown symptoms, so the level is still decided
  by ``triage_rules.py`` and can only go up.

Pure functions need only the standard library so pytest can import this module
without Langflow. Langflow loads one ``Component`` class per node from source; the
deploy script keeps the shared helpers and the one class a node needs.
"""

from __future__ import annotations

import json
import re
from typing import Any

DOSE_STATUSES = ("yes", "no", "partial")
MOOD_FLAGS = ("stop_intent", "stigma", "boredom")
LEVELS = ("GREEN", "YELLOW", "RED")
BANDS = ("low", "medium", "high")
MIN_CONFIDENCE = 0.6
MODEL_TIMEOUT_S = 6.5  # + explain stage (6 s) stays inside the app's 15 s budget
MAX_TEXT = 2000
MAX_UNKNOWN_LEN = 120

# Markers passed to the rule component as unknown symptoms (never shown to families).
UNKNOWN_INPUT_INVALID = "input_invalid"
UNKNOWN_EXTRACTION_FAILED = "extraction_failed"
UNKNOWN_LOW_CONFIDENCE = "low_confidence"

_DEFAULT_CONTEXT = {
    "persistence_days": {},
    "consecutive_missed_before": 0,
    "missed_pickup": False,
    "has_pmo": True,
    "days_since_last_checkin": 0,
}
_FENCE = re.compile(r"^\s*```(?:json|JSON)?\s*(.*?)\s*```\s*$", re.DOTALL)
_SPACES = re.compile(r"\s+")


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def call_with_timeout(fn: Any, timeout: float, *args: Any) -> Any:
    """Run a blocking call in a worker thread; raise ``TimeoutError`` after ``timeout`` s."""
    import concurrent.futures

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        return pool.submit(fn, *args).result(timeout=timeout)
    except concurrent.futures.TimeoutError as e:
        raise TimeoutError(f"no answer within {timeout} s") from e
    finally:
        pool.shutdown(wait=False)


def message_text(response: Any) -> str:
    """Text of a LangChain chat-model response (string or list-of-parts content)."""
    content = getattr(response, "content", response)
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict) and isinstance(p.get("text"), str):
                parts.append(p["text"])
        return "".join(parts)
    return content if isinstance(content, str) else str(content or "")


def invoke_model(llm: Any, prompt: str, timeout: float) -> tuple[str, str | None]:
    """``(text, error)``. Never raises: a failed or slow model is an error code."""
    if llm is None:
        return "", "model_missing"
    try:
        return message_text(call_with_timeout(llm.invoke, timeout, prompt)), None
    except TimeoutError:
        return "", "model_timeout"
    except Exception as e:  # noqa: BLE001 - provider errors vary
        # Only a status token is kept (diagnosis of quota vs. unknown model), never the
        # message itself, which could echo the prompt.
        status = next((s for s in _PROVIDER_STATUSES if s in str(e)), None)
        return "", f"model_error:{type(e).__name__}" + (f":{status}" if status else "")


_PROVIDER_STATUSES = ("RESOURCE_EXHAUSTED", "NOT_FOUND", "PERMISSION_DENIED", "INVALID_ARGUMENT",
                      "UNAVAILABLE", "DEADLINE_EXCEEDED", "UNAUTHENTICATED")


# --------------------------------------------------------------------------
# Parse Input
# --------------------------------------------------------------------------


def parse_input(raw: Any) -> dict[str, Any]:
    """Parse the chat input (a JSON object serialised as a string) into flow fields.

    Returns ``{"input": {...}, "errors": [...], "mode": "json" | "text"}``. Plain
    text that does not look like JSON is accepted as the note (playground and MCP
    use). Anything malformed is recorded in ``errors``; the raw text is still kept
    as the note so a red-flag keyword in it is never lost.
    """
    text = "" if raw is None else str(raw)
    errors: list[str] = []
    out: dict[str, Any] = {
        "text": "",
        "chips": [],
        "dose_status": None,
        "treatment_day": None,
        "context": json.loads(json.dumps(_DEFAULT_CONTEXT)),
        "rules_version": None,
    }
    stripped = text.strip()
    if not stripped.startswith("{"):
        out["text"] = stripped[:MAX_TEXT]
        return {"input": out, "errors": errors, "mode": "text"}

    try:
        data = json.loads(stripped)
    except ValueError:
        out["text"] = stripped[:MAX_TEXT]
        return {"input": out, "errors": ["input_not_json"], "mode": "json"}
    if not isinstance(data, dict):
        out["text"] = stripped[:MAX_TEXT]
        return {"input": out, "errors": ["input_not_object"], "mode": "json"}

    note = data.get("text", "")
    if note is None:
        note = ""
    if isinstance(note, str):
        out["text"] = note.strip()[:MAX_TEXT]
    else:
        errors.append("text:not_string")

    chips = data.get("chips", [])
    if isinstance(chips, list) and all(isinstance(c, str) for c in chips):
        out["chips"] = [c.strip() for c in chips if c.strip()]
    else:
        errors.append("chips:not_string_list")

    dose = data.get("dose_status")
    if dose in DOSE_STATUSES:
        out["dose_status"] = dose
    elif dose is not None:
        errors.append("dose_status:invalid")

    day = data.get("treatment_day")
    if _is_int(day) and day >= 0:
        out["treatment_day"] = day
    elif day is not None:
        errors.append("treatment_day:invalid")

    if isinstance(data.get("rules_version"), str):
        out["rules_version"] = data["rules_version"]

    ctx = data.get("context", {})
    if ctx is None:
        ctx = {}
    if not isinstance(ctx, dict):
        errors.append("context:not_object")
        ctx = {}
    pd = ctx.get("persistence_days", {})
    if isinstance(pd, dict) and all(isinstance(k, str) and _is_int(v) and v >= 0 for k, v in pd.items()):
        out["context"]["persistence_days"] = dict(pd)
    else:
        errors.append("context.persistence_days:invalid")
    for key in ("consecutive_missed_before", "days_since_last_checkin"):
        if key in ctx:
            if _is_int(ctx[key]) and ctx[key] >= 0:
                out["context"][key] = ctx[key]
            else:
                errors.append(f"context.{key}:invalid")
    for key in ("missed_pickup", "has_pmo"):
        if key in ctx:
            if isinstance(ctx[key], bool):
                out["context"][key] = ctx[key]
            else:
                errors.append(f"context.{key}:invalid")
    return {"input": out, "errors": errors, "mode": "json"}


# --------------------------------------------------------------------------
# Extraction Guard
# --------------------------------------------------------------------------


def _squash(s: str) -> str:
    return _SPACES.sub(" ", s.lower()).strip()


def _json_object_from_model(text: str) -> dict[str, Any] | None:
    """The JSON object in a model reply (tolerates a code fence and prose around it)."""
    if not isinstance(text, str) or not text.strip():
        return None
    candidate = text.strip()
    m = _FENCE.match(candidate)
    if m:
        candidate = m.group(1)
    try:
        value = json.loads(candidate)
    except ValueError:
        start, end = candidate.find("{"), candidate.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            value = json.loads(candidate[start : end + 1])
        except ValueError:
            return None
    return value if isinstance(value, dict) else None


def _clip(s: str) -> str:
    s = _SPACES.sub(" ", s).strip()
    return s[:MAX_UNKNOWN_LEN]


def empty_extraction(dose_status: str | None) -> dict[str, Any]:
    return {
        "symptoms": [],
        "unknown_symptoms": [],
        "dose_status": dose_status,
        "mood_flags": [],
        "confidence": 0.0,
    }


def guard_extraction(model_text: Any, note: str, known_codes: set[str], dose_status: str | None = None) -> dict[str, Any]:
    """Validate the model's ``extracted`` object strictly and conservatively.

    Returns ``{"ok", "error", "extracted", "discarded_keys", "moved"}`` where
    ``extracted`` always has the exact output-schema shape. With no note there is
    nothing to extract, so the model output is ignored (chips go to the rules as-is).
    """
    if not (note or "").strip():
        extracted = empty_extraction(dose_status)
        extracted["confidence"] = 1.0
        return {"ok": True, "error": None, "extracted": extracted, "discarded_keys": [], "moved": []}
    obj = _json_object_from_model(model_text if isinstance(model_text, str) else "")
    if obj is None:
        return {
            "ok": False,
            "error": "model_output_not_json",
            "extracted": empty_extraction(dose_status),
            "discarded_keys": [],
            "moved": [],
        }
    if isinstance(obj.get("extracted"), dict):
        discarded = sorted(k for k in obj if k != "extracted")
        obj = obj["extracted"]
    else:
        discarded = []
    allowed = {"symptoms", "unknown_symptoms", "dose_status", "mood_flags", "confidence"}
    discarded += sorted(k for k in obj if k not in allowed)

    hay = _squash(note or "")
    symptoms: list[dict[str, Any]] = []
    unknown: list[str] = []
    moved: list[str] = []
    seen: set[str] = set()

    raw_symptoms = obj.get("symptoms", [])
    if not isinstance(raw_symptoms, list):
        raw_symptoms = []
        unknown.append("model_symptoms_invalid")
    for item in raw_symptoms:
        if not isinstance(item, dict) or not isinstance(item.get("code"), str):
            moved.append("invalid_item")
            unknown.append("model_symptom_invalid")
            continue
        code = item["code"].strip()
        quote = item.get("quote") if isinstance(item.get("quote"), str) else ""
        dur = item.get("duration_days")
        dur = dur if _is_int(dur) and 0 <= dur <= 3650 else None
        if code not in known_codes:
            moved.append(f"unknown_code:{code}")
            unknown.append(_clip(quote) or _clip(code))
            continue
        if not quote.strip() or _squash(quote) not in hay:
            moved.append(f"quote_not_in_text:{code}")
            unknown.append(_clip(quote) or _clip(code))
            continue
        if code in seen:
            continue
        seen.add(code)
        symptoms.append({"code": code, "quote": quote.strip(), "duration_days": dur})

    raw_unknown = obj.get("unknown_symptoms", [])
    if isinstance(raw_unknown, list):
        unknown += [_clip(u) for u in raw_unknown if isinstance(u, str) and u.strip()]
    else:
        unknown.append("model_unknown_invalid")
    unknown = list(dict.fromkeys(u for u in unknown if u))

    flags = obj.get("mood_flags", [])
    flags = [f for f in MOOD_FLAGS if isinstance(flags, list) and f in flags]

    model_dose = obj.get("dose_status")
    dose = model_dose if model_dose in DOSE_STATUSES else dose_status

    conf = obj.get("confidence")
    if isinstance(conf, (int, float)) and not isinstance(conf, bool):
        conf = min(1.0, max(0.0, float(conf)))
    else:
        conf = 0.0

    return {
        "ok": True,
        "error": None,
        "extracted": {
            "symptoms": symptoms,
            "unknown_symptoms": unknown,
            "dose_status": dose,
            "mood_flags": flags,
            "confidence": round(conf, 3),
        },
        "discarded_keys": discarded,
        "moved": moved,
    }


def triage_context(parsed: dict[str, Any], guard: dict[str, Any], min_confidence: float = MIN_CONFIDENCE) -> dict[str, Any]:
    """Context object for the Triage Rules component (``context_json``)."""
    ex = guard["extracted"]
    unknown = list(ex["unknown_symptoms"])
    if parsed.get("errors"):
        unknown.append(UNKNOWN_INPUT_INVALID)
    if not guard["ok"]:
        unknown.append(UNKNOWN_EXTRACTION_FAILED)
    elif parsed["input"]["text"] and ex["confidence"] < min_confidence:
        unknown.append(UNKNOWN_LOW_CONFIDENCE)
    return {
        "extracted": [{"code": s["code"], "durationDays": s["duration_days"]} for s in ex["symptoms"]],
        "unknownSymptoms": unknown,
        "persistenceDays": parsed["input"]["context"]["persistence_days"],
    }


def known_codes_from_table(table: Any) -> set[str]:
    return {s["code"] for s in table.get("symptoms", []) if isinstance(s, dict) and isinstance(s.get("code"), str)}


# --------------------------------------------------------------------------
# Risk Snapshot (local mood scan mirrors triage_rules.normalise; parity-tested)
# --------------------------------------------------------------------------

_SENTENCE_SPLIT = re.compile(r"[.!?;\r\n]+")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_REPEATED_LETTERS = re.compile(r"([a-z])\1{2,}")
_SUFFIXES = ("nya", "ku", "mu")


def _stem(token: str) -> str:
    for suffix in _SUFFIXES:
        if token.endswith(suffix) and len(token) - len(suffix) >= 3:
            return token[: len(token) - len(suffix)]
    return token


def normalise_sentence(sentence: str) -> str:
    s = _NON_ALNUM.sub(" ", sentence.lower())
    s = _REPEATED_LETTERS.sub(r"\1", s)
    return " ".join(_stem(t) for t in s.split(" ") if t != "")


def normalise(text: str) -> list[str]:
    sentences = (normalise_sentence(s) for s in _SENTENCE_SPLIT.split(text.lower()))
    return [s for s in sentences if s != ""]


def lexicon_mood_flags(text: str, lexicon: dict[str, Any]) -> list[str]:
    """Mood flags found by the lexicon's ``stop_intent`` and ``stigma`` phrases."""
    sentences = [f" {s} " for s in normalise(text or "")]
    found = []
    for flag in ("stop_intent", "stigma"):
        phrases = [normalise_sentence(p) for p in lexicon.get(flag, [])]
        if any(f" {p} " in s for s in sentences for p in phrases if p):
            found.append(flag)
    return found


def build_snapshot(parsed: dict[str, Any], extracted: dict[str, Any], triage: dict[str, Any], lexicon: dict[str, Any]) -> dict[str, Any]:
    """Risk snapshot (camelCase, as ``risk_score.score_risk`` expects).

    Mood flags are OR-ed: the model's flags plus the lexicon scan of the note.
    """
    inp = parsed["input"]
    ctx = inp["context"]
    flags = set(extracted.get("mood_flags", [])) | set(lexicon_mood_flags(inp["text"], lexicon))
    durations = [v for v in ctx["persistence_days"].values()]
    durations += [s["duration_days"] for s in extracted.get("symptoms", []) if _is_int(s.get("duration_days"))]
    return {
        "doseStatus": inp["dose_status"] or extracted.get("dose_status"),
        "consecutiveMissedBefore": ctx["consecutive_missed_before"],
        "stopIntent": "stop_intent" in flags,
        "stigma": "stigma" in flags,
        "maxPersistenceDays": max(durations, default=0),
        "level": triage.get("level", "YELLOW"),
        "missedPickup": ctx["missed_pickup"],
        "hasPmo": ctx["has_pmo"],
        "daysSinceLastCheckin": ctx["days_since_last_checkin"],
    }


# --------------------------------------------------------------------------
# Build Output
# --------------------------------------------------------------------------


def build_output(
    parsed: dict[str, Any],
    guard: dict[str, Any],
    triage: dict[str, Any],
    risk: dict[str, Any],
    snapshot: dict[str, Any] | None = None,
    explanation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble the flow output (exact schema of ``checkin_triage.schema.json``).

    ``level`` comes from the triage result only. Missing or malformed triage data
    yields YELLOW, never GREEN. ``explanation`` is the Explain Guard result
    (``family_message``, ``nurse_line``, ``citation: {id, label}``); its citation becomes
    ``citations: [{id, label}]``, and a message without a citation is dropped.
    """
    level = triage.get("level")
    if level not in LEVELS:
        level = "YELLOW"
    extracted = dict(guard["extracted"])
    flags = set(extracted["mood_flags"])
    if snapshot:
        if snapshot.get("stopIntent"):
            flags.add("stop_intent")
        if snapshot.get("stigma"):
            flags.add("stigma")
    extracted["mood_flags"] = [f for f in MOOD_FLAGS if f in flags]

    reasons: list[str] = []
    for code in triage.get("redFlags", []):
        reasons.append(f"red_flag_keyword:{code}")
    for code in triage.get("symptoms", []):
        if code not in triage.get("redFlags", []):
            reasons.append(f"symptom:{code}")
    if triage.get("decidedBy"):
        reasons.append(f"decided_by:{triage['decidedBy']}")
    for u in triage.get("unknown", []):
        reasons.append(f"unknown:{u}")
    for f in extracted["mood_flags"]:
        reasons.append(f"mood:{f}")
    for r in risk.get("reasons", []):
        if isinstance(r, dict) and r.get("factor"):
            reasons.append(f"risk:{r['factor']}")
    if not triage.get("level"):
        reasons.append("triage_missing")

    score = risk.get("score")
    band = risk.get("band")
    family_message, nurse_line, citations = explanation_fields(explanation)
    return {
        "extracted": extracted,
        "level": level,
        "risk": {
            "score": score if _is_int(score) and score >= 0 else 0,
            "band": band if band in BANDS else "low",
        },
        "reasons": list(dict.fromkeys(reasons)),
        "family_message": family_message,
        "nurse_line": nurse_line,
        "citations": citations,
    }


def explanation_fields(explanation: dict[str, Any] | None) -> tuple[str, str, list[dict[str, str]]]:
    """``(family_message, nurse_line, citations)`` from an Explain Guard result."""
    if not isinstance(explanation, dict):
        return "", "", []
    nurse = explanation.get("nurse_line")
    nurse = nurse.strip() if isinstance(nurse, str) else ""
    cite = explanation.get("citation")
    msg = explanation.get("family_message")
    msg = msg.strip() if isinstance(msg, str) else ""
    if not (isinstance(cite, dict) and isinstance(cite.get("id"), str) and cite["id"].strip()):
        return "", nurse, []
    label = cite.get("label") if isinstance(cite.get("label"), str) else ""
    return msg, nurse, ([{"id": cite["id"].strip(), "label": label}] if msg else [])


def _data_dict(value: Any) -> dict[str, Any]:
    """Payload of a Langflow ``Data``/``JSON`` value, a dict, or a JSON string."""
    if value is None:
        return {}
    if isinstance(value, list):
        value = value[0] if value else {}
    data = getattr(value, "data", value)
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except ValueError:
            return {}
    return data if isinstance(data, dict) else {}


def _text(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(getattr(value, "text", value) or "")


# --------------------------------------------------------------------------
# Langflow components (defined only when Langflow is installed)
# --------------------------------------------------------------------------

try:  # Langflow 1.7+ (lfx)
    from lfx.custom.custom_component.component import Component
    from lfx.io import DataInput, FloatInput, HandleInput, MessageTextInput, MultilineInput, Output
    from lfx.schema.data import Data
    from lfx.schema.message import Message

    _HAS_LANGFLOW = True
except ImportError:
    try:  # older Langflow 1.x
        from langflow.custom import Component
        from langflow.io import DataInput, FloatInput, HandleInput, MessageTextInput, MultilineInput, Output
        from langflow.schema import Data
        from langflow.schema.message import Message

        _HAS_LANGFLOW = True
    except ImportError:
        _HAS_LANGFLOW = False

if _HAS_LANGFLOW:

    class ParseInputComponent(Component):  # type: ignore[misc]
        display_name = "Parse Input"
        description = "Check-in JSON string -> redacted note, symptom chips and parsed fields."
        icon = "Braces"
        name = "TuntasParseInput"

        inputs = [
            MessageTextInput(name="input_value", display_name="Input", info="JSON string from the app, or plain text."),
        ]
        outputs = [
            Output(display_name="Note", name="note", method="note_out"),
            Output(display_name="Chips", name="chips", method="chips_out"),
            Output(display_name="Parsed", name="parsed", method="parsed_out"),
        ]

        def _parsed(self) -> dict:
            if not hasattr(self, "_tuntas_parsed"):
                self._tuntas_parsed = parse_input(self.input_value)
            return self._tuntas_parsed

        def note_out(self) -> Message:
            return Message(text=self._parsed()["input"]["text"])

        def chips_out(self) -> Message:
            return Message(text=",".join(self._parsed()["input"]["chips"]))

        def parsed_out(self) -> Data:
            p = self._parsed()
            self.status = f"mode={p['mode']} errors={len(p['errors'])}"
            return Data(data=p)

    class ExtractionGuardComponent(Component):  # type: ignore[misc]
        display_name = "Extraction Guard"
        description = (
            "Calls the language model with the extraction prompt (only when there is a note, "
            "with a timeout), validates its reply strictly, drops any level, moves unquoted or "
            "unknown codes to unknown symptoms, and builds the Triage Rules context."
        )
        icon = "ShieldCheck"
        name = "TuntasExtractionGuard"

        inputs = [
            DataInput(name="parsed", display_name="Parsed input"),
            MessageTextInput(name="prompt", display_name="Prompt"),
            HandleInput(name="model", display_name="Language Model", input_types=["LanguageModel"]),
            MultilineInput(
                name="triage_table_json",
                display_name="Triage table JSON",
                info="Contents of rules/triage-table.json (filled by the deploy script).",
            ),
            FloatInput(name="min_confidence", display_name="Min confidence", value=MIN_CONFIDENCE, advanced=True),
            FloatInput(name="timeout", display_name="Model timeout (s)", value=MODEL_TIMEOUT_S, advanced=True),
        ]
        outputs = [
            Output(display_name="Extracted", name="extracted", method="extracted_out"),
            Output(display_name="Triage context", name="triage_context", method="context_out"),
        ]

        def _guard(self) -> dict:
            if not hasattr(self, "_tuntas_guard"):
                parsed = _data_dict(self.parsed)
                codes = known_codes_from_table(json.loads(self.triage_table_json or "{}"))
                inp = parsed.get("input", {})
                note = inp.get("text", "")
                text, error = "", None
                if note.strip():  # no note: nothing to read, no model call
                    text, error = invoke_model(self.model, _text(self.prompt), float(self.timeout or MODEL_TIMEOUT_S))
                g = guard_extraction(text, note, codes, inp.get("dose_status"))
                if error:
                    g["error"] = error
                self._tuntas_guard = (parsed, g)
            return self._tuntas_guard

        def extracted_out(self) -> Data:
            _, g = self._guard()
            self.status = f"ok={g['ok']} moved={len(g['moved'])} discarded={g['discarded_keys']}"
            return Data(data=g)

        def context_out(self) -> Message:
            parsed, g = self._guard()
            return Message(text=json.dumps(triage_context(parsed, g, float(self.min_confidence or MIN_CONFIDENCE))))

    class RiskSnapshotComponent(Component):  # type: ignore[misc]
        display_name = "Risk Snapshot"
        description = "Builds the Risk Score snapshot from the input context, extraction and triage level."
        icon = "ListChecks"
        name = "TuntasRiskSnapshot"

        inputs = [
            DataInput(name="parsed", display_name="Parsed input"),
            DataInput(name="extracted", display_name="Extraction"),
            DataInput(name="triage", display_name="Triage"),
            MultilineInput(
                name="lexicon_json",
                display_name="Lexicon JSON",
                info="Contents of rules/lexicon.id.json (filled by the deploy script).",
            ),
        ]
        outputs = [Output(display_name="Snapshot", name="snapshot", method="snapshot_out")]

        def snapshot_out(self) -> Message:
            g = _data_dict(self.extracted)
            snap = build_snapshot(
                _data_dict(self.parsed),
                g.get("extracted", {}),
                _data_dict(self.triage),
                json.loads(self.lexicon_json or "{}"),
            )
            self.status = snap
            return Message(text=json.dumps(snap))

    class BuildOutputComponent(Component):  # type: ignore[misc]
        display_name = "Build Output"
        description = "Assembles the checkin_triage JSON. The level is copied from Triage Rules only."
        icon = "PackageCheck"
        name = "TuntasBuildOutput"

        inputs = [
            DataInput(name="parsed", display_name="Parsed input"),
            DataInput(name="extracted", display_name="Extraction"),
            DataInput(name="triage", display_name="Triage"),
            DataInput(name="risk", display_name="Risk"),
            MessageTextInput(name="snapshot", display_name="Risk snapshot", advanced=True),
            DataInput(name="explanation", display_name="Explanation", required=False),
        ]
        outputs = [Output(display_name="Output", name="output", method="output_out")]

        def output_out(self) -> Message:
            snap_text = _text(self.snapshot)
            try:
                snap = json.loads(snap_text) if snap_text else None
            except ValueError:
                snap = None
            result = build_output(
                _data_dict(self.parsed),
                _data_dict(self.extracted),
                _data_dict(self.triage),
                _data_dict(self.risk),
                snap,
                _data_dict(self.explanation) or None,
            )
            self.status = result["level"]
            return Message(text=json.dumps(result, ensure_ascii=False))
