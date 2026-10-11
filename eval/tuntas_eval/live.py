"""Live mode: the golden set through the Langflow flows (MCP, REST fallback)."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Callable

from jsonschema import Draft7Validator

from . import forbidden as fb
from . import local_rules, paths, scoring, templates
from .transports import REQUIRED_TOOLS, TransportError
from .transports.mcp_client import McpTransport, project_mcp_url
from .transports.rest_client import RestTransport

import triage_rules  # noqa: E402  (langflow/components)

DEFAULT_BASE_URL = "http://localhost:7860"
PROJECT_NAME = "TuntasTB"
CONCURRENCY = 4
CASE_TIMEOUT_S = 30.0


class ConfigError(ValueError):
    pass


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------


def read_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def load_live_config(env: dict[str, str] | None = None, dotenv: Path | None = None) -> dict[str, Any]:
    """Environment first, then the repository ``.env``. Never logs the key.

    The ``.env`` base URL is written for containers (``host.docker.internal``);
    the runner runs on the host, so that host name is mapped to ``localhost``.
    """
    env = dict(os.environ) if env is None else env
    file_values = read_dotenv(dotenv if dotenv is not None else paths.ROOT / ".env")

    def get(key: str) -> tuple[str, str]:
        if env.get(key):
            return env[key], "env"
        if file_values.get(key):
            return file_values[key], ".env"
        return "", ""

    base_url, base_src = get("LANGFLOW_BASE_URL")
    if base_src == ".env":
        base_url = base_url.replace("host.docker.internal", "localhost")
    api_key, _ = get("LANGFLOW_API_KEY")
    project_id, _ = get("LANGFLOW_PROJECT_ID")
    if not api_key:
        raise ConfigError("LANGFLOW_API_KEY is not set (environment or .env); live mode needs it")
    return {"base_url": (base_url or DEFAULT_BASE_URL).rstrip("/"), "api_key": api_key, "project_id": project_id or None}


async def discover_project_id(base_url: str, api_key: str, transport: Any = None) -> str:
    """Read-only lookup of the TuntasTB project id when ``LANGFLOW_PROJECT_ID`` is unset."""
    import httpx

    async with httpx.AsyncClient(base_url=base_url, headers={"x-api-key": api_key}, timeout=15,
                                 transport=transport) as client:
        try:
            resp = await client.get("/api/v1/projects/")
        except httpx.HTTPError as e:
            raise TransportError("network", f"projects: {type(e).__name__}") from e
        if resp.status_code != 200:
            raise TransportError(f"http_{resp.status_code}", "projects")
        for p in resp.json():
            if isinstance(p, dict) and p.get("name") == PROJECT_NAME:
                return p["id"]
    raise ConfigError(f'Langflow has no project named "{PROJECT_NAME}"; set LANGFLOW_PROJECT_ID')


# --------------------------------------------------------------------------
# Transport selection
# --------------------------------------------------------------------------


async def open_transport(choice: str, cfg: dict[str, Any],
                         mcp_factory: Callable[..., Any] = McpTransport,
                         rest_factory: Callable[..., Any] = RestTransport) -> tuple[Any, str | None]:
    """An entered transport and a note for the report.

    ``auto`` tries MCP ``initialize`` and ``tools/list``; on any failure it uses REST
    for the whole run and says why.
    """
    if choice not in ("auto", "mcp", "rest"):
        raise ConfigError(f"unknown transport {choice!r}")
    if choice in ("auto", "mcp"):
        url = project_mcp_url(cfg["base_url"], cfg["project_id"])
        t = mcp_factory(url, cfg["api_key"], timeout=CASE_TIMEOUT_S)
        try:
            await t.__aenter__()
            tools = await t.list_tools()
            missing = [n for n in REQUIRED_TOOLS if n not in tools]
            if missing:
                await t.__aexit__(None, None, None)
                raise TransportError("unavailable", f"MCP server does not list {', '.join(missing)}")
            return t, None
        except TransportError as e:
            if choice == "mcp":
                raise
            note = f"MCP unavailable ({e}); REST used for the whole run"
    else:
        note = None
    t = rest_factory(cfg["base_url"], cfg["api_key"], timeout=CASE_TIMEOUT_S)
    await t.__aenter__()
    return t, note


# --------------------------------------------------------------------------
# Check-ins
# --------------------------------------------------------------------------


def flow_validator() -> Draft7Validator:
    return Draft7Validator(paths.read_json(paths.FLOW_SCHEMA_PATH))


def parse_flow_output(text: str | None, validator: Draft7Validator) -> tuple[dict[str, Any] | None, str | None]:
    """``(output, None)`` when schema-valid, else ``(None, reason)``."""
    if text is None:
        return None, "missing"
    try:
        data = json.loads(text)
    except ValueError:
        return None, "not_json"
    errors = list(validator.iter_errors(data))
    if errors:
        return None, "schema:" + errors[0].message[:120]
    return data, None


def manifest_ids() -> set[str]:
    return {s["id"] for s in paths.read_json(paths.MANIFEST_PATH)["sections"]}


def flow_payload(case: dict[str, Any], redacted: str, ctx: dict[str, Any], rules_version: str) -> str:
    inp = case["input"]
    body = {"text": redacted, "chips": list(inp["chips"]), "dose_status": inp["dose_status"],
            "context": ctx, "rules_version": rules_version}
    if "treatment_day" in inp:
        body["treatment_day"] = inp["treatment_day"]
    return json.dumps(body, ensure_ascii=False)


def score_live_checkin(case: dict[str, Any], rules: local_rules.Rules, flow_text: str | None,
                       transport_error: str | None, tmpl: list[dict[str, str]], forbidden: dict[str, list[str]],
                       manifest: set[str], validator: Draft7Validator, called: bool = True) -> dict[str, Any]:
    """Score one check-in from the flow's raw output text (or the transport error)."""
    local = local_rules.local_triage(case, rules)
    res = local["result"]
    flow, invalid = (None, None)
    if called:
        flow, invalid = parse_flow_output(flow_text, validator) if transport_error is None else (None, transport_error)
    comb = scoring.combine(res["level"], flow, rules.known_codes, called=called)
    level = comb["level"]
    flow_flags = list((flow or {}).get("extracted", {}).get("mood_flags", []))
    risk = local_rules.risk_for(case, rules, local, level, flow_flags)

    family = (flow or {}).get("family_message") or ""
    nurse = (flow or {}).get("nurse_line") or ""
    citations = [c.get("id") for c in (flow or {}).get("citations", []) if isinstance(c, dict)]
    stop_intent = "stop_intent" in risk["mood_flags"]
    reply = templates.compose_offline_reply(level, tmpl, no_symptom=level == "GREEN" and res["decidedBy"] == "no_symptoms",
                                            dose_missed=case["input"]["dose_status"] != "yes", stop_intent=stop_intent)
    violations = []
    for source, text in (("family_message", family), ("nurse_line", nurse)):
        for v in fb.scan_detail(text, forbidden):
            violations.append({"source": f"{case['id']}:{source}", "reason": v["reason"], "match": v["match"], "text": text})
    patterns = case["expected"].get("must_not_contain", [])
    for source, text in (("family_message", family), ("nurse_line", nurse), ("reply", reply)):
        for p in fb.must_not_contain_hits(text, patterns):
            violations.append({"source": f"{case['id']}:{source}", "reason": "must_not_contain", "match": p, "text": text})
    problems = scoring.expectation_problems(case, risk["mood_flags"], risk["band"])
    if case["category"] == "redaction" and local["redacted_level"] != local["raw_level"]:
        problems.append(f"redaction changed the level ({local['raw_level']} -> {local['redacted_level']})")
    if invalid:
        problems.append(f"flow output invalid ({invalid})")
    flow_reasons = (flow or {}).get("reasons", [])
    # The flow answers with rules only when its model call failed (timeout, error,
    # non-JSON): valid output, but no extraction. Counted in the fallback rate.
    model_failed = "unknown:extraction_failed" in flow_reasons
    return {
        "id": case["id"], "category": case["category"], "expected": case["expected"]["level"], "actual": level,
        "local_level": res["level"], "flow_level": (flow or {}).get("level"), "flow_called": called,
        "flow_invalid": invalid, "fallback": comb["fallback"], "floor": comb["floor"],
        "model_failed": model_failed, "flow_reasons": flow_reasons,
        "red_flags": res["redFlags"], "mood_flags": risk["mood_flags"],
        "risk": {"score": risk["score"], "band": risk["band"], "factors": risk["factors"]},
        "family_message": family, "nurse_line": nurse, "citations": citations,
        "family_cited": bool(family) and bool(citations) and all(c in manifest for c in citations),
        "neutral_wording": fb.neutral_wording_hits(family),
        "violations": violations, "problems": problems,
    }


