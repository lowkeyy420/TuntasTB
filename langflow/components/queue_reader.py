"""Queue Reader and Digest Merge for the ``nurse_digest`` flow.

The flow (see ``openspec/changes/add-nurse-queue-alerts/design.md``)::

    Text Input ("<puskesmas_id> <date>" or {"puskesmas_id", "date"})
      -> Queue Reader (GET /api/internal/queue with x-internal-token)
      -> Prompt (digest.id.md) -> Digest Merge <- Language Model (model handle)
      -> Chat Output

The application ranks; the flow never sorts, drops or adds patients. Digest Merge
calls the model only when the queue has entries and re-attaches its one-line
summaries by position; it falls back to the application's own reasons when the
model fails, the count differs, a line is too long or a line has dosing, diagnosis
or "aman" wording. When the queue cannot be read (app down, endpoint missing, 401,
timeout) the flow still answers, with ``ok: false``, the error code and an empty
list.

Pure functions need only the standard library (``httpx`` is imported lazily) so
pytest can import this module without Langflow.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any

DEFAULT_BASE_URL = "http://host.docker.internal:3000"
QUEUE_PATH = "/api/internal/queue"
TIMEOUT_S = 10.0
MODEL_TIMEOUT_S = 20.0
MAX_LINE = 160
WIB = timezone(timedelta(hours=7))

_PID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_LINE_PREFIX = re.compile(r"^\s*(?:\d+[.)]|[-*])\s*")
_FENCE = re.compile(r"^\s*```(?:json|JSON)?\s*(.*?)\s*```\s*$", re.DOTALL)

# Same defaults as ask_parts.DEFAULT_FORBIDDEN (a test keeps them equal).
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


def today_wib() -> str:
    return datetime.now(WIB).date().isoformat()


def parse_request(raw: Any, today: str | None = None) -> dict[str, Any]:
    """``{"puskesmas_id", "date"}`` JSON or ``"<id> [YYYY-MM-DD]"`` text.

    Returns ``{"puskesmas_id", "date", "error"}``; the date defaults to today (WIB).
    """
    text = ("" if raw is None else str(raw)).strip()
    pid, date = "", ""
    if text.startswith("{"):
        try:
            data = json.loads(text)
        except ValueError:
            data = None
        if not isinstance(data, dict):
            return {"puskesmas_id": "", "date": "", "error": "request_not_json"}
        pid = str(data.get("puskesmas_id") or "").strip()
        date = str(data.get("date") or "").strip()
    else:
        parts = text.replace(",", " ").split()
        pid = parts[0] if parts else ""
        date = parts[1] if len(parts) > 1 else ""
    date = date or today or today_wib()
    if not pid or not _PID.match(pid):
        return {"puskesmas_id": "", "date": date, "error": "invalid_puskesmas_id"}
    if not _DATE.match(date):
        return {"puskesmas_id": pid, "date": "", "error": "invalid_date"}
    return {"puskesmas_id": pid, "date": date, "error": None}


def _first(entry: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in entry and entry[k] is not None:
            return entry[k]
    return None


def normalise_entries(payload: Any) -> list[dict[str, Any]]:
    """Queue entries in the application's order, with the digest's field names."""
    items = payload
    if isinstance(payload, dict):
        for key in ("entries", "queue", "items", "patients", "data"):
            if isinstance(payload.get(key), list):
                items = payload[key]
                break
        else:
            items = []
    if not isinstance(items, list):
        return []
    out = []
    for i, e in enumerate(items):
        if not isinstance(e, dict):
            continue
        score = _first(e, "score", "risk_score", "riskScore")
        out.append(
            {
                "rank": i + 1,
                "code": str(_first(e, "code", "patient_code", "patientCode") or "?"),
                "score": score if isinstance(score, (int, float)) and not isinstance(score, bool) else None,
                "band": _first(e, "band", "risk_band", "riskBand"),
                "level": _first(e, "level", "effective_level", "effectiveLevel", "triage_level"),
                "reason": str(_first(e, "reason", "nurse_line", "nurseLine") or ""),
                "suggested_action": _first(e, "suggested_action", "suggestedAction", "action"),
            }
        )
    return out


def fetch_queue(
    base_url: str,
    token: str,
    puskesmas_id: str,
    date: str,
    timeout: float = TIMEOUT_S,
    client: Any = None,
) -> dict[str, Any]:
    """GET the ranked list. Never raises: failures come back as ``ok: false`` + error code."""
    result: dict[str, Any] = {
        "ok": False,
        "status": None,
        "error": None,
        "puskesmas_id": puskesmas_id,
        "date": date,
        "entries": [],
    }
    if not puskesmas_id:
        result["error"] = "invalid_puskesmas_id"
        return result
    import httpx  # Langflow ships httpx; imported lazily for tests without it

    url = (base_url or DEFAULT_BASE_URL).rstrip("/") + QUEUE_PATH
    own = client is None
    client = client or httpx.Client(timeout=timeout)
    try:
        resp = client.get(
            url,
            params={"puskesmas_id": puskesmas_id, "date": date},
            headers={"x-internal-token": token or "", "accept": "application/json"},
            timeout=timeout,
        )
    except httpx.TimeoutException:
        result["error"] = "timeout"
        return result
    except httpx.HTTPError:
        result["error"] = "network"
        return result
    finally:
        if own:
            client.close()
    result["status"] = resp.status_code
    if resp.status_code == 401:
        result["error"] = "unauthorized"
        return result
    if resp.status_code == 404:
        result["error"] = "endpoint_not_found"
        return result
    if resp.status_code != 200:
        result["error"] = f"http_{resp.status_code}"
        return result
    try:
        payload = resp.json()
    except ValueError:
        result["error"] = "invalid_json"
        return result
    result["ok"] = True
    result["entries"] = normalise_entries(payload)
    return result


def entries_for_prompt(queue: dict[str, Any]) -> str:
    """Numbered entry lines for the digest prompt (codes, levels, scores, reasons only)."""
    if not queue.get("ok"):
        return "(daftar tidak tersedia)"
    if not queue["entries"]:
        return "(daftar kosong)"
    return "\n".join(
        f"{e['rank']}. kode={e['code']} | level={e['level']} | skor={e['score']} ({e['band']}) | "
        f"alasan={e['reason']} | tindakan={e['suggested_action']}"
        for e in queue["entries"]
    )


def compile_forbidden(lexicon: dict[str, Any] | None = None) -> dict[str, list[re.Pattern[str]]]:
    patterns = {k: list(v) for k, v in DEFAULT_FORBIDDEN.items()}
    block = (lexicon or {}).get("forbidden_output") if isinstance(lexicon, dict) else None
    if isinstance(block, dict):
        for key, target in (("dosing", "dosing"), ("diagnosis", "diagnosis"), ("conditions", "diagnosis")):
            for phrase in block.get(key, []) or []:
                if isinstance(phrase, str) and phrase.strip():
                    patterns[target].append(r"\b" + re.escape(phrase.strip().lower()) + r"\b")
    return {k: [re.compile(p, re.IGNORECASE) for p in v] for k, v in patterns.items()}


def model_lines(text: str) -> list[str]:
    """One summary line per entry from the model reply (JSON array or plain lines)."""
    text = (text or "").strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1)
    try:
        value = json.loads(text)
    except ValueError:
        value = None
    if isinstance(value, dict):
        value = value.get("lines")
    if isinstance(value, list):
        return [re.sub(r"\s+", " ", str(v)).strip() for v in value]
    return [_LINE_PREFIX.sub("", ln).strip() for ln in text.splitlines() if ln.strip()]


def merge_digest(queue: dict[str, Any], model_text: Any, forbidden: dict[str, list[re.Pattern[str]]] | None = None) -> dict[str, Any]:
    """Re-attach model lines by position; any doubt keeps the application's reasons."""
    forbidden = forbidden or compile_forbidden()
    out = {
        "ok": bool(queue.get("ok")),
        "error": queue.get("error"),
        "puskesmas_id": queue.get("puskesmas_id", ""),
        "date": queue.get("date", ""),
        "summary_source": "none",
        "entries": [],
    }
    if not queue.get("ok"):
        return out
    entries = [dict(e) for e in queue.get("entries", [])]
    out["entries"] = entries
    if not entries:
        return out
    lines = model_lines(model_text if isinstance(model_text, str) else "")
    usable = len(lines) == len(entries) and all(
        ln and len(ln) <= MAX_LINE and not any(p.search(ln) for ps in forbidden.values() for p in ps) for ln in lines
    )
    if usable:
        for e, ln in zip(entries, lines):
            e["reason"] = ln
        out["summary_source"] = "model"
    else:
        out["summary_source"] = "app"
    return out


