"""Deterministic triage rules for the Langflow ``checkin_triage`` flow.

Python mirror of ``web/src/lib/triage`` (TypeScript). Both read the same two
rule files (``rules/triage-table.json`` and ``rules/lexicon.id.json``) and must
return identical levels for every case in ``rules/fixtures/parity.jsonl``.

Safety (non-negotiable): rules decide, the highest level wins, any red-flag
keyword is RED even when hedged or negated, and unknown or unmatched input is
never GREEN.

The pure functions live at module level and need nothing but the standard
library, so tests and the offline eval can import this module without Langflow.
The Langflow ``Component`` class at the bottom is defined only when Langflow
is importable. Langflow loads a component from its source alone, so this file
must stay self-contained (no imports from sibling files).
"""

from __future__ import annotations

import json
import re
from typing import Any

LEVELS = ("GREEN", "YELLOW", "RED")
_RANK = {"GREEN": 0, "YELLOW": 1, "RED": 2}

_SENTENCE_SPLIT = re.compile(r"[.!?;\r\n]+")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_REPEATED_LETTERS = re.compile(r"([a-z])\1{2,}")
_SUFFIXES = ("nya", "ku", "mu")
_MIN_STEM = 3
_CODE_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_DAYS_RE = re.compile(r"^\$1(?:\*(\d+))?$")


class RulesValidationError(ValueError):
    """Raised by ``load_rules`` when the rule files are malformed."""

    def __init__(self, errors: list[str]):
        super().__init__("Rule files are invalid:\n- " + "\n- ".join(errors))
        self.errors = errors


# --------------------------------------------------------------------------
# Normalisation (mirrors web/src/lib/triage/normalise.ts step for step)
# --------------------------------------------------------------------------


def _stem(token: str) -> str:
    for suffix in _SUFFIXES:
        if token.endswith(suffix) and len(token) - len(suffix) >= _MIN_STEM:
            return token[: len(token) - len(suffix)]
    return token


def normalise_sentence(sentence: str) -> str:
    """Normalise one sentence (no sentence splitting); tokens joined by one space."""
    s = _NON_ALNUM.sub(" ", sentence.lower())
    s = _REPEATED_LETTERS.sub(r"\1", s)
    return " ".join(_stem(t) for t in s.split(" ") if t != "")


def normalise(text: str) -> list[str]:
    """Normalise free text into non-empty normalised sentences."""
    sentences = (normalise_sentence(s) for s in _SENTENCE_SPLIT.split(text.lower()))
    return [s for s in sentences if s != ""]


# --------------------------------------------------------------------------
# Matching
# --------------------------------------------------------------------------


def has_phrase(sentence: str, phrase: str) -> bool:
    """True when ``phrase`` (already normalised) occurs on token boundaries."""
    return f" {phrase} " in f" {sentence} "


def has_any(sentences: list[str], phrases: list[str]) -> bool:
    return any(has_phrase(s, p) for s in sentences for p in phrases)


def match_entry(sentences: list[str], entry: dict[str, Any]) -> bool:
    """``any``: one phrase occurs. ``combo``: one term per group in one sentence."""
    if has_any(sentences, entry["any"]):
        return True
    if not entry["combo"]:
        return False
    return any(
        all(any(has_phrase(s, p) for p in group) for group in entry["combo"])
        for s in sentences
    )


def match_codes(sentences: list[str], entries: list[dict[str, Any]]) -> list[str]:
    return [e["code"] for e in entries if match_entry(sentences, e)]


def parse_duration_days(sentences: list[str], durations: list[dict[str, Any]]) -> int:
    """Longest duration in days stated in the sentences; 0 when none is stated."""
    best = 0
    for sentence in sentences:
        for d in durations:
            for m in d["re"].finditer(sentence):
                days = d["fixed"] if d["fixed"] is not None else int(m.group(1)) * d["mult"]
                best = max(best, days)
    return best


# --------------------------------------------------------------------------
# Rule loading and validation
# --------------------------------------------------------------------------


def _is_text(v: Any) -> bool:
    return isinstance(v, str) and v.strip() != ""


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _check_phrases(path: str, v: Any, errors: list[str]) -> None:
    if not isinstance(v, list) or len(v) == 0:
        errors.append(f"{path}: harus berupa daftar teks yang tidak kosong")
        return
    for i, p in enumerate(v):
        if not _is_text(p) or normalise_sentence(p) == "":
            errors.append(f"{path}[{i}]: frasa kosong atau bukan teks")


