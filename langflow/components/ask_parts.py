"""Question parsing, relevance gate and answer assembly for ``ask_guideline``.

The flow (see ``openspec/changes/add-guideline-qa/design.md``)::

    Chat Input -> Parse Question -> Chroma (top 4) -> Relevance Gate
               -> Prompt (ask.id.md) -> Build Answer <- Language Model (model handle)
               -> Chat Output

Build Answer calls the model only when the Relevance Gate passed, so a question
with no relevant section abstains without any model call.

Abstaining is the default. ``build_answer`` returns an answer only when the
model did not abstain, the answer is non-empty, every citation is one of the
retrieved section ids, the text has no "aman", dosing or diagnosis wording and it
has at most ``MAX_WORDS`` words. The application repeats these checks against the
corpus manifest (``decide``); this module is defence in depth.

Pure functions need only the standard library so pytest can import this module
without Langflow. Langflow loads one ``Component`` class per node from source; the
deploy script keeps the shared helpers and the one class a node needs.
"""

from __future__ import annotations

import json
import math
import re
from typing import Any

MIN_SCORE = 0.70
TOP_K = 4
MAX_WORDS = 80
MAX_QUESTION = 300
EMBED_TIMEOUT_S = 6.0
MODEL_TIMEOUT_S = 8.0

_SECTION_ID = re.compile(r"^\s*\[section_id:\s*([^\]\s]+)\s*\]\s*$", re.MULTILINE)
_LABEL = re.compile(r"^\s*\[label:\s*([^\]]+?)\s*\]\s*$", re.MULTILINE)
_FENCE = re.compile(r"^\s*```(?:json|JSON)?\s*(.*?)\s*```\s*$", re.DOTALL)

# Used when rules/lexicon.id.json has no ``forbidden_output`` block yet; the block's
# phrases are added on top when present (see add-family-reply).
DEFAULT_FORBIDDEN: dict[str, list[str]] = {
    "reassurance": [r"\baman\b"],
    "dosing": [
        r"\d+\s*(mg|miligram|gram)\b",
        r"\d+\s*(tablet|butir|kapsul|pil|kaplet)\b",
        r"\bdosis\b",
        r"\b(kurangi|dikurangi|mengurangi)\b",
        r"\b(gandakan|digandakan|menggandakan)\b",
        r"\btambah(kan)?\s+(obat|tablet|dosis)\b",
        r"\blewati\s+(obat|dosis)\b",
        r"\bganti\s+obat\b",
    ],
    "diagnosis": [
        r"\banda\s+(menderita|terkena|mengidap)\b",
        r"\b(didiagnosis|diagnosis)\b",
        r"\bini\s+tanda\s+(penyakit|hepatitis)\b",
        r"\b(hepatitis|sirosis|gagal\s+hati|gagal\s+ginjal|kanker|diabetes|hiv|neuropati)\b",
    ],
}


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def parse_question(raw: Any) -> str:
    """``{"question": "..."}`` or plain text -> trimmed question (at most 300 chars)."""
    text = "" if raw is None else str(raw)
    stripped = text.strip()
    if stripped.startswith("{"):
        try:
            data = json.loads(stripped)
        except ValueError:
            data = None
        if isinstance(data, dict):
            q = data.get("question")
            return q.strip()[:MAX_QUESTION] if isinstance(q, str) else ""
    return stripped[:MAX_QUESTION]


def parse_chunk(text: str) -> dict[str, Any]:
    """Section id, label and body of an ingested corpus chunk."""
    text = text or ""
    sid = _SECTION_ID.search(text)
    label = _LABEL.search(text)
    body = _LABEL.sub("", _SECTION_ID.sub("", text)).strip()
    return {
        "id": sid.group(1) if sid else None,
        "label": label.group(1) if label else "",
        "text": body,
    }


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return 0.0 if na == 0 or nb == 0 else dot / (na * nb)


