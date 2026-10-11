"""Explain stage of ``checkin_triage`` (openspec/changes/add-family-reply design).

    ... Triage Rules -> Build Query -> Chroma retriever (top 4) <- Embedding Model
                     -> Explain Sections -> Prompt (explain.id.md)
                     -> Explain Guard <- Language Model (model handle)
                     -> Build Output

* **Build Query** builds the retrieval query from the *labels* of the symptoms the
  rules found and the mood flags, never from the family's sentence, so the note cannot
  steer retrieval.
* **Explain Sections** formats the retrieved corpus chunks (``[section_id: ...]`` and
  ``[label: ...]`` headers, as ``ingest_corpus`` stores them) for the prompt and keeps
  the id -> label map of what was retrieved.
* **Explain Guard** calls the model (with a timeout) and keeps a message only when it
  is short, cites exactly one retrieved section and contains no "aman", dosing or
  diagnosis wording; otherwise the message is empty and the app shows its static
  template. The app's reply filter repeats every check (it is the real gate).

Pure functions need only the standard library so pytest runs without Langflow.
"""

from __future__ import annotations

import json
import re
from typing import Any

MAX_WORDS = 35
MAX_NURSE_LINE = 120
MODEL_TIMEOUT_S = 6.0
TOP_K = 4

_SECTION_ID = re.compile(r"^\s*\[section_id:\s*([^\]\s]+)\s*\]\s*$", re.MULTILINE)
_LABEL = re.compile(r"^\s*\[label:\s*([^\]]+?)\s*\]\s*$", re.MULTILINE)
_FENCE = re.compile(r"^\s*```(?:json|JSON)?\s*(.*?)\s*```\s*$", re.DOTALL)
_DOSE = (re.compile(r"\d+\s*(mg|miligram)\b", re.I), re.compile(r"\d+\s*(tablet|butir|kapsul|pil)\b", re.I))
_REASSURANCE = re.compile(r"\baman\b", re.I)

# Fallback queries when the rules found no symptom (labels are neutral corpus words).
_MOOD_QUERY = {
    "stop_intent": "sudah merasa sehat tetapi pengobatan belum selesai",
    "stigma": "saat pasien merasa malu",
    "boredom": "bosan atau capek berobat",
}
_LEVEL_QUERY = {
    "GREEN": "keluhan ringan saat minum obat",
    "YELLOW": "keluhan yang perlu diceritakan ke perawat",
    "RED": "yang dilakukan saat ada tanda bahaya",
}


def _labels(codes: list[str], table: dict[str, Any]) -> list[str]:
    by_code = {s.get("code"): s.get("label_id", "") for s in table.get("symptoms", []) if isinstance(s, dict)}
    return [by_code[c] for c in codes if by_code.get(c)]


def build_query(triage: dict[str, Any], extracted: dict[str, Any], table: dict[str, Any]) -> dict[str, Any]:
    """``{"query", "level", "labels", "mood_flags"}`` from rule output only."""
    level = triage.get("level") if triage.get("level") in ("GREEN", "YELLOW", "RED") else "YELLOW"
    codes = [c for c in triage.get("symptoms", []) if isinstance(c, str)]
    labels = _labels(codes, table)
    flags = [f for f in extracted.get("mood_flags", []) if f in _MOOD_QUERY]
    parts = labels + [_MOOD_QUERY[f] for f in flags]
    # The level phrase steers retrieval to the document of the level (ringan / perlu perawat / tanda bahaya).
    query = "; ".join([*parts, _LEVEL_QUERY[level]])
    # Facts for the prompt (labels with stated durations, mood in plain words); still no note text.
    days = {s.get("code"): s.get("duration_days") for s in extracted.get("symptoms", []) if isinstance(s, dict)}
    by_code = {s.get("code"): s.get("label_id", "") for s in table.get("symptoms", []) if isinstance(s, dict)}
    facts = []
    for c in codes:
        if not by_code.get(c):
            continue
        d = days.get(c)
        long_enough = isinstance(d, int) and not isinstance(d, bool) and d >= 2
        facts.append(f"{by_code[c]} ({d} hari)" if long_enough else by_code[c])
    facts += [_MOOD_FACT[f] for f in flags]
    return {"query": query, "level": level, "labels": labels, "mood_flags": flags, "facts": facts}


_MOOD_FACT = {
    "stop_intent": "bilang sudah sembuh atau ingin berhenti minum obat",
    "stigma": "merasa malu atau takut diketahui orang lain",
    "boredom": "bosan atau capek berobat",
}


def parse_chunk(text: str) -> dict[str, Any]:
    text = text or ""
    sid = _SECTION_ID.search(text)
    label = _LABEL.search(text)
    body = _LABEL.sub("", _SECTION_ID.sub("", text)).strip()
    return {"id": sid.group(1) if sid else None, "label": label.group(1) if label else "", "text": body}