def _check_entry(path: str, entry: Any, errors: list[str]) -> None:
    if not isinstance(entry, dict):
        errors.append(f"{path}: harus berupa objek")
        return
    if "any" not in entry and "combo" not in entry:
        errors.append(f'{path}: perlu "any" atau "combo"')
    if "any" in entry:
        _check_phrases(f"{path}.any", entry["any"], errors)
    if "combo" in entry:
        combo = entry["combo"]
        if not isinstance(combo, list) or len(combo) < 2:
            errors.append(f"{path}.combo: perlu minimal dua kelompok")
        else:
            for i, group in enumerate(combo):
                _check_phrases(f"{path}.combo[{i}]", group, errors)


def _validate_table(table: Any, errors: list[str]) -> set[str]:
    codes: set[str] = set()
    if not isinstance(table, dict):
        errors.append("triage-table: harus berupa objek")
        return codes
    for key in ("version", "review_status", "fallback_warning_id"):
        if not _is_text(table.get(key)):
            errors.append(f"triage-table.{key}: harus berupa teks")
    if table.get("unknown_level") not in ("YELLOW", "RED"):
        errors.append("triage-table.unknown_level: harus YELLOW atau RED (tidak boleh GREEN)")

    symptoms = table.get("symptoms")
    if not isinstance(symptoms, list) or len(symptoms) == 0:
        errors.append("triage-table.symptoms: harus berupa daftar yang tidak kosong")
    else:
        for i, s in enumerate(symptoms):
            path = f"triage-table.symptoms[{i}]"
            code = s.get("code") if isinstance(s, dict) else None
            if not isinstance(code, str) or not _CODE_RE.match(code):
                errors.append(f"{path}.code: kode tidak valid")
                continue
            if code in codes:
                errors.append(f'{path}.code: kode ganda "{code}"')
            codes.add(code)
            if s.get("level") not in LEVELS:
                errors.append(f"{path}.level: level tidak valid")
            if not _is_text(s.get("label_id")):
                errors.append(f"{path}.label_id: harus berupa teks")

    rules = table.get("duration_rules")
    if not isinstance(rules, list):
        errors.append("triage-table.duration_rules: harus berupa daftar")
    else:
        for i, r in enumerate(rules):
            path = f"triage-table.duration_rules[{i}]"
            rule_codes = r.get("codes") if isinstance(r, dict) else None
            if not isinstance(rule_codes, list) or len(rule_codes) == 0:
                errors.append(f"{path}.codes: harus berupa daftar kode")
                continue
            for c in rule_codes:
                if not isinstance(c, str) or c not in codes:
                    errors.append(f'{path}.codes: kode tidak dikenal "{c}"')
            if not _is_int(r.get("min_days")) or r["min_days"] < 1:
                errors.append(f"{path}.min_days: harus bilangan bulat >= 1")
            if r.get("level") not in LEVELS:
                errors.append(f"{path}.level: level tidak valid")

    levels = table.get("levels")
    for level in LEVELS:
        text = levels.get(level) if isinstance(levels, dict) else None
        if not isinstance(text, dict) or not _is_text(text.get("action_id")) or not _is_text(
            text.get("message_id")
        ):
            errors.append(f"triage-table.levels.{level}: perlu action_id dan message_id")
    return codes


