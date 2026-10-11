#!/usr/bin/env python3
"""Create or update the TuntasTB Langflow project and its four flows.

Idempotent: the project is found by name ("TuntasTB"), flows by ``endpoint_name``
inside that project. Repeated runs update in place and never create duplicates.
The script writes only inside the TuntasTB project, plus the two global variables
it owns (``TUNTAS_APP_URL``, ``TUNTAS_INTERNAL_TOKEN``); every write goes through
``LangflowClient._write`` which refuses anything else.

Steps:
 1. Find or create the project.
 2. For each ``langflow/flows/<endpoint>.json``: replace each custom node's code with
    the matching class from ``langflow/components/`` (one class per node, which is how
    Langflow loads components), fill the rule fields from ``rules/``, the prompts from
    ``langflow/prompts/`` and the model settings from the environment.
 3. Create or update the flow by ``endpoint_name``.
 4. Enable checkin_triage, ask_guideline and nurse_digest as MCP tools (tool name =
    endpoint name). ingest_corpus is admin only and stays disabled.
 5. Ingest the corpus (``corpus/*.md``) by running ``ingest_corpus`` (skip with
    ``--skip-ingest``).
 6. Print the project id and the MCP streamable URL.

Configuration (environment first, then the repository ``.env``):
``LANGFLOW_BASE_URL`` (default http://localhost:7860), ``LANGFLOW_API_KEY`` (required),
``LANGFLOW_LLM_MODEL`` (default gemini-3.5-flash-lite), ``LANGFLOW_LLM_TEMPERATURE``
(default 0), ``ASK_MIN_SCORE`` (default from ask_parts.MIN_SCORE), ``TUNTAS_APP_URL``
(default http://host.docker.internal:3000), ``INTERNAL_API_TOKEN``.

Usage::

    python langflow/scripts/deploy_flows.py [--dry-run] [--skip-ingest] [--export]
"""

from __future__ import annotations

import argparse
import ast
import copy
import json
import os
import re
import sys
import textwrap
from pathlib import Path
from typing import Any, Callable

import httpx

ROOT = Path(__file__).resolve().parents[2]
LANGFLOW_DIR = ROOT / "langflow"
FLOWS_DIR = LANGFLOW_DIR / "flows"
COMPONENTS_DIR = LANGFLOW_DIR / "components"
PROMPTS_DIR = LANGFLOW_DIR / "prompts"
RULES_DIR = ROOT / "rules"
CORPUS_DIR = ROOT / "corpus"

PROJECT_NAME = "TuntasTB"
PROJECT_DESCRIPTION = "TuntasTB flows (deployed by langflow/scripts/deploy_flows.py). Do not edit in the UI."
DEFAULT_BASE_URL = "http://localhost:7860"
DEFAULT_MODEL = "gemini-3.5-flash-lite"
DEFAULT_APP_URL = "http://host.docker.internal:3000"
MODEL_PROVIDER = "Google Generative AI"
OWNED_VARIABLES = ("TUNTAS_APP_URL", "TUNTAS_INTERNAL_TOKEN")

# REST paths, verified against Langflow 1.12.1 (see langflow/README.md).
P_PROJECTS = "/api/v1/projects/"
P_PROJECT = "/api/v1/projects/{id}"
P_FLOWS = "/api/v1/flows/"
P_FLOW = "/api/v1/flows/{id}"
P_MCP_SETTINGS = "/api/v1/mcp/project/{id}"
P_MCP_STREAMABLE = "/api/v1/mcp/project/{id}/streamable"
P_VARIABLES = "/api/v1/variables/"
P_VARIABLE = "/api/v1/variables/{id}"
P_RUN = "/api/v1/run/{name}"

