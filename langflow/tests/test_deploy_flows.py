"""Tests for langflow/scripts/deploy_flows.py against a fake Langflow (httpx.MockTransport)."""

import ast
import copy
import json
import re
import sys
import uuid
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "langflow" / "scripts"))

import deploy_flows as d  # noqa: E402

OTHER_PROJECT = "fd3b2f5f-0e7f-46ee-9174-480b2316f431"
OTHER_FLOW = "d91974a4-d10a-4d22-8920-59df94fae51f"
CONFIG = {
    "base_url": "http://langflow.test",
    "api_key": "test-key",
    "model": "gemini-test-model",
    "temperature": 0.0,
    "ask_min_score": "0.71",
    "app_url": "http://host.docker.internal:3000",
    "internal_token": "internal-test-token",
}
BUNDLE = ("[section_id: a#b]\nisi", ["a#b"])


class FakeLangflow:
    """Just enough of the Langflow 1.12 REST API for the deploy script."""

    def __init__(self, extra_flows=()):
        self.calls: list[tuple[str, str, object]] = []
        self.projects = {OTHER_PROJECT: {"id": OTHER_PROJECT, "name": "IBM Hacktiv8"}}
        self.flows = {
            OTHER_FLOW: {"id": OTHER_FLOW, "name": "Quick Tutor - Complete", "endpoint_name": None,
                         "folder_id": OTHER_PROJECT, "data": {"nodes": [], "edges": []}},
        }
        for f in extra_flows:
            self.flows[f["id"]] = f
        self.variables = {}
        self.mcp: dict[str, list] = {}
        self.runs: list[str] = []

    def snapshot_foreign(self):
        return copy.deepcopy(
            ({k: v for k, v in self.projects.items() if v["name"] != d.PROJECT_NAME},
             {k: v for k, v in self.flows.items() if v["folder_id"] == OTHER_PROJECT})
        )

    def handler(self, request: httpx.Request) -> httpx.Response:
        method, path = request.method, request.url.path
        body = json.loads(request.content) if request.content else None
        self.calls.append((method, path, body))
        assert request.headers["x-api-key"] == "test-key"
        if path == d.P_PROJECTS and method == "GET":
            return httpx.Response(200, json=list(self.projects.values()))
        if path == d.P_PROJECTS and method == "POST":
            pid = str(uuid.uuid4())
            self.projects[pid] = {"id": pid, "name": body["name"]}
            return httpx.Response(201, json=self.projects[pid])
        m = re.fullmatch(r"/api/v1/projects/([0-9a-f-]+)", path)
        if m and method == "GET":
            pid = m.group(1)
            return httpx.Response(200, json={**self.projects[pid],
                                             "flows": [f for f in self.flows.values() if f["folder_id"] == pid]})
        if path == d.P_FLOWS and method == "GET":
            return httpx.Response(200, json=[{k: v for k, v in f.items() if k != "data"} for f in self.flows.values()])
        if path == d.P_FLOWS and method == "POST":
            if any(f.get("endpoint_name") == body["endpoint_name"] for f in self.flows.values()):
                return httpx.Response(400, json={"detail": "endpoint name must be unique"})
            fid = str(uuid.uuid4())
            self.flows[fid] = {**body, "id": fid}
            return httpx.Response(201, json=self.flows[fid])
        m = re.fullmatch(r"/api/v1/flows/([0-9a-f-]+)", path)
        if m and method == "PATCH":
            self.flows[m.group(1)].update(body)
            return httpx.Response(200, json=self.flows[m.group(1)])
        if m and method == "GET":
            return httpx.Response(200, json=self.flows[m.group(1)])
        if path == d.P_VARIABLES and method == "GET":
            return httpx.Response(200, json=[{**v, "value": None} for v in self.variables.values()])
        if path == d.P_VARIABLES and method == "POST":
            vid = str(uuid.uuid4())
            self.variables[vid] = {**body, "id": vid}
            return httpx.Response(201, json=self.variables[vid])
        m = re.fullmatch(r"/api/v1/variables/([0-9a-f-]+)", path)
        if m and method == "PATCH":
            self.variables[m.group(1)].update(body)
            return httpx.Response(200, json=self.variables[m.group(1)])
        m = re.fullmatch(r"/api/v1/mcp/project/([0-9a-f-]+)", path)
        if m and method == "PATCH":
            self.mcp[m.group(1)] = body["settings"]
            return httpx.Response(200, json={"message": "ok"})
        if path == "/api/v1/run/ingest_corpus" and method == "POST":
            self.runs.append(body["input_value"])
            report = json.dumps({"sections": 1, "added": 1, "removed": 0})
            return httpx.Response(200, json={"outputs": [{"outputs": [{"results": {"message": {"text": report}}}]}]})
        return httpx.Response(404, json={"detail": f"no fake for {method} {path}"})