def call_with_timeout(fn: Any, timeout: float, *args: Any) -> Any:
    """Run a blocking call in a worker thread; raise ``TimeoutError`` after ``timeout`` s.

    Embedding and model clients can hang on a stalled connection; the flow must
    abstain instead of holding the request (the application gives up after 15 s).
    """
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
        return "", f"model_error:{type(e).__name__}"


def relevance_gate(chunks: list[dict[str, Any]], scores: list[float], min_score: float = MIN_SCORE, top_k: int = TOP_K) -> dict[str, Any]:
    """Decide whether the retrieved sections are relevant enough to ask the model.

    ``chunks`` are ``parse_chunk`` results in retrieval order, ``scores`` their
    similarity to the question. Chunks without a section id are ignored. Returns
    ``{"passed", "best_score", "min_score", "retrieved", "retrieved_ids"}`` with at
    most ``top_k`` sections, best first, one entry per section id.
    """
    rows = []
    seen: set[str] = set()
    for chunk, score in zip(chunks, scores):
        if not chunk.get("id") or chunk["id"] in seen:
            continue
        seen.add(chunk["id"])
        rows.append({**chunk, "score": round(float(score), 4)})
    rows.sort(key=lambda r: r["score"], reverse=True)
    rows = rows[: max(1, int(top_k))]
    best = rows[0]["score"] if rows else 0.0
    return {
        "passed": bool(rows) and best >= float(min_score),
        "best_score": best,
        "min_score": float(min_score),
        "retrieved": rows,
        "retrieved_ids": [r["id"] for r in rows],
    }


def format_sections(gate: dict[str, Any]) -> str:
    """Sections for the prompt: id in brackets, then the section text."""
    return "\n\n".join(f"[{r['id']}]\n{r['text']}" for r in gate.get("retrieved", []))


def abstain_output(gate: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "answer": "",
        "citations": [],
        "retrieved_ids": list((gate or {}).get("retrieved_ids", [])),
        "abstained": True,
    }


def compile_forbidden(lexicon: dict[str, Any] | None = None) -> dict[str, list[re.Pattern[str]]]:
    """Default patterns plus phrases from ``lexicon.forbidden_output`` when present."""
    patterns = {k: list(v) for k, v in DEFAULT_FORBIDDEN.items()}
    block = (lexicon or {}).get("forbidden_output") if isinstance(lexicon, dict) else None
    if isinstance(block, dict):
        for key, target in (("dosing", "dosing"), ("diagnosis", "diagnosis"), ("conditions", "diagnosis")):
            for phrase in block.get(key, []) or []:
                if isinstance(phrase, str) and phrase.strip():
                    patterns[target].append(r"\b" + re.escape(phrase.strip().lower()) + r"\b")
    return {k: [re.compile(p, re.IGNORECASE) for p in v] for k, v in patterns.items()}


def forbidden_reason(text: str, forbidden: dict[str, list[re.Pattern[str]]]) -> str | None:
    """First violated category (``reassurance``, ``dosing``, ``diagnosis``) or None."""
    for key in ("reassurance", "dosing", "diagnosis"):
        if any(p.search(text or "") for p in forbidden.get(key, [])):
            return key
    return None


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


