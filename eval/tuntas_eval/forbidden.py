"""Violation scanner: the reply filter's content checks, in Python.

Mirrors ``web/src/lib/reply/filter.ts`` (``REASSURANCE``, ``checkNurseLine``,
``hasPhrase``) and reads its phrase lists from the ``forbidden_output`` block of
``rules/lexicon.id.json``. Nothing is imported from the web application; the
shared fixture ``rules/fixtures/forbidden-parity.jsonl`` keeps the two equal.

Order of reasons is the filter's order: reassurance ("aman"), dosing, diagnosis.
The TypeScript filter returns the first failing reason; ``scan`` returns every
reason that applies, so ``scan(text)[0]`` is what TypeScript reports.
"""

from __future__ import annotations

import re
from typing import Any

REASONS = ("reassurance", "dosing", "diagnosis")
KEYS = ("dosing", "diagnosis", "conditions", "jargon", "stop_instructions", "continue_instructions")

# \p{L}\p{N} in the TypeScript regexes = a word character that is not "_".
_EDGE_BEFORE = r"(?<![^\W_])"
_EDGE_AFTER = r"(?![^\W_])"

_REASSURANCE = re.compile(_EDGE_BEFORE + r"aman" + _EDGE_AFTER, re.IGNORECASE)
_DOSE_AMOUNT = re.compile(r"[0-9]+\s*(?:mg|miligram)" + _EDGE_AFTER, re.IGNORECASE)
_DOSE_COUNT = re.compile(r"[0-9]+\s*(?:tablet|butir|kapsul|pil)" + _EDGE_AFTER, re.IGNORECASE)
_NEUTRAL = re.compile(_EDGE_BEFORE + r"(?:TB|TBC|tuberkulosis|TuntasTB)" + _EDGE_AFTER, re.IGNORECASE)

NEUTRAL_TERMS = ("TB", "TBC", "tuberkulosis", "TuntasTB")


class ForbiddenConfigError(ValueError):
    pass


def load_forbidden(lexicon: dict[str, Any]) -> dict[str, list[str]]:
    """The ``forbidden_output`` lists. A missing or malformed block is a config error."""
    block = lexicon.get("forbidden_output") if isinstance(lexicon, dict) else None
    if not isinstance(block, dict):
        raise ForbiddenConfigError("rules/lexicon.id.json has no forbidden_output block")
    out: dict[str, list[str]] = {}
    for key in KEYS:
        items = block.get(key)
        if not isinstance(items, list) or not items or not all(isinstance(s, str) and s.strip() for s in items):
            raise ForbiddenConfigError(f"forbidden_output.{key} must be a non-empty list of phrases")
        out[key] = list(dict.fromkeys(items))
    return out


def phrase_regex(phrases: list[str] | tuple[str, ...]) -> re.Pattern[str]:
    """Whole-word, case-insensitive alternation; whitespace in a phrase matches any run."""
    alts = "|".join(re.sub(r"(\\\s)+|\s+", r"\\s+", re.escape(p.strip())) for p in phrases if p.strip())
    return re.compile(_EDGE_BEFORE + "(?:" + (alts or "(?!)") + ")" + _EDGE_AFTER, re.IGNORECASE)


def _first(pattern: re.Pattern[str], text: str) -> str | None:
    m = pattern.search(text)
    return m.group(0) if m else None


def scan_detail(text: str | None, forbidden: dict[str, list[str]]) -> list[dict[str, str]]:
    """Every violated category with the offending fragment, in the filter's order."""
    body = text or ""
    if body.strip() == "":
        return []
    found: list[dict[str, str]] = []
    hit = _first(_REASSURANCE, body)
    if hit:
        found.append({"reason": "reassurance", "match": hit})
    hit = (
        _first(_DOSE_AMOUNT, body)
        or _first(_DOSE_COUNT, body)
        or _first(phrase_regex(["dosis", *forbidden["dosing"]]), body)
    )
    if hit:
        found.append({"reason": "dosing", "match": hit})
    hit = _first(phrase_regex([*forbidden["diagnosis"], *forbidden["conditions"]]), body)
    if hit:
        found.append({"reason": "diagnosis", "match": hit})
    return found


def scan(text: str | None, forbidden: dict[str, list[str]]) -> list[str]:
    return [v["reason"] for v in scan_detail(text, forbidden)]


def neutral_wording_hits(text: str | None) -> list[str]:
    """Family-visible words that reveal the illness ("TB", "TBC", ...)."""
    return [m.group(0) for m in _NEUTRAL.finditer(text or "")]


def must_not_contain_hits(text: str | None, patterns: list[str]) -> list[str]:
    """Case-specific forbidden phrases found (whole word, case-insensitive)."""
    body = text or ""
    return [p for p in patterns if p.strip() and phrase_regex([p]).search(body)]