def deploy(fake, **kw):
    client = d.LangflowClient(CONFIG["base_url"], CONFIG["api_key"], transport=httpx.MockTransport(fake.handler))
    kw.setdefault("bundle", BUNDLE)
    return d.deploy(client, CONFIG, d.load_flow_files(), log=lambda *_: None, **kw), client


def tuntas(fake):
    return [p for p in fake.projects.values() if p["name"] == d.PROJECT_NAME]


def writes(fake):
    return [c for c in fake.calls if c[0] != "GET"]


# ---------------------------------------------------------------- 3.1 project and flows


def test_first_run_creates_project_flows_and_tools():
    fake = FakeLangflow()
    result, _ = deploy(fake)
    [project] = tuntas(fake)
    pid = project["id"]
    assert result["project_id"] == pid
    ours = {f["endpoint_name"]: f for f in fake.flows.values() if f["folder_id"] == pid}
    assert set(ours) == set(d.FLOWS)
    assert result["mcp_url"] == f"http://langflow.test/api/v1/mcp/project/{pid}/streamable"
    tools = {s["action_name"]: s["mcp_enabled"] for s in fake.mcp[pid]}
    assert tools == {"checkin_triage": True, "ask_guideline": True, "nurse_digest": True, "ingest_corpus": False}
    assert {v["name"] for v in fake.variables.values()} == {"TUNTAS_APP_URL", "TUNTAS_INTERNAL_TOKEN"}
    assert fake.runs == [BUNDLE[0]]


def test_repeat_run_updates_in_place():
    fake = FakeLangflow()
    first, _ = deploy(fake)
    n_calls = len(fake.calls)
    second, _ = deploy(fake)
    assert len(tuntas(fake)) == 1
    assert second["project_id"] == first["project_id"]
    assert second["flows"] == first["flows"]
    assert len([f for f in fake.flows.values() if f["folder_id"] == first["project_id"]]) == 4
    repeat = [c for c in fake.calls[n_calls:] if c[0] != "GET"]
    assert not any(m == "POST" and p in (d.P_PROJECTS, d.P_FLOWS, d.P_VARIABLES) for m, p, _ in repeat)
    assert sum(1 for m, p, _ in repeat if m == "PATCH" and p.startswith("/api/v1/flows/")) == 4


def test_dry_run_makes_only_get_requests():
    fake = FakeLangflow()
    result, _ = deploy(fake, dry_run=True)
    assert writes(fake) == []
    assert any(p.startswith("POST /api/v1/projects/") for p in result["planned"])
    assert any("ingest_corpus" in p for p in result["planned"])


def test_skip_ingest():
    fake = FakeLangflow()
    deploy(fake, ingest=False)
    assert fake.runs == []


# ---------------------------------------------------------------- 3.2 injection


def _node(flow, ntype):
    return next(n for n in flow["data"]["nodes"] if n["data"]["type"] == ntype)


def test_injected_rule_fields_equal_file_contents():
    fake = FakeLangflow()
    deploy(fake)
    flow = next(f for f in fake.flows.values() if f.get("endpoint_name") == "checkin_triage")
    tpl = _node(flow, "TriageRules")["data"]["node"]["template"]
    assert tpl["triage_table_json"]["value"] == (ROOT / "rules" / "triage-table.json").read_text(encoding="utf-8")
    assert tpl["lexicon_json"]["value"] == (ROOT / "rules" / "lexicon.id.json").read_text(encoding="utf-8")
    risk = _node(flow, "RiskScore")["data"]["node"]["template"]
    assert risk["risk_points_json"]["value"] == (ROOT / "rules" / "risk-points.json").read_text(encoding="utf-8")