def build_answer(
    model_text: Any,
    gate: dict[str, Any],
    forbidden: dict[str, list[re.Pattern[str]]] | None = None,
    max_words: int = MAX_WORDS,
) -> tuple[dict[str, Any], str | None]:
    """``(output, abstain_reason)``; output is ``{answer, citations, retrieved_ids, abstained}``."""
    forbidden = forbidden or compile_forbidden()
    if not gate.get("passed"):
        return abstain_output(gate), "low_relevance"
    obj = _json_object(model_text if isinstance(model_text, str) else "")
    if obj is None:
        return abstain_output(gate), "model_output_invalid"
    if obj.get("abstained") is True:
        return abstain_output(gate), "model_abstained"
    answer = obj.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return abstain_output(gate), "empty_answer"
    answer = re.sub(r"\s+", " ", answer).strip()
    ids = obj.get("citation_ids", obj.get("citations", []))
    if not isinstance(ids, list):
        return abstain_output(gate), "citations_invalid"
    ids = [i.get("id") if isinstance(i, dict) else i for i in ids]
    ids = [i.strip() for i in ids if isinstance(i, str) and i.strip()]
    by_id = {r["id"]: r for r in gate.get("retrieved", [])}
    if not ids:
        return abstain_output(gate), "no_citation"
    if any(i not in by_id for i in ids):
        return abstain_output(gate), "citation_not_retrieved"
    cited = list(dict.fromkeys(ids))
    reason = forbidden_reason(answer, forbidden)
    if reason:
        return abstain_output(gate), reason
    if len(answer.split()) > max_words:
        return abstain_output(gate), "too_long"
    return (
        {
            "answer": answer,
            "citations": [{"id": i, "label": by_id[i].get("label", "")} for i in cited],
            "retrieved_ids": list(gate.get("retrieved_ids", [])),
            "abstained": False,
        },
        None,
    )


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
    from lfx.io import DataInput, FloatInput, HandleInput, IntInput, MessageTextInput, MultilineInput, Output, StrInput
    from lfx.schema.data import Data
    from lfx.schema.message import Message

    _HAS_LANGFLOW = True
except ImportError:
    try:  # older Langflow 1.x
        from langflow.custom import Component
        from langflow.io import DataInput, FloatInput, HandleInput, IntInput, MessageTextInput, MultilineInput, Output, StrInput
        from langflow.schema import Data
        from langflow.schema.message import Message

        _HAS_LANGFLOW = True
    except ImportError:
        _HAS_LANGFLOW = False