# endpoint_name -> flow settings. Order matters: ingest runs after the flows exist.
FLOWS: dict[str, dict[str, Any]] = {
    "checkin_triage": {
        "name": "checkin_triage",
        "mcp": True,
        "description": (
            "Triage a redacted daily check-in. Input: JSON string {text, chips, dose_status, "
            "treatment_day, context}. Output: JSON {extracted, level, risk, reasons, "
            "family_message, nurse_line, citations}. Rules decide the level."
        ),
        "prompts": {"Prompt Template-extract": "extract.id.md"},
    },
    "ask_guideline": {
        "name": "ask_guideline",
        "mcp": True,
        "description": (
            "Answer a family question only from the reviewed guideline corpus, with citations, "
            'or abstain. Input: JSON string {"question": "..."}. Output: JSON {answer, '
            "citations, retrieved_ids, abstained}."
        ),
        "prompts": {"Prompt Template-ask": "ask.id.md"},
    },
    "nurse_digest": {
        "name": "nurse_digest",
        "mcp": True,
        "description": (
            'Ranked nurse digest for a Puskesmas and date. Input: "<puskesmas_id> [YYYY-MM-DD]" '
            "or JSON {puskesmas_id, date}. Output: JSON {ok, error, entries[{rank, code, score, "
            "band, level, reason, suggested_action}], summary_source}. Order is the app's."
        ),
        "prompts": {"Prompt Template-digest": "digest.id.md"},
    },
    "ingest_corpus": {
        "name": "ingest_corpus",
        "mcp": False,
        "description": "Admin only: load the corpus bundle into Chroma (collection tuntastb_corpus).",
        "prompts": {},
    },
}

RULE_FIELDS = {
    "triage_table_json": "triage-table.json",
    "lexicon_json": "lexicon.id.json",
    "risk_points_json": "risk-points.json",
}
BUNDLE_SEPARATOR = "<<<SECTION>>>"


class DeployError(RuntimeError):
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


def load_config(env: dict[str, str] | None = None, dotenv: Path | None = None) -> dict[str, Any]:
    """Environment first, then ``.env``. Never logs secret values."""
    file_values = read_dotenv(dotenv if dotenv is not None else ROOT / ".env")
    env = dict(os.environ) if env is None else env

    def get(key: str, default: str = "") -> str:
        v = env.get(key)
        if v is None or v == "":
            v = file_values.get(key, "")
        return v if v != "" else default

    return {
        "base_url": get("LANGFLOW_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
        "api_key": get("LANGFLOW_API_KEY"),
        "model": get("LANGFLOW_LLM_MODEL", DEFAULT_MODEL),
        "temperature": float(get("LANGFLOW_LLM_TEMPERATURE", "0")),
        "ask_min_score": get("ASK_MIN_SCORE"),
        "app_url": get("TUNTAS_APP_URL", DEFAULT_APP_URL).rstrip("/"),
        "internal_token": get("INTERNAL_API_TOKEN"),
    }


# --------------------------------------------------------------------------
# Component sources
# --------------------------------------------------------------------------


def _is_component_class(node: ast.ClassDef) -> bool:
    for base in node.bases:
        name = base.id if isinstance(base, ast.Name) else base.attr if isinstance(base, ast.Attribute) else ""
        if name == "Component":
            return True
    return False


def _component_name(node: ast.ClassDef) -> str | None:
    for stmt in node.body:
        if (
            isinstance(stmt, ast.Assign)
            and any(isinstance(t, ast.Name) and t.id == "name" for t in stmt.targets)
            and isinstance(stmt.value, ast.Constant)
            and isinstance(stmt.value.value, str)
        ):
            return stmt.value.value
    return None


def component_registry(components_dir: Path = COMPONENTS_DIR) -> dict[str, tuple[Path, str]]:
    """Langflow component ``name`` -> (file, class name) for every component class."""
    registry: dict[str, tuple[Path, str]] = {}
    for path in sorted(components_dir.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef) and _is_component_class(node):
                name = _component_name(node)
                if name:
                    if name in registry:
                        raise DeployError(f"component name {name!r} defined twice")
                    registry[name] = (path, node.name)
    return registry


def _span(node: ast.stmt) -> tuple[int, int]:
    """0-based [start, end) line span of a statement including decorators."""
    decorators = getattr(node, "decorator_list", [])
    start = min([node.lineno] + [d.lineno for d in decorators]) - 1
    return start, node.end_lineno or node.lineno


def _is_guard(node: ast.stmt) -> bool:
    return (
        isinstance(node, ast.If)
        and isinstance(node.test, ast.Name)
        and node.test.id == "_HAS_LANGFLOW"
        and not node.orelse
    )


def _sets_has_langflow(node: ast.stmt) -> bool:
    return any(
        isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "_HAS_LANGFLOW" for t in n.targets)
        for n in ast.walk(node)
    )