def test_injected_code_prompts_and_model():
    registry = d.component_registry()
    flow = d.inject(d.load_flow_files()["checkin_triage"], "checkin_triage", CONFIG, registry=registry)
    for ntype in ("TriageRules", "RiskScore", "TuntasParseInput", "TuntasExtractionGuard", "TuntasBuildOutput"):
        path, cls = registry[ntype]
        assert _node(flow, ntype)["data"]["node"]["template"]["code"]["value"] == d.component_source(path, cls)
    prompt = next(n for n in flow["data"]["nodes"] if n["id"] == "Prompt Template-extract")
    assert prompt["data"]["node"]["template"]["template"]["value"] == (ROOT / "langflow/prompts/extract.id.md").read_text(encoding="utf-8")
    llm = _node(flow, "LanguageModelComponent")["data"]["node"]["template"]
    assert llm["model"]["value"][0]["name"] == "gemini-test-model"
    assert llm["model"]["value"][0]["provider"] == "Google Generative AI"
    assert llm["api_key"]["value"] == ""


def test_edited_rule_file_is_used(tmp_path):
    for name in d.RULE_FIELDS.values():
        (tmp_path / name).write_text((ROOT / "rules" / name).read_text(encoding="utf-8"), encoding="utf-8")
    table = json.loads((tmp_path / "triage-table.json").read_text(encoding="utf-8"))
    table["version"] = "9.9.9-test"
    (tmp_path / "triage-table.json").write_text(json.dumps(table), encoding="utf-8")
    flow = d.inject(d.load_flow_files()["checkin_triage"], "checkin_triage", CONFIG, rules_dir=tmp_path)
    assert json.loads(_node(flow, "TriageRules")["data"]["node"]["template"]["triage_table_json"]["value"])["version"] == "9.9.9-test"


def test_ask_and_digest_settings():
    flows = d.load_flow_files()
    ask = d.inject(flows["ask_guideline"], "ask_guideline", CONFIG)
    assert _node(ask, "TuntasRelevanceGate")["data"]["node"]["template"]["min_score"]["value"] == 0.71
    digest = d.inject(flows["nurse_digest"], "nurse_digest", CONFIG)
    tpl = _node(digest, "TuntasQueueReader")["data"]["node"]["template"]
    assert tpl["base_url"]["load_from_db"] and tpl["base_url"]["value"] == "TUNTAS_APP_URL"
    assert tpl["internal_token"]["load_from_db"] and tpl["internal_token"]["value"] == "TUNTAS_INTERNAL_TOKEN"


@pytest.mark.parametrize("ntype", sorted(d.component_registry()))
def test_component_source_is_one_top_level_class(ntype):
    path, cls = d.component_registry()[ntype]
    src = d.component_source(path, cls)
    tree = ast.parse(src)
    top = [n.name for n in tree.body if isinstance(n, ast.ClassDef) and d._is_component_class(n)]
    assert top == [cls]
    assert not any(isinstance(n, ast.Try) and d._sets_has_langflow(n) for n in tree.body)  # imports unwrapped
    assert any(isinstance(n, ast.ImportFrom) and (n.module or "").startswith("lfx") for n in tree.body)


# ---------------------------------------------------------------- 3.4 scope


def test_no_write_outside_the_tuntastb_project():
    fake = FakeLangflow()
    before = fake.snapshot_foreign()
    deploy(fake)
    deploy(fake)
    pid = tuntas(fake)[0]["id"]
    ours = {f["id"] for f in fake.flows.values() if f["folder_id"] == pid}
    for method, path, body in writes(fake):
        if path == d.P_PROJECTS:
            assert body["name"] == d.PROJECT_NAME
        elif path == d.P_FLOWS:
            assert body["folder_id"] == pid
        elif path.startswith("/api/v1/flows/"):
            assert path.rsplit("/", 1)[1] in ours and body["folder_id"] == pid
        elif path.startswith("/api/v1/mcp/project/"):
            assert path == f"/api/v1/mcp/project/{pid}"
            assert {s["id"] for s in body["settings"]} <= ours
        elif path.startswith("/api/v1/variables/"):
            assert body["name"] in d.OWNED_VARIABLES
        else:
            assert (method, path) == ("POST", "/api/v1/run/ingest_corpus"), (method, path)
    assert fake.snapshot_foreign() == before


def test_client_refuses_foreign_writes():
    fake = FakeLangflow()
    _, client = deploy(fake)
    with pytest.raises(d.DeployError):
        client.patch(f"/api/v1/flows/{OTHER_FLOW}", {"name": "x"})
    with pytest.raises(d.DeployError):
        client.patch(f"/api/v1/mcp/project/{OTHER_PROJECT}", {"settings": []})
    with pytest.raises(d.DeployError):
        client.post(d.P_VARIABLES, {"name": "GOOGLE_API_KEY", "value": "x"})
    with pytest.raises(d.DeployError):
        client.post(d.P_PROJECTS, {"name": "Other"})