def _validate_lexicon(lexicon: Any, table: Any, codes: set[str], errors: list[str]) -> None:
    if not isinstance(lexicon, dict):
        errors.append("lexicon: harus berupa objek")
        return
    if not _is_text(lexicon.get("version")):
        errors.append("lexicon.version: harus berupa teks")

    chip_only: set[str] = set()
    if isinstance(table, dict) and isinstance(table.get("symptoms"), list):
        for s in table["symptoms"]:
            if isinstance(s, dict) and s.get("chip_only") is True:
                chip_only.add(s.get("code"))

    covered: set[str] = set()
    for section in ("symptoms", "red_flags"):
        entries = lexicon.get(section)
        if not isinstance(entries, dict):
            errors.append(f"lexicon.{section}: harus berupa objek")
            continue
        for code, entry in entries.items():
            if code not in codes:
                errors.append(f'lexicon.{section}: kode "{code}" tidak ada di triage-table')
            covered.add(code)
            _check_entry(f"lexicon.{section}.{code}", entry, errors)
    for code in sorted(codes):
        if code not in covered and code not in chip_only:
            errors.append(f'lexicon: kode "{code}" tidak punya entri (dan bukan chip_only)')

    if "watch_words" in lexicon:
        _check_phrases("lexicon.watch_words", lexicon["watch_words"], errors)
    _check_phrases("lexicon.stop_intent", lexicon.get("stop_intent"), errors)
    _check_phrases("lexicon.stigma", lexicon.get("stigma"), errors)

    durations = lexicon.get("durations")
    if not isinstance(durations, list):
        errors.append("lexicon.durations: harus berupa daftar")
        return
    for i, d in enumerate(durations):
        path = f"lexicon.durations[{i}]"
        if not isinstance(d, dict) or not _is_text(d.get("pattern")):
            errors.append(f"{path}.pattern: harus berupa teks")
            continue
        try:
            groups = re.compile(d["pattern"]).groups
        except re.error:
            errors.append(f"{path}.pattern: regex tidak valid")
            continue
        days = d.get("days")
        if _is_int(days):
            if days < 1:
                errors.append(f"{path}.days: harus >= 1")
        elif not isinstance(days, str) or not _DAYS_RE.match(days):
            errors.append(f'{path}.days: harus angka atau "$1" / "$1*N"')
        elif groups < 1:
            errors.append(f'{path}.pattern: perlu grup tangkapan untuk "{days}"')


def validate_rule_data(table: Any, lexicon: Any) -> list[str]:
    """Every problem found in the two rule files; an empty list means valid."""
    errors: list[str] = []
    codes = _validate_table(table, errors)
    _validate_lexicon(lexicon, table, codes, errors)
    return errors


def _compile_entries(entries: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "code": code,
            "any": [normalise_sentence(p) for p in e.get("any", [])],
            "combo": [[normalise_sentence(p) for p in g] for g in e.get("combo", [])],
        }
        for code, e in entries.items()
    ]


def _compile_duration(d: dict[str, Any]) -> dict[str, Any]:
    regex = re.compile(f"(?<![a-z0-9])(?:{d['pattern']})(?![a-z0-9])")
    if isinstance(d["days"], int):
        return {"re": regex, "fixed": d["days"], "mult": 1}
    mult = _DAYS_RE.match(d["days"]).group(1)
    return {"re": regex, "fixed": None, "mult": 1 if mult is None else int(mult)}


def load_rules(table: Any, lexicon: Any) -> dict[str, Any]:
    """Validate and pre-normalise the two rule files. Raises ``RulesValidationError``."""
    errors = validate_rule_data(table, lexicon)
    if errors:
        raise RulesValidationError(errors)
    return {
        "table": table,
        "lexicon": lexicon,
        "version": f"{table['version']}/{lexicon['version']}",
        "level_by_code": {s["code"]: s["level"] for s in table["symptoms"]},
        "symptom_entries": _compile_entries(lexicon["symptoms"]),
        "red_flag_entries": _compile_entries(lexicon["red_flags"]),
        "durations": [_compile_duration(d) for d in lexicon["durations"]],
        "stop_intent": [normalise_sentence(p) for p in lexicon["stop_intent"]],
        "stigma": [normalise_sentence(p) for p in lexicon["stigma"]],
        "watch": [normalise_sentence(p) for p in lexicon.get("watch_words", [])],
    }


# --------------------------------------------------------------------------
# Triage
# --------------------------------------------------------------------------


def max_level(a: str, b: str) -> str:
    """The higher of two levels; never lower than either input."""
    return a if _RANK[a] >= _RANK[b] else b


