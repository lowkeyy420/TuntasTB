"""Python port of ``web/src/lib/redaction/redact.ts`` and ``lexiconProtectedTerms``.

Used by live mode so the runner never sends unredacted golden text to a flow,
matching what the application sends. The shared fixture
``rules/fixtures/redaction-parity.jsonl`` is run by pytest and by Vitest so the
port cannot drift. JavaScript ``\\b``, ``\\w`` and ``[A-Z]`` are ASCII, hence
``re.ASCII`` on the patterns that use them.
"""

from __future__ import annotations

import re
from typing import Any

PLACEHOLDERS = {
    "email": "[EMAIL]",
    "nik": "[NIK]",
    "phone": "[TELEPON]",
    "address": "[ALAMAT]",
    "name": "[NAMA]",
}

_W = "A-Za-z0-9_"  # JavaScript \w
_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE | re.ASCII)
_NIK_RE = re.compile(r"(?<![0-9])(?:[0-9][\s.-]?){15}[0-9](?![0-9])")
_PHONE_RE = re.compile(rf"(?<![{_W}])(?:\+62|62|0)[\s-]?[0-9](?:[\s-]?[0-9]){{7,11}}(?![{_W}])")
_ADDRESS_KEYWORD_RE = re.compile(rf"(?<![{_W}])(?:[Jj][Ll][Nn]?\.?|[Jj]alan|JALAN)\s+(?=[A-Z0-9])")
_ADDRESS_RTRW_RE = re.compile(
    rf"(?<![{_W}])RT\s*[0-9]{{1,3}}\s*/\s*RW\s*[0-9]{{1,3}}(?![{_W}])", re.IGNORECASE | re.ASCII
)
_NAME_PHRASE_RE = re.compile(
    rf"(?<![{_W}])([Nn]ama saya|saya bernama|[Nn]amanya|[Nn]ama (?:anak|ibu|bapak|suami|istri) saya)\s+"
    r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})"
)
_NAME_BARE_SAYA_RE = re.compile(rf"(?<![{_W}])saya\s+([A-Z][a-z]+)(?![{_W}])")

ADDRESS_MAX_TOKENS = 8
_ADDRESS_WORDS = {"no", "nomor", "rt", "rw", "blok", "gg", "gang", "kel", "kec", "kav", "kavling", "dsn", "ds", "desa"}
_CLAUSE_WORDS = {
    "dan", "lalu", "terus", "tapi", "karena", "sejak", "saya", "aku", "kami", "yang", "dengan",
    "sudah", "belum", "tidak", "ada", "kok", "pas", "waktu", "kemarin", "hari", "tadi", "malam", "pagi",
}
_COMMON_AFTER_SAYA = {
    "mual", "merasa", "sudah", "tidak", "mau", "ingin", "akan", "masih", "baru", "sedang", "belum",
    "pergi", "minum", "makan", "batuk", "demam", "lelah", "pusing", "sakit", "bisa", "harus", "kira",
    "pikir", "rasa", "lagi", "juga", "hanya", "cuma", "punya", "dan", "atau", "tapi", "karena",
}

_LEAD_PUNCT = re.compile("^[(\"'\u2018\u201c]+")
_TRAIL_PUNCT = re.compile("[)\"'\u2019\u201d.;:!?]+$")


def _strip_punct(token: str) -> str:
    return _TRAIL_PUNCT.sub("", _LEAD_PUNCT.sub("", token))


def _redact_addresses(text: str, protected: set[str]) -> str:
    out = ""
    cursor = 0
    pos = 0
    while True:
        m = _ADDRESS_KEYWORD_RE.search(text, pos)
        if not m:
            break
        start = m.start()
        pos = m.end() if m.end() > m.start() else m.start() + 1
        if start < cursor:
            continue
        body_start = m.end()
        seg = re.match(r"[^,\n]*", text[body_start:]).group(0)
        end = -1
        count = 0
        for t in re.finditer(r"\S+", seg):
            core = _strip_punct(t.group(0))
            lower = core.lower()
            if core == "" or count >= ADDRESS_MAX_TOKENS:
                break
            if lower in protected or (count > 0 and lower in _CLAUSE_WORDS):
                break
            shaped = (
                re.match(r"[A-Z]", core) is not None
                or re.search(r"[0-9]", core) is not None
                or (count > 0 and lower in _ADDRESS_WORDS)
            )
            if not shaped:
                break
            count += 1
            end = body_start + t.start() + len(core)
            if re.search(r"[.;:!?]$", t.group(0)) and lower not in _ADDRESS_WORDS:
                break
        if end < 0:
            continue
        out += text[cursor:start] + PLACEHOLDERS["address"]
        cursor = end
        pos = end
    return out + text[cursor:]


def redact(text: str, protected_terms: list[str] | None = None) -> str:
    """Same output as the TypeScript ``redact(text, { protectedTerms })``."""
    protected = {t.lower() for t in (protected_terms or [])}
    out = _EMAIL_RE.sub(PLACEHOLDERS["email"], text)
    out = _NIK_RE.sub(PLACEHOLDERS["nik"], out)
    out = _PHONE_RE.sub(PLACEHOLDERS["phone"], out)
    out = _redact_addresses(out, protected)
    out = _ADDRESS_RTRW_RE.sub(PLACEHOLDERS["address"], out)

    def name_phrase(m: re.Match[str]) -> str:
        phrase, name = m.group(1), m.group(2)
        tokens = re.split(r"\s+", name)
        cut = next((i for i, t in enumerate(tokens) if t.lower() in protected), -1)
        if cut == 0:
            return f"{phrase} {name}"
        kept = "" if cut < 0 else " " + " ".join(tokens[cut:])
        return f"{phrase} {PLACEHOLDERS['name']}{kept}"

    out = _NAME_PHRASE_RE.sub(name_phrase, out)

    def bare_saya(m: re.Match[str]) -> str:
        lower = m.group(1).lower()
        if lower in _COMMON_AFTER_SAYA or lower in protected:
            return m.group(0)
        return f"saya {PLACEHOLDERS['name']}"

    return _NAME_BARE_SAYA_RE.sub(bare_saya, out)


def _entry_terms(entry: dict[str, Any]) -> list[str]:
    terms = list(entry.get("any", []))
    for group in entry.get("combo", []):
        terms.extend(group)
    return terms


def lexicon_protected_terms(lexicon: dict[str, Any]) -> list[str]:
    """Port of ``lexiconProtectedTerms``: every lexicon phrase and each of its words."""
    phrases: list[str] = []
    for section in ("symptoms", "red_flags"):
        for entry in lexicon.get(section, {}).values():
            phrases.extend(_entry_terms(entry))
    phrases += list(lexicon.get("watch_words", [])) + list(lexicon["stop_intent"]) + list(lexicon["stigma"])
    terms: set[str] = set()
    for phrase in phrases:
        lower = phrase.lower()
        terms.add(lower)
        terms.update(re.split(r"\s+", lower))
    return sorted(terms)


def redact_with_lexicon(text: str, lexicon: dict[str, Any]) -> str:
    return redact(text, lexicon_protected_terms(lexicon))