def _import_branches(node: ast.Try) -> list[list[ast.stmt]]:
    """Import blocks of a ``try: import ... except ImportError: try: ...`` chain."""
    branches = [node.body]
    for handler in node.handlers:
        for stmt in handler.body:
            if isinstance(stmt, ast.Try):
                branches += _import_branches(stmt)
    return branches


def _guarded_imports(node: ast.Try, src_lines: list[str]) -> str:
    """Plain imports replacing the guarded import chain (prefer the ``lfx`` branch).

    Langflow builds a component by executing the module's top-level imports and
    definitions; imports inside ``try`` are not executed, so they are unwrapped here.
    """
    branches = _import_branches(node)

    def is_lfx(branch: list[ast.stmt]) -> bool:
        return any(isinstance(s, ast.ImportFrom) and (s.module or "").startswith("lfx") for s in branch)

    branch = next((b for b in branches if is_lfx(b)), branches[0])
    out = []
    for stmt in branch:
        if isinstance(stmt, (ast.Import, ast.ImportFrom)):
            out.append(textwrap.dedent("".join(src_lines[stmt.lineno - 1 : stmt.end_lineno])))
    out.append("_HAS_LANGFLOW = True\n")
    return "".join(out)


def component_source(path: Path, class_name: str) -> str:
    """Langflow-ready source for one component class of a file.

    Langflow instantiates the first *top-level* ``Component`` subclass it finds in a
    node's code and only executes top-level imports. Our files keep the Langflow
    imports in ``try/except ImportError`` and the classes behind ``if _HAS_LANGFLOW:``
    (so pytest runs without Langflow) and may hold several components. For each node
    the guarded imports are unwrapped, the selected class is hoisted out of the guard
    and every other component class is removed. Shared helpers stay. The files
    themselves are not changed.
    """
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    lines = src.splitlines(keepends=True)
    replacements: list[tuple[int, int, str]] = []
    found = False

    def other_component(n: ast.stmt) -> bool:
        return isinstance(n, ast.ClassDef) and _is_component_class(n) and n.name != class_name

    for top in tree.body:
        if isinstance(top, ast.Try) and _sets_has_langflow(top):
            replacements.append((top.lineno - 1, top.end_lineno, _guarded_imports(top, lines)))
        elif isinstance(top, ast.ClassDef) and _is_component_class(top):
            if top.name == class_name:
                found = True
            else:
                s, e = _span(top)
                replacements.append((s, e, ""))
        elif _is_guard(top):
            if any(isinstance(n, ast.ClassDef) and n.name == class_name for n in top.body):
                found = True
            drops = [_span(n) for n in top.body if other_component(n)]
            body = [lines[i] for i in range(top.lineno, top.end_lineno) if not any(s <= i < e for s, e in drops)]
            replacements.append((top.lineno - 1, top.end_lineno, textwrap.dedent("".join(body))))
    if not found:
        raise DeployError(f"class {class_name} not found in {path.name}")
    for s, e, text in sorted(replacements, reverse=True):
        lines[s:e] = [text]
    out = re.sub(r"\n{4,}", "\n\n\n", "".join(lines))
    tree = ast.parse(out)  # still valid Python
    top_classes = [n.name for n in tree.body if isinstance(n, ast.ClassDef) and _is_component_class(n)]
    if top_classes != [class_name]:
        raise DeployError(f"{path.name}: expected only {class_name} at top level, got {top_classes}")
    return out