def format_sections(chunks: list[str], top_k: int = TOP_K) -> dict[str, Any]:
    """Prompt text for the retrieved sections and the id -> label map (unique ids, in order)."""
    sections: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in chunks:
        c = parse_chunk(raw)
        if not c["id"] or c["id"] in seen:
            continue
        seen.add(c["id"])
        sections.append(c)
        if len(sections) >= top_k:
            break
    text = "\n\n".join(f"[section_id: {s['id']}]\n{s['text']}" for s in sections) or "(tidak ada bagian)"
    return {"text": text, "labels": {s["id"]: s["label"] for s in sections}}


def _json_object(text: str) -> dict[str, Any] | None:
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


def forbidden_terms(lexicon: dict[str, Any]) -> dict[str, list[str]]:
    block = lexicon.get("forbidden_output", {}) if isinstance(lexicon, dict) else {}
    pick = lambda k: [p.lower() for p in block.get(k, []) if isinstance(p, str) and p.strip()]  # noqa: E731
    return {
        "dosing": ["dosis", *pick("dosing")],
        "diagnosis": pick("diagnosis") + pick("conditions"),
        "jargon": pick("jargon"),
    }


def _has_phrase(text: str, phrases: list[str]) -> bool:
    low = f" {re.sub(r'[^a-z0-9]+', ' ', text.lower())} "
    return any(f" {re.sub(r'[^a-z0-9]+', ' ', p).strip()} " in low for p in phrases if p.strip())


def unsafe_reason(text: str, terms: dict[str, list[str]]) -> str | None:
    if _REASSURANCE.search(text):
        return "reassurance"
    if any(p.search(text) for p in _DOSE) or _has_phrase(text, terms["dosing"]):
        return "dosing"
    if _has_phrase(text, terms["diagnosis"]):
        return "diagnosis"
    if _has_phrase(text, terms["jargon"]):
        return "jargon"
    return None


def guard_explanation(model_text: Any, labels: dict[str, str], terms: dict[str, list[str]]) -> dict[str, Any]:
    """``{"family_message", "nurse_line", "citation", "reason"}``; never raises.

    ``citation`` is ``{"id", "label"}`` of a retrieved section or None. Anything doubtful
    empties the message (the app then shows its static template).
    """
    empty = {"family_message": "", "nurse_line": "", "citation": None}
    obj = _json_object(model_text if isinstance(model_text, str) else "")
    if obj is None:
        return {**empty, "reason": "model_output_not_json"}
    nurse = obj.get("nurse_line") if isinstance(obj.get("nurse_line"), str) else ""
    nurse = " ".join(nurse.split())
    if len(nurse) > MAX_NURSE_LINE or (nurse and unsafe_reason(nurse, {**terms, "jargon": []})):
        nurse = ""
    msg = obj.get("family_message") if isinstance(obj.get("family_message"), str) else ""
    msg = " ".join(msg.split())
    cid = obj.get("citation_id") if isinstance(obj.get("citation_id"), str) else ""
    cid = cid.strip()
    out = {**empty, "nurse_line": nurse}
    if not msg:
        return {**out, "reason": "empty_message"}
    if cid not in labels:
        return {**out, "reason": "citation_not_retrieved"}
    if len(msg.split()) > MAX_WORDS:
        return {**out, "reason": "too_long"}
    reason = unsafe_reason(msg, terms)
    if reason:
        return {**out, "reason": reason}
    return {"family_message": msg, "nurse_line": nurse, "citation": {"id": cid, "label": labels[cid]}, "reason": None}


def call_with_timeout(fn: Any, timeout: float, *args: Any) -> Any:
    import concurrent.futures

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        return pool.submit(fn, *args).result(timeout=timeout)
    except concurrent.futures.TimeoutError as e:
        raise TimeoutError(f"no answer within {timeout} s") from e
    finally:
        pool.shutdown(wait=False)


def message_text(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, list):
        return "".join(p if isinstance(p, str) else str(p.get("text", "")) for p in content if isinstance(p, (str, dict)))
    return content if isinstance(content, str) else str(content or "")


def invoke_model(llm: Any, prompt: str, timeout: float) -> tuple[str, str | None]:
    if llm is None:
        return "", "model_missing"
    try:
        return message_text(call_with_timeout(llm.invoke, timeout, prompt)), None
    except TimeoutError:
        return "", "model_timeout"
    except Exception as e:  # noqa: BLE001 - provider errors vary
        return "", f"model_error:{type(e).__name__}"


def _data_dict(value: Any) -> dict[str, Any]:
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


def _chunk_text(item: Any) -> str:
    data = getattr(item, "data", item)
    if isinstance(data, dict):
        return str(data.get("text") or data.get("page_content") or "")
    return str(getattr(item, "text", "") or "")