def test_endpoint_name_used_elsewhere_aborts_before_any_write():
    foreign = {"id": str(uuid.uuid4()), "name": "x", "endpoint_name": "checkin_triage",
               "folder_id": OTHER_PROJECT, "data": {}}
    fake = FakeLangflow(extra_flows=[foreign])
    with pytest.raises(d.DeployError, match="outside"):
        deploy(fake)
    assert writes(fake) == []


# ---------------------------------------------------------------- files and config


def test_flow_files_load_and_have_expected_nodes():
    flows = d.load_flow_files()
    types = lambda ep: sorted(n["data"]["type"] for n in flows[ep]["data"]["nodes"])  # noqa: E731
    assert types("checkin_triage") == sorted([
        "ChatInput", "TuntasParseInput", "Prompt Template", "LanguageModelComponent", "TuntasExtractionGuard",
        "TriageRules", "TuntasRiskSnapshot", "RiskScore", "TuntasBuildOutput", "ChatOutput"])
    assert {"ext:chroma:ChromaVectorStoreComponent@official", "EmbeddingModel", "TuntasRelevanceGate",
            "TuntasBuildAnswer"} <= set(types("ask_guideline"))
    assert {"TuntasQueueReader", "TuntasDigestMerge", "LanguageModelComponent"} <= set(types("nurse_digest"))
    assert {"SplitText", "EmbeddingModel", "TuntasCorpusSync", "ext:chroma:ChromaVectorStoreComponent@official"} <= set(types("ingest_corpus"))
    for ep, flow in flows.items():
        assert flow["endpoint_name"] == ep
        ids = {n["id"] for n in flow["data"]["nodes"]}
        for e in flow["data"]["edges"]:
            assert e["source"] in ids and e["target"] in ids


def test_committed_flows_hold_no_secrets():
    secret = d.read_dotenv(ROOT / ".env").get("LANGFLOW_API_KEY", "")
    token = d.read_dotenv(ROOT / ".env").get("INTERNAL_API_TOKEN", "")
    for path in (ROOT / "langflow" / "flows").glob("*.json"):
        text = path.read_text(encoding="utf-8")
        for value in (secret, token):
            if len(value) >= 8:
                assert value not in text, f"secret value found in {path.name}"
        flow = json.loads(text)
        for node in flow.get("data", {}).get("nodes", []):
            for name, field in node["data"]["node"]["template"].items():
                if isinstance(field, dict) and (field.get("password") or name == "api_key"):
                    assert field.get("value") in ("", None) or field.get("load_from_db"), (path.name, node["id"], name)
                if name in d.RULE_FIELDS:
                    assert field["value"] == "", "rule JSON must be injected, not committed"


def test_strip_for_export():
    flow = d.inject(d.load_flow_files()["nurse_digest"], "nurse_digest", CONFIG)
    flow.update({"id": "x", "user_id": "u", "folder_id": "f"})
    reader = _node(flow, "TuntasQueueReader")["data"]["node"]["template"]
    reader["internal_token"].update({"value": "plain-secret", "load_from_db": False})
    out = d.strip_for_export(flow)
    assert not {"id", "user_id", "folder_id"} & set(out)
    assert _node(out, "TuntasQueueReader")["data"]["node"]["template"]["internal_token"]["value"] == ""
    assert _node(out, "TuntasDigestMerge")["data"]["node"]["template"]["lexicon_json"]["value"] == ""


def test_load_config_env_beats_dotenv(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("LANGFLOW_BASE_URL=http://from-file:7860/\nLANGFLOW_API_KEY='file-key'\n", encoding="utf-8")
    cfg = d.load_config(env={"LANGFLOW_BASE_URL": "http://from-env:7860"}, dotenv=env_file)
    assert cfg["base_url"] == "http://from-env:7860"
    assert cfg["api_key"] == "file-key"
    assert cfg["model"] == d.DEFAULT_MODEL and cfg["app_url"] == d.DEFAULT_APP_URL


def test_missing_api_key_is_an_error():
    with pytest.raises(d.DeployError):
        d.LangflowClient("http://x", "")


def test_first_chat_text():
    resp = {"outputs": [{"outputs": [{"results": {"message": {"text": "hello"}}}]}]}
    assert d.first_chat_text(resp) == "hello"
    assert d.first_chat_text({}) is None