# --------------------------------------------------------------------------
# Questions
# --------------------------------------------------------------------------


def app_question_gate(question: str, rules: local_rules.Rules, forbidden: dict[str, list[str]]) -> str | None:
    """What the app decides before any flow call (add-guideline-qa design, steps 3-4)."""
    redacted = rules.redact(question)
    sentences = triage_rules.normalise(redacted)
    if triage_rules.match_codes(sentences, rules.compiled["red_flag_entries"]):
        return "urgent"
    reasons = fb.scan(redacted, {**forbidden, "diagnosis": forbidden["conditions"]})
    if "dosing" in reasons or "diagnosis" in reasons:
        return "abstain"
    return None


def score_question(q: dict[str, Any], gate: str | None, flow_text: str | None, transport_error: str | None,
                   forbidden: dict[str, list[str]], manifest: set[str]) -> dict[str, Any]:
    answer, cited, flow_kind, err = "", [], None, transport_error
    if flow_text is not None:
        try:
            data = json.loads(flow_text)
            answer = data.get("answer") or ""
            cited = [c.get("id") for c in data.get("citations", []) if isinstance(c, dict)]
            flow_kind = "abstain" if data.get("abstained") or not answer.strip() else "answer"
        except (ValueError, AttributeError):
            err = "not_json"
    if flow_kind is None:
        flow_kind = "abstain"  # the app abstains when Langflow fails
    kind = gate or flow_kind
    covered = kind in ("abstain", "urgent") or (bool(cited) and all(c in manifest for c in cited))
    violations = [{"source": f"{q['id']}:answer", "reason": v["reason"], "match": v["match"], "text": answer}
                  for v in fb.scan_detail(answer, forbidden)]
    return {"id": q["id"], "category": q.get("category"), "question": q["question"], "expected": q["expected"],
            "kind": kind, "app_gate": gate, "flow_kind": flow_kind, "answer": answer, "citations": cited,
            "covered": covered, "error": err, "violations": violations,
            "neutral_wording": fb.neutral_wording_hits(answer)}


# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------


async def run_live(cases: list[dict[str, Any]], questions: list[dict[str, Any]], rules: local_rules.Rules,
                   transport: Any, tmpl: list[dict[str, str]], forbidden: dict[str, list[str]],
                   progress: Callable[[str], None] = lambda s: None, concurrency: int = CONCURRENCY) -> dict[str, Any]:
    validator = flow_validator()
    manifest = manifest_ids()
    sem = asyncio.Semaphore(concurrency)

    async def call(tool: str, payload: str) -> tuple[str | None, str | None]:
        async with sem:
            try:
                return await asyncio.wait_for(transport.call(tool, payload), CASE_TIMEOUT_S + 5), None
            except TransportError as e:
                return None, e.kind
            except asyncio.TimeoutError:
                return None, "timeout"

    async def one_checkin(case: dict[str, Any]) -> dict[str, Any]:
        local = local_rules.local_triage(case, rules)
        called = local["redacted_text"].strip() != ""
        text, err = (None, None)
        if called:
            text, err = await call("checkin_triage", flow_payload(case, local["redacted_text"], local["context"], rules.version))
        r = score_live_checkin(case, rules, text, err, tmpl, forbidden, manifest, validator, called=called)
        progress(f"{r['id']}: {r['actual']} (expected {r['expected']})")
        return r

    async def one_question(q: dict[str, Any]) -> dict[str, Any]:
        gate = app_question_gate(q["question"], rules, forbidden)
        text, err = (None, None)
        if gate != "urgent":  # the app never calls the flow for a red-flag question
            text, err = await call("ask_guideline", json.dumps({"question": rules.redact(q["question"])}, ensure_ascii=False))
        r = score_question(q, gate, text, err, forbidden, manifest)
        progress(f"{r['id']}: {r['kind']} (expected {r['expected']})")
        return r

    checkins = await asyncio.gather(*(one_checkin(c) for c in cases))
    answers = await asyncio.gather(*(one_question(q) for q in questions))
    return {"checkins": list(checkins), "questions": list(answers)}