# --------------------------------------------------------------------------
# Corpus bundle
# --------------------------------------------------------------------------


def corpus_bundle(corpus_dir: Path = CORPUS_DIR) -> tuple[str, list[str]]:
    """Ingest bundle text (one chunk per section) and the section ids, in order."""
    sys.path.insert(0, str(corpus_dir))
    try:
        import build_manifest  # corpus/build_manifest.py
    finally:
        sys.path.pop(0)
    sections = build_manifest.load_sections(corpus_dir)
    chunks = [build_manifest.chunk_text(s) for s in sections]
    return f"\n\n{BUNDLE_SEPARATOR}\n\n".join(chunks), [s["id"] for s in sections]


# --------------------------------------------------------------------------
# Flow injection and export
# --------------------------------------------------------------------------


def _model_value(model: str) -> list[dict[str, Any]]:
    return [
        {
            "icon": "GoogleGenerativeAI",
            "metadata": {"model_type": "llm", "icon": "GoogleGenerativeAI", "tool_calling": True},
            "name": model,
            "provider": MODEL_PROVIDER,
        }
    ]


def inject(
    flow: dict[str, Any],
    endpoint: str,
    config: dict[str, Any],
    registry: dict[str, tuple[Path, str]] | None = None,
    rules_dir: Path = RULES_DIR,
    prompts_dir: Path = PROMPTS_DIR,
) -> dict[str, Any]:
    """Return a copy of ``flow`` with sources, rules, prompts and settings filled in."""
    flow = copy.deepcopy(flow)
    registry = component_registry() if registry is None else registry
    rules = {field: (rules_dir / name).read_text(encoding="utf-8") for field, name in RULE_FIELDS.items()}
    prompts = FLOWS.get(endpoint, {}).get("prompts", {})
    for node in flow["data"]["nodes"]:
        data = node.get("data", {})
        template = data.get("node", {}).get("template")
        if not isinstance(template, dict):
            continue
        ntype = data.get("type")
        if ntype in registry and "code" in template:
            path, cls = registry[ntype]
            template["code"]["value"] = component_source(path, cls)
        for field, text in rules.items():
            if field in template:
                template[field]["value"] = text
        if node["id"] in prompts and "template" in template:
            template["template"]["value"] = (prompts_dir / prompts[node["id"]]).read_text(encoding="utf-8")
        if ntype == "LanguageModelComponent":
            template["model"]["value"] = _model_value(config["model"])
            if "temperature" in template:
                template["temperature"]["value"] = config["temperature"]
        if ntype == "TuntasRelevanceGate" and config.get("ask_min_score"):
            template["min_score"]["value"] = float(config["ask_min_score"])
        if ntype == "TuntasQueueReader":
            template["base_url"].update({"value": "TUNTAS_APP_URL", "load_from_db": True})
            template["internal_token"].update({"value": "TUNTAS_INTERNAL_TOKEN", "load_from_db": True})
        _blank_secrets(template)
    return flow


def _blank_secrets(template: dict[str, Any]) -> None:
    """Secret fields hold either nothing or a global-variable name, never a value."""
    for name, field in template.items():
        if not isinstance(field, dict):
            continue
        secret = field.get("password") or field.get("_input_type") == "SecretStrInput" or name == "api_key"
        if secret and not field.get("load_from_db"):
            field["value"] = ""


_EXPORT_DROP = ("user_id", "folder_id", "workspace_id", "updated_at", "id")


def strip_for_export(flow: dict[str, Any]) -> dict[str, Any]:
    """Flow as committed: no ids of this install, no secrets, rule/prompt text removed.

    Rule JSON and prompts are re-injected from ``rules/`` and ``langflow/prompts/`` on
    every deploy, so the export does not carry a second, drifting copy of them.
    """
    flow = copy.deepcopy(flow)
    for key in _EXPORT_DROP:
        flow.pop(key, None)
    prompts = FLOWS.get(flow.get("endpoint_name") or "", {}).get("prompts", {})
    for node in flow.get("data", {}).get("nodes", []):
        data = node.get("data", {})
        template = data.get("node", {}).get("template")
        if not isinstance(template, dict):
            continue
        _blank_secrets(template)
        for field in RULE_FIELDS:
            if field in template:
                template[field]["value"] = ""
        if node.get("id") in prompts and "template" in template:
            template["template"]["value"] = f"(injected from langflow/prompts/{prompts[node['id']]})"
        for meta in ("_frontend_node_flow_id", "_frontend_node_folder_id"):
            template.pop(meta, None)
    return flow


