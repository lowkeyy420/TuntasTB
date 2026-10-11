"""Tests for langflow/components/queue_reader.py with a mocked HTTP transport."""

import json
import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "langflow" / "components"))

import ask_parts  # noqa: E402
import queue_reader as qr  # noqa: E402

ENTRIES = [
    {"code": "TB-0041", "score": 9, "band": "high", "level": "YELLOW", "reason": "mual 7 hari", "suggestedAction": "telepon"},
    {"code": "TB-0007", "score": 5, "band": "medium", "level": "RED", "reason": "mata kuning", "suggested_action": "telepon"},
]


def client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_parse_request_forms():
    assert qr.parse_request("pk-1 2026-10-11") == {"puskesmas_id": "pk-1", "date": "2026-10-11", "error": None}
    assert qr.parse_request('{"puskesmas_id": "pk-1", "date": "2026-10-11"}')["error"] is None
    assert qr.parse_request("pk-1", today="2026-01-02")["date"] == "2026-01-02"
    assert qr.parse_request("")["error"] == "invalid_puskesmas_id"
    assert qr.parse_request("pk-1 11/10/2026")["error"] == "invalid_date"
    assert qr.parse_request("../etc 2026-10-11")["error"] == "invalid_puskesmas_id"
    assert qr.parse_request("{nope")["error"] == "request_not_json"


def test_fetch_success_sends_token_and_keeps_order():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["token"] = request.headers.get("x-internal-token")
        return httpx.Response(200, json={"entries": ENTRIES})

    q = qr.fetch_queue("http://app:3000/", "s3cret", "pk-1", "2026-10-11", client=client(handler))
    assert seen["url"] == "http://app:3000/api/internal/queue?puskesmas_id=pk-1&date=2026-10-11"
    assert seen["token"] == "s3cret"
    assert q["ok"] and q["error"] is None
    assert [e["code"] for e in q["entries"]] == ["TB-0041", "TB-0007"]
    assert [e["rank"] for e in q["entries"]] == [1, 2]
    assert q["entries"][0]["suggested_action"] == "telepon"  # camelCase accepted


def test_fetch_accepts_a_bare_list():
    q = qr.fetch_queue("http://app", "t", "pk", "2026-10-11", client=client(lambda r: httpx.Response(200, json=ENTRIES)))
    assert len(q["entries"]) == 2


@pytest.mark.parametrize("status,error", [(401, "unauthorized"), (404, "endpoint_not_found"), (500, "http_500")])
def test_fetch_http_errors(status, error):
    q = qr.fetch_queue("http://app", "t", "pk", "2026-10-11", client=client(lambda r: httpx.Response(status)))
    assert not q["ok"] and q["error"] == error and q["entries"] == [] and q["status"] == status


def test_fetch_timeout():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    q = qr.fetch_queue("http://app", "t", "pk", "2026-10-11", client=client(handler))
    assert q["error"] == "timeout" and not q["ok"]


def test_fetch_network_error():
    def handler(request):
        raise httpx.ConnectError("refused", request=request)

    assert qr.fetch_queue("http://app", "t", "pk", "2026-10-11", client=client(handler))["error"] == "network"


def test_fetch_invalid_json():
    q = qr.fetch_queue("http://app", "t", "pk", "2026-10-11", client=client(lambda r: httpx.Response(200, text="<html>")))
    assert q["error"] == "invalid_json"


def _queue():
    return {"ok": True, "error": None, "puskesmas_id": "pk", "date": "2026-10-11", "entries": qr.normalise_entries(ENTRIES)}


def test_merge_uses_model_lines_in_order():
    out = qr.merge_digest(_queue(), json.dumps(["Mual seminggu, perlu ditelepon.", "Mata kuning hari ini."]))
    assert out["summary_source"] == "model"
    assert [e["code"] for e in out["entries"]] == ["TB-0041", "TB-0007"]
    assert out["entries"][1]["reason"] == "Mata kuning hari ini."


@pytest.mark.parametrize("model_text", [
    json.dumps(["satu baris saja"]),
    json.dumps(["a", "b", "c"]),
    json.dumps(["Kurangi obatnya.", "ok"]),
    json.dumps(["Anda menderita hepatitis.", "ok"]),
    json.dumps(["x" * 200, "ok"]),
    "",
])
def test_merge_falls_back_to_app_reasons(model_text):
    out = qr.merge_digest(_queue(), model_text)
    assert out["summary_source"] == "app"
    assert [e["reason"] for e in out["entries"]] == ["mual 7 hari", "mata kuning"]


def test_merge_plain_numbered_lines():
    out = qr.merge_digest(_queue(), "1. Mual seminggu.\n2. Mata kuning.")
    assert out["summary_source"] == "model" and out["entries"][0]["reason"] == "Mual seminggu."


def test_merge_queue_failure_is_graceful():
    out = qr.merge_digest({"ok": False, "error": "endpoint_not_found", "entries": []}, "[]")
    assert out == {"ok": False, "error": "endpoint_not_found", "puskesmas_id": "", "date": "",
                   "summary_source": "none", "entries": []}


def test_prompt_entries_have_no_free_text_beyond_reasons():
    text = qr.entries_for_prompt(_queue())
    assert text.splitlines()[0].startswith("1. kode=TB-0041 | level=YELLOW")
    assert qr.entries_for_prompt({"ok": False}) == "(daftar tidak tersedia)"


def test_forbidden_defaults_match_ask_parts():
    assert qr.DEFAULT_FORBIDDEN == ask_parts.DEFAULT_FORBIDDEN