# --------------------------------------------------------------------------
# Langflow components (defined only when Langflow is installed)
# --------------------------------------------------------------------------

try:  # Langflow 1.7+ (lfx)
    from lfx.custom.custom_component.component import Component
    from lfx.io import DataInput, FloatInput, HandleInput, IntInput, MessageTextInput, MultilineInput, Output
    from lfx.schema.data import Data
    from lfx.schema.message import Message

    _HAS_LANGFLOW = True
except ImportError:
    try:  # older Langflow 1.x
        from langflow.custom import Component
        from langflow.io import DataInput, FloatInput, HandleInput, IntInput, MessageTextInput, MultilineInput, Output
        from langflow.schema import Data
        from langflow.schema.message import Message

        _HAS_LANGFLOW = True
    except ImportError:
        _HAS_LANGFLOW = False

if _HAS_LANGFLOW:

    class BuildQueryComponent(Component):  # type: ignore[misc]
        display_name = "Build Query"
        description = "Retrieval query from the labels of the symptoms the rules found and the mood flags (never the note)."
        icon = "Search"
        name = "TuntasBuildQuery"

        inputs = [
            DataInput(name="triage", display_name="Triage"),
            DataInput(name="extracted", display_name="Extraction"),
            MultilineInput(name="triage_table_json", display_name="Triage table JSON", info="Filled by the deploy script."),
        ]
        outputs = [
            Output(display_name="Query", name="query", method="query_out"),
            Output(display_name="Level", name="level", method="level_out"),
            Output(display_name="Symptoms", name="symptoms", method="symptoms_out"),
        ]

        def _q(self) -> dict:
            if not hasattr(self, "_tuntas_q"):
                g = _data_dict(self.extracted)
                self._tuntas_q = build_query(
                    _data_dict(self.triage), g.get("extracted", {}), json.loads(self.triage_table_json or "{}")
                )
            return self._tuntas_q

        def query_out(self) -> Message:
            self.status = self._q()["query"]
            return Message(text=self._q()["query"])

        def level_out(self) -> Message:
            return Message(text=self._q()["level"])

        def symptoms_out(self) -> Message:
            q = self._q()
            return Message(text="; ".join(q["facts"]) or "(tidak ada keluhan tercatat)")

    class ExplainSectionsComponent(Component):  # type: ignore[misc]
        display_name = "Explain Sections"
        description = "Formats the retrieved corpus sections for the explain prompt and keeps their ids and labels."
        icon = "Library"
        name = "TuntasExplainSections"

        inputs = [
            DataInput(name="search_results", display_name="Search results", is_list=True),
            IntInput(name="top_k", display_name="Top k", value=TOP_K, advanced=True),
        ]
        outputs = [
            Output(display_name="Sections", name="sections", method="sections_out"),
            Output(display_name="Retrieved", name="retrieved", method="retrieved_out"),
        ]

        def _s(self) -> dict:
            if not hasattr(self, "_tuntas_s"):
                items = self.search_results or []
                if not isinstance(items, list):
                    items = [items]
                self._tuntas_s = format_sections([_chunk_text(i) for i in items], int(self.top_k or TOP_K))
            return self._tuntas_s

        def sections_out(self) -> Message:
            return Message(text=self._s()["text"])

        def retrieved_out(self) -> Data:
            self.status = list(self._s()["labels"])
            return Data(data={"labels": self._s()["labels"]})

    class ExplainGuardComponent(Component):  # type: ignore[misc]
        display_name = "Explain Guard"
        description = (
            "Calls the language model with the explain prompt (timeout), keeps the message only when "
            "it cites exactly one retrieved section and has no 'aman', dosing or diagnosis wording."
        )
        icon = "ShieldCheck"
        name = "TuntasExplainGuard"

        inputs = [
            MessageTextInput(name="prompt", display_name="Prompt"),
            HandleInput(name="model", display_name="Language Model", input_types=["LanguageModel"]),
            DataInput(name="retrieved", display_name="Retrieved sections"),
            MultilineInput(name="lexicon_json", display_name="Lexicon JSON", info="Filled by the deploy script."),
            FloatInput(name="timeout", display_name="Model timeout (s)", value=MODEL_TIMEOUT_S, advanced=True),
        ]
        outputs = [Output(display_name="Explanation", name="explanation", method="explanation_out")]

        def explanation_out(self) -> Data:
            labels = _data_dict(self.retrieved).get("labels", {})
            if not labels:
                result = {"family_message": "", "nurse_line": "", "citation": None, "reason": "no_sections"}
            else:
                text, error = invoke_model(self.model, _text(self.prompt), float(self.timeout or MODEL_TIMEOUT_S))
                result = guard_explanation(text, labels, forbidden_terms(json.loads(self.lexicon_json or "{}")))
                if error:
                    result["reason"] = error
            self.status = result["reason"] or "ok"
            return Data(data=result)