# --------------------------------------------------------------------------
# HTTP client with a write guard
# --------------------------------------------------------------------------


class LangflowClient:
    """Thin httpx wrapper. Every write is checked against the TuntasTB scope."""

    def __init__(self, base_url: str, api_key: str, transport: httpx.BaseTransport | None = None, timeout: float = 120.0):
        if not api_key:
            raise DeployError("LANGFLOW_API_KEY is not set (environment or .env)")
        self.http = httpx.Client(
            base_url=base_url,
            headers={"x-api-key": api_key, "accept": "application/json"},
            transport=transport,
            timeout=timeout,
        )
        self.project_id: str | None = None
        self.project_flow_ids: set[str] = set()
        self.owned_variable_ids: set[str] = set()

    def get(self, path: str, **kw: Any) -> Any:
        r = self.http.get(path, **kw)
        if r.status_code >= 400:
            raise DeployError(f"GET {path} -> HTTP {r.status_code}: {r.text[:300]}")
        return r.json()

    def _allowed(self, method: str, path: str, body: Any) -> bool:
        pid = self.project_id
        if method == "POST" and path == P_PROJECTS:
            return isinstance(body, dict) and body.get("name") == PROJECT_NAME
        if method == "POST" and path == P_FLOWS:
            return pid is not None and isinstance(body, dict) and body.get("folder_id") == pid
        m = re.fullmatch(r"/api/v1/flows/([0-9a-f-]+)", path)
        if m and method in ("PATCH", "PUT"):
            return m.group(1) in self.project_flow_ids and (body or {}).get("folder_id") in (None, pid)
        if pid and path == P_MCP_SETTINGS.format(id=pid) and method == "PATCH":
            return all(s.get("id") in self.project_flow_ids for s in (body or {}).get("settings", []))
        if method == "POST" and path == P_VARIABLES:
            return isinstance(body, dict) and body.get("name") in OWNED_VARIABLES
        m = re.fullmatch(r"/api/v1/variables/([0-9a-f-]+)", path)
        if m and method == "PATCH":
            return m.group(1) in self.owned_variable_ids and (body or {}).get("name") in OWNED_VARIABLES
        if method == "POST" and path == P_RUN.format(name="ingest_corpus"):
            return True
        return False

    def _write(self, method: str, path: str, body: Any, timeout: float | None = None) -> Any:
        if not self._allowed(method, path, body):
            raise DeployError(f"refusing {method} {path}: outside the {PROJECT_NAME} project")
        kw: dict[str, Any] = {"json": body}
        if timeout is not None:
            kw["timeout"] = timeout
        r = self.http.request(method, path, **kw)
        if r.status_code >= 400:
            raise DeployError(f"{method} {path} -> HTTP {r.status_code}: {r.text[:500]}")
        return r.json() if r.content else None

    def post(self, path: str, body: Any, timeout: float | None = None) -> Any:
        return self._write("POST", path, body, timeout)

    def patch(self, path: str, body: Any) -> Any:
        return self._write("PATCH", path, body)


# --------------------------------------------------------------------------
# Deploy
# --------------------------------------------------------------------------


def _items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        for key in ("items", "flows", "projects"):
            if isinstance(value.get(key), list):
                return value[key]
            if isinstance(value.get(key), dict) and isinstance(value[key].get("items"), list):
                return value[key]["items"]
        return []
    return value if isinstance(value, list) else []