def triage(input_: dict[str, Any], rules: dict[str, Any]) -> dict[str, Any]:
    """Deterministic triage; same contract as the TypeScript ``triage``.

    ``input_`` uses the same (camelCase) keys as the TypeScript ``TriageInput``:
    ``chips``, ``text``, ``extracted``, ``unknownSymptoms``, ``persistenceDays``.
    """
    sentences = normalise(input_.get("text") or "")
    extracted = input_.get("extracted") or []
    persistence = input_.get("persistenceDays") or {}
    level_by_code = rules["level_by_code"]

    # 1. Collect codes.
    text_symptoms = match_codes(sentences, rules["symptom_entries"])
    red_flags = sorted(set(match_codes(sentences, rules["red_flag_entries"])))
    claimed = [
        *(input_.get("chips") or []),
        *(e["code"] for e in extracted),
        *text_symptoms,
        *red_flags,
    ]
    known = sorted({c for c in claimed if c in level_by_code})
    unknown = {c for c in claimed if c not in level_by_code}
    unknown.update(input_.get("unknownSymptoms") or [])
    if sentences and not text_symptoms and not red_flags:
        unknown.add("text_unmatched")
    # Watch words only matter when no red flag already decided the level.
    for word in rules["watch"] if not red_flags else []:
        if has_any(sentences, [word]):
            unknown.add(f"watch:{word}")

    # 2. Highest base level.
    base = "GREEN"
    for code in known:
        base = max_level(base, level_by_code[code])

    # 3. Duration rules: longest of text, extraction and history.
    text_days = parse_duration_days(sentences, rules["durations"])
    duration = "GREEN"
    for rule in rules["table"]["duration_rules"]:
        for code in (c for c in rule["codes"] if c in known):
            days = max(
                text_days,
                persistence.get(code) or 0,
                *(e.get("durationDays") or 0 for e in extracted if e["code"] == code),
            )
            if days >= rule["min_days"]:
                duration = max_level(duration, rule["level"])

    # 4. Unknown is never GREEN.
    unknown_level = rules["table"]["unknown_level"] if unknown else "GREEN"

    # 5. Red flags last, unconditionally.
    level = max_level(max_level(base, duration), unknown_level)
    if red_flags:
        level = "RED"

    if red_flags:
        decided_by = "red_flag_keyword"
    elif level == "GREEN" and not known:
        decided_by = "no_symptoms"
    elif level == base:
        decided_by = "table"
    elif level == duration:
        decided_by = "duration_rule"
    else:
        decided_by = "unknown_symptom"

    return {
        "level": level,
        "symptoms": known,
        "redFlags": red_flags,
        "unknown": sorted(unknown),
        "decidedBy": decided_by,
        "rulesVersion": rules["version"],
    }


def level_text(rules: dict[str, Any], level: str) -> dict[str, str]:
    """Static Bahasa action and message for a level, from the triage table."""
    text = rules["table"]["levels"][level]
    return {"action_id": text["action_id"], "message_id": text["message_id"]}


# --------------------------------------------------------------------------
# Langflow component (defined only when Langflow is installed)
# --------------------------------------------------------------------------

try:  # Langflow 1.x
    from langflow.custom import Component
    from langflow.io import MessageTextInput, MultilineInput, Output
    from langflow.schema import Data

    _HAS_LANGFLOW = True
except ImportError:
    try:  # Langflow 1.7+ split packages (lfx)
        from lfx.custom.custom_component.component import Component
        from lfx.io import MessageTextInput, MultilineInput, Output
        from lfx.schema.data import Data

        _HAS_LANGFLOW = True
    except ImportError:
        _HAS_LANGFLOW = False

if _HAS_LANGFLOW:

    class TriageRulesComponent(Component):  # type: ignore[misc]
        display_name = "Triage Rules"
        description = (
            "Deterministic GREEN/YELLOW/RED triage from symptom chips and redacted text. "
            "Rules decide; the highest level wins; red-flag keywords always force RED."
        )
        icon = "ShieldAlert"
        name = "TriageRules"

        inputs = [
            MultilineInput(
                name="triage_table_json",
                display_name="Triage table JSON",
                info="Contents of rules/triage-table.json (filled by the deploy script).",
            ),
            MultilineInput(
                name="lexicon_json",
                display_name="Lexicon JSON",
                info="Contents of rules/lexicon.id.json (filled by the deploy script).",
            ),
            MessageTextInput(
                name="chips",
                display_name="Symptom chips",
                info="Comma-separated symptom codes selected in the UI.",
                value="",
            ),
            MessageTextInput(
                name="text",
                display_name="Redacted text",
                info="Free text, already redacted.",
                value="",
            ),
            MultilineInput(
                name="context_json",
                display_name="Context JSON",
                info=(
                    'Optional JSON: {"extracted": [{"code", "durationDays"}], '
                    '"unknownSymptoms": [], "persistenceDays": {}}'
                ),
                value="{}",
            ),
        ]

        outputs = [Output(display_name="Triage", name="triage", method="run_triage")]

        def run_triage(self) -> Data:
            rules = load_rules(json.loads(self.triage_table_json), json.loads(self.lexicon_json))
            context = json.loads(self.context_json or "{}")
            chips = [c.strip() for c in (self.chips or "").split(",") if c.strip()]
            result = triage({**context, "chips": chips, "text": self.text or ""}, rules)
            result.update(level_text(rules, result["level"]))
            self.status = result["level"]
            return Data(data=result)