if _HAS_LANGFLOW:

    class ParseQuestionComponent(Component):  # type: ignore[misc]
        display_name = "Parse Question"
        description = 'Chat input {"question": "..."} or plain text -> the redacted question.'
        icon = "MessageCircleQuestion"
        name = "TuntasParseQuestion"

        inputs = [MessageTextInput(name="input_value", display_name="Input")]
        outputs = [Output(display_name="Question", name="question", method="question_out")]

        def question_out(self) -> Message:
            q = parse_question(self.input_value)
            self.status = q
            return Message(text=q)

    class RelevanceGateComponent(Component):  # type: ignore[misc]
        display_name = "Relevance Gate"
        description = (
            "Scores the retrieved corpus sections against the question. Below min_score the "
            "model branch is stopped and the flow abstains without calling the model."
        )
        icon = "Filter"
        name = "TuntasRelevanceGate"

        inputs = [
            MessageTextInput(name="question", display_name="Question"),
            DataInput(name="search_results", display_name="Search results", is_list=True),
            HandleInput(name="embedding", display_name="Embedding", input_types=["Embeddings"]),
            FloatInput(name="min_score", display_name="Min score", value=MIN_SCORE),
            IntInput(name="top_k", display_name="Top k", value=TOP_K, advanced=True),
            StrInput(
                name="persist_directory",
                display_name="Persist Directory",
                value="/app/langflow/tuntastb_chroma",
                advanced=True,
                info="Same Chroma store as the retriever; stored section vectors are reused.",
            ),
            StrInput(name="collection_name", display_name="Collection Name", value="tuntastb_corpus", advanced=True),
            FloatInput(name="timeout", display_name="Embedding timeout (s)", value=EMBED_TIMEOUT_S, advanced=True),
        ]
        outputs = [
            Output(display_name="Sections", name="sections", method="sections_out"),
            Output(display_name="Gate", name="gate", method="gate_out"),
        ]

        def _stored_vectors(self, texts: list[str]) -> list:
            """Vectors already stored for these chunk texts (no embedding call)."""
            try:
                from langchain_chroma import Chroma
                from lfx.base.vectorstores.chroma_security import chroma_langchain_collection_kwargs
                from lfx.base.vectorstores.user_scoping import runtime_user_id, scoped_collection_name

                store = Chroma(
                    persist_directory=str(self.resolve_path(self.persist_directory)),
                    embedding_function=self.embedding,
                    collection_name=scoped_collection_name(self.collection_name, runtime_user_id(self)),
                    **chroma_langchain_collection_kwargs(),
                )
                got = store.get(include=["documents", "embeddings"])
                by_text = {
                    (doc or "").strip(): [float(x) for x in vec]
                    for doc, vec in zip(got.get("documents") or [], got.get("embeddings") if got.get("embeddings") is not None else [])
                }
            except Exception:  # noqa: BLE001 - fall back to embedding the texts
                by_text = {}
            return [by_text.get(t.strip()) for t in texts]

        def _gate(self) -> dict:
            if not hasattr(self, "_tuntas_gate"):
                items = self.search_results or []
                if not isinstance(items, list):
                    items = [items]
                raw = [_chunk_text(i) for i in items]
                pairs = [(t, parse_chunk(t)) for t in raw]
                pairs = [(t, c) for t, c in pairs if c["id"]]
                chunks = [c for _, c in pairs]
                question = _text(self.question)
                scores: list[float] = []
                error = None
                timeout = float(self.timeout or EMBED_TIMEOUT_S)
                if chunks and question:
                    try:
                        qv = call_with_timeout(self.embedding.embed_query, timeout, question)
                        vecs = self._stored_vectors([t for t, _ in pairs])
                        missing = [i for i, v in enumerate(vecs) if v is None]
                        if missing:
                            fresh = call_with_timeout(
                                self.embedding.embed_documents, timeout, [pairs[i][0] for i in missing]
                            )
                            for i, v in zip(missing, fresh):
                                vecs[i] = v
                        scores = [cosine(qv, v) for v in vecs]
                    except Exception as e:  # noqa: BLE001 - any failure abstains
                        error = f"embedding_failed:{type(e).__name__}"
                        chunks, scores = [], []
                g = relevance_gate(chunks, scores, float(self.min_score), int(self.top_k or TOP_K))
                g["error"] = error
                self._tuntas_gate = g
                self.status = f"passed={g['passed']} best={g['best_score']} ids={g['retrieved_ids']} error={error}"
            return self._tuntas_gate

        def sections_out(self) -> Message:
            g = self._gate()
            return Message(text=format_sections(g) if g["passed"] else "")

        def gate_out(self) -> Data:
            return Data(data=self._gate())

    class BuildAnswerComponent(Component):  # type: ignore[misc]
        display_name = "Build Answer"
        description = (
            "Calls the language model only when the Relevance Gate passed (with a timeout), maps "
            "citation ids to the retrieved sections, adds retrieved_ids and abstains on any doubt."
        )
        icon = "PackageCheck"
        name = "TuntasBuildAnswer"

        inputs = [
            DataInput(name="gate", display_name="Gate"),
            MessageTextInput(name="prompt", display_name="Prompt"),
            HandleInput(name="model", display_name="Language Model", input_types=["LanguageModel"]),
            MultilineInput(
                name="lexicon_json",
                display_name="Lexicon JSON",
                info="Contents of rules/lexicon.id.json (filled by the deploy script).",
                advanced=True,
            ),
            FloatInput(name="timeout", display_name="Model timeout (s)", value=MODEL_TIMEOUT_S, advanced=True),
        ]
        outputs = [Output(display_name="Answer", name="answer", method="answer_out")]

        def answer_out(self) -> Message:
            gate = _data_dict(self.gate)
            text, error = "", None
            if gate.get("passed"):  # below the threshold the model is never called
                text, error = invoke_model(self.model, _text(self.prompt), float(self.timeout or MODEL_TIMEOUT_S))
            lexicon = json.loads(self.lexicon_json) if (self.lexicon_json or "").strip() else {}
            out, reason = build_answer(text, gate, compile_forbidden(lexicon))
            self.status = f"abstained={out['abstained']} reason={error or reason} best={gate.get('best_score')}"
            return Message(text=json.dumps(out, ensure_ascii=False))