def load_flow_files(flows_dir: Path = FLOWS_DIR) -> dict[str, dict[str, Any]]:
    flows = {}
    for endpoint in FLOWS:
        path = flows_dir / f"{endpoint}.json"
        if not path.is_file():
            raise DeployError(f"missing flow file {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")
        flows[endpoint] = json.loads(path.read_text(encoding="utf-8"))
    return flows


def deploy(
    client: LangflowClient | None,
    config: dict[str, Any],
    flows: dict[str, dict[str, Any]],
    *,
    dry_run: bool = False,
    ingest: bool = True,
    bundle: tuple[str, list[str]] | None = None,
    registry: dict[str, tuple[Path, str]] | None = None,
    log: Callable[[str], None] = print,
) -> dict[str, Any]:
    """Run the deploy. With ``dry_run`` only GETs are made and planned writes are printed."""
    result: dict[str, Any] = {"project_id": None, "flows": {}, "planned": [], "ingest": None}

    def plan(action: str) -> None:
        result["planned"].append(action)
        log(("[dry-run] " if dry_run else "") + action)

    # 1. Project (and refuse early if our endpoint names belong to someone else)
    projects = _items(client.get(P_PROJECTS)) if client else []
    matches = [p for p in projects if p.get("name") == PROJECT_NAME]
    if len(matches) > 1:
        raise DeployError(f"{len(matches)} projects named {PROJECT_NAME}; resolve by hand first")
    known_pid = matches[0]["id"] if matches else None
    if client:
        for f in _items(client.get(P_FLOWS, params={"get_all": "true", "header_flows": "true"})):
            if f.get("endpoint_name") in FLOWS and f.get("folder_id") != known_pid:
                raise DeployError(
                    f"endpoint_name {f['endpoint_name']!r} is used by flow {f.get('id')} outside {PROJECT_NAME}; "
                    "not touching it"
                )
    if matches:
        pid = known_pid
        log(f"project {PROJECT_NAME}: found {pid}")
    else:
        plan(f"POST {P_PROJECTS} name={PROJECT_NAME}")
        pid = None
        if not dry_run:
            created = client.post(P_PROJECTS, {"name": PROJECT_NAME, "description": PROJECT_DESCRIPTION,
                                               "components_list": [], "flows_list": []})
            pid = created["id"]
            log(f"project {PROJECT_NAME}: created {pid}")
    result["project_id"] = pid
    if client:
        client.project_id = pid

    # 2. Existing flows in the project
    existing: dict[str, dict[str, Any]] = {}
    if client and pid:
        for f in _items(client.get(P_PROJECT.format(id=pid))):
            if f.get("endpoint_name"):
                existing[f["endpoint_name"]] = f
        client.project_flow_ids = {f["id"] for f in existing.values()}

    # 3. Global variables owned by TuntasTB
    if client:
        variables = {v["name"]: v for v in _items(client.get(P_VARIABLES)) if v.get("name") in OWNED_VARIABLES}
        client.owned_variable_ids = {v["id"] for v in variables.values()}
        wanted = {
            "TUNTAS_APP_URL": ("Generic", config["app_url"]),
            "TUNTAS_INTERNAL_TOKEN": ("Credential", config["internal_token"] or "unset"),
        }
        for name, (vtype, value) in wanted.items():
            if name in variables:
                plan(f"PATCH {P_VARIABLE.format(id=variables[name]['id'])} name={name}")
                if not dry_run:
                    client.patch(P_VARIABLE.format(id=variables[name]["id"]),
                                 {"id": variables[name]["id"], "name": name, "value": value})
            else:
                plan(f"POST {P_VARIABLES} name={name} type={vtype}")
                if not dry_run:
                    client.post(P_VARIABLES, {"name": name, "value": value, "type": vtype, "default_fields": []})

    # 4. Flows
    for endpoint, settings in FLOWS.items():
        data = inject(flows[endpoint], endpoint, config, registry=registry)
        body = {
            "name": settings["name"],
            "description": settings["description"],
            "data": data["data"],
            "endpoint_name": endpoint,
            "folder_id": pid,
            "mcp_enabled": settings["mcp"],
            "action_name": endpoint,
            "action_description": settings["description"],
            "locked": False,
        }
        if endpoint in existing:
            fid = existing[endpoint]["id"]
            plan(f"PATCH {P_FLOW.format(id=fid)} endpoint_name={endpoint}")
            if not dry_run:
                client.patch(P_FLOW.format(id=fid), body)
        else:
            plan(f"POST {P_FLOWS} endpoint_name={endpoint}")
            fid = None
            if not dry_run:
                fid = client.post(P_FLOWS, body)["id"]
                client.project_flow_ids.add(fid)
        result["flows"][endpoint] = fid

    # 5. MCP tools
    if pid:
        settings_body = {
            "settings": [
                {
                    "id": fid,
                    "mcp_enabled": FLOWS[ep]["mcp"],
                    "action_name": ep,
                    "action_description": FLOWS[ep]["description"],
                    "name": FLOWS[ep]["name"],
                    "description": FLOWS[ep]["description"],
                }
                for ep, fid in result["flows"].items()
                if fid
            ]
        }
        plan(f"PATCH {P_MCP_SETTINGS.format(id=pid)} tools={[ep for ep in FLOWS if FLOWS[ep]['mcp']]}")
        if not dry_run:
            client.patch(P_MCP_SETTINGS.format(id=pid), settings_body)
    else:
        plan(f"PATCH {P_MCP_SETTINGS.format(id='<new project>')} tools={[ep for ep in FLOWS if FLOWS[ep]['mcp']]}")

    # 6. Corpus
    if ingest:
        text, ids = bundle or corpus_bundle()
        plan(f"POST {P_RUN.format(name='ingest_corpus')} sections={len(ids)}")
        if not dry_run:
            resp = client.post(P_RUN.format(name="ingest_corpus"),
                               {"input_value": text, "input_type": "chat", "output_type": "chat"}, timeout=600)
            result["ingest"] = first_chat_text(resp)
            log(f"ingest_corpus: {result['ingest']}")

    url = config["base_url"] + P_MCP_STREAMABLE.format(id=pid or "<PROJECT_ID>")
    result["mcp_url"] = url
    log(f"PROJECT_ID={pid or '<created on a real run>'}")
    log(f"MCP_STREAMABLE_URL={url}")
    return result