def _data_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, list):
        value = value[0] if value else {}
    data = getattr(value, "data", value)
    return data if isinstance(data, dict) else {}


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
        return "", f"model_error:{type(e).__name__}"


def _text(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(getattr(value, "text", value) or "")


# --------------------------------------------------------------------------
# Langflow components (defined only when Langflow is installed)
# --------------------------------------------------------------------------

try:  # Langflow 1.7+ (lfx)
    from lfx.custom.custom_component.component import Component
    from lfx.io import DataInput, FloatInput, HandleInput, MessageTextInput, MultilineInput, Output, SecretStrInput, StrInput
    from lfx.schema.data import Data
    from lfx.schema.message import Message

    _HAS_LANGFLOW = True
except ImportError:
    try:  # older Langflow 1.x
        from langflow.custom import Component
        from langflow.io import (
            DataInput, FloatInput, HandleInput, MessageTextInput, MultilineInput, Output, SecretStrInput, StrInput,
        )
        from langflow.schema import Data
        from langflow.schema.message import Message

        _HAS_LANGFLOW = True
    except ImportError:
        _HAS_LANGFLOW = False

if _HAS_LANGFLOW:

    class QueueReaderComponent(Component):  # type: ignore[misc]
        display_name = "Queue Reader"
        description = "Reads the ranked list from the app (GET /api/internal/queue). Never raises."
        icon = "ListOrdered"
        name = "TuntasQueueReader"

        inputs = [
            MessageTextInput(name="request", display_name="Request", info='"<puskesmas_id> [YYYY-MM-DD]" or JSON.'),
            StrInput(
                name="base_url",
                display_name="App base URL",
                value=DEFAULT_BASE_URL,
                info="Global variable TUNTAS_APP_URL (set by the deploy script).",
            ),
            SecretStrInput(
                name="internal_token",
                display_name="Internal token",
                info="Global variable TUNTAS_INTERNAL_TOKEN (set by the deploy script).",
                required=False,
            ),
            FloatInput(name="timeout", display_name="Timeout (s)", value=TIMEOUT_S, advanced=True),
        ]
        outputs = [
            Output(display_name="Queue", name="queue", method="queue_out"),
            Output(display_name="Prompt entries", name="prompt_entries", method="prompt_out"),
        ]

        def _queue(self) -> dict:
            if not hasattr(self, "_tuntas_queue"):
                req = parse_request(_text(self.request))
                if req["error"]:
                    q = {"ok": False, "status": None, "error": req["error"], "puskesmas_id": req["puskesmas_id"],
                         "date": req["date"], "entries": []}
                else:
                    q = fetch_queue(self.base_url, self.internal_token or "", req["puskesmas_id"], req["date"],
                                    float(self.timeout or TIMEOUT_S))
                self._tuntas_queue = q
                self.status = f"ok={q['ok']} error={q['error']} entries={len(q['entries'])}"
            return self._tuntas_queue

        def queue_out(self) -> Data:
            return Data(data=self._queue())

        def prompt_out(self) -> Message:
            return Message(text=entries_for_prompt(self._queue()))

    class DigestMergeComponent(Component):  # type: ignore[misc]
        display_name = "Digest Merge"
        description = (
            "Calls the language model for one line per patient (only when the queue has entries, "
            "with a timeout) and re-attaches the lines by position; falls back to the app's reasons."
        )
        icon = "Merge"
        name = "TuntasDigestMerge"

        inputs = [
            DataInput(name="queue", display_name="Queue"),
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
        outputs = [Output(display_name="Digest", name="digest", method="digest_out")]

        def digest_out(self) -> Message:
            queue = _data_dict(self.queue)
            text, error = "", None
            if queue.get("ok") and queue.get("entries"):
                text, error = invoke_model(self.model, _text(self.prompt), float(self.timeout or MODEL_TIMEOUT_S))
            lexicon = json.loads(self.lexicon_json) if (self.lexicon_json or "").strip() else {}
            out = merge_digest(queue, text, compile_forbidden(lexicon))
            self.status = f"ok={out['ok']} source={out['summary_source']} n={len(out['entries'])} model_error={error}"
            return Message(text=json.dumps(out, ensure_ascii=False))