def first_chat_text(resp: Any) -> str | None:
    """First non-empty chat message text in a /api/v1/run response."""
    for run in (resp or {}).get("outputs", []):
        for out in run.get("outputs", []):
            for key in ("results", "outputs"):
                block = out.get(key) or {}
                msg = block.get("message") if isinstance(block, dict) else None
                if isinstance(msg, dict):
                    text = msg.get("text") or (msg.get("message") if isinstance(msg.get("message"), str) else None)
                    if text:
                        return text
            for msg in out.get("messages", []) or []:
                if msg.get("message"):
                    return msg["message"]
    return None


def export_flows(client: LangflowClient, flow_ids: dict[str, str], flows_dir: Path = FLOWS_DIR, log: Callable[[str], None] = print) -> None:
    for endpoint, fid in flow_ids.items():
        if not fid:
            continue
        flow = strip_for_export(client.get(P_FLOW.format(id=fid)))
        path = flows_dir / f"{endpoint}.json"
        path.write_text(json.dumps(flow, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        log(f"exported {path.relative_to(ROOT)}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="print the planned calls; only GET requests are made")
    ap.add_argument("--skip-ingest", action="store_true", help="do not run ingest_corpus")
    ap.add_argument("--export", action="store_true", help="after deploying, write the server copies back to langflow/flows/")
    args = ap.parse_args(argv)
    config = load_config()
    try:
        client = LangflowClient(config["base_url"], config["api_key"])
        result = deploy(client, config, load_flow_files(), dry_run=args.dry_run, ingest=not args.skip_ingest)
        if args.export and not args.dry_run:
            export_flows(client, result["flows"])
    except (DeployError, httpx.HTTPError) as e:
        print(f"deploy failed: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
