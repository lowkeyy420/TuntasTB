#!/usr/bin/env python3
"""Author the four TuntasTB flow graphs into ``langflow/flows/*.json``.

This is the one-time "build in the editor" step, done as code so it is
reproducible. It reads node templates from the running Langflow (read-only):

* built-in nodes are copied from the reference flows of the existing project
  (Chat Input/Output, Prompt Template, Language Model, Embedding Model, Chroma,
  Split Text) and from ``GET /api/v1/all`` (Text Input);
* custom nodes come from ``POST /api/v1/custom_component`` with the per-node source
  that ``deploy_flows.component_source`` produces.

It writes nothing to Langflow. Then run ``deploy_flows.py --export`` to push the
flows and write the server's copies back to ``langflow/flows/``.

Usage::

    python langflow/scripts/build_flows.py [endpoint ...]   # e.g. checkin_triage only
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import deploy_flows as d  # noqa: E402

# Reference flows in the existing project (read only).
QUICK_TUTOR = "d91974a4-d10a-4d22-8920-59df94fae51f"  # ChatInput, Chroma, Prompt, LLM, ChatOutput, Embedding
STUDY_NOTES = "c50dd0ed-c419-49b8-9ccf-3cc3d8402c1a"  # SplitText, Embedding, Chroma
CHROMA_TYPE = "ext:chroma:ChromaVectorStoreComponent@official"
CHROMA_DIR = "/app/langflow/tuntastb_chroma"
CHROMA_COLLECTION = "tuntastb_corpus"


def _enc(handle: dict[str, Any]) -> str:
    return json.dumps(handle, separators=(",", ":"), ensure_ascii=False).replace('"', "œ")


class Builder:
    def __init__(self, client: d.LangflowClient):
        self.client = client
        self.registry = d.component_registry()
        self.builtin: dict[str, dict[str, Any]] = {}
        for fid in (QUICK_TUTOR, STUDY_NOTES):
            for n in client.get(d.P_FLOW.format(id=fid))["data"]["nodes"]:
                t = n["data"].get("type")
                if n.get("type") == "genericNode" and t not in self.builtin:
                    self.builtin[t] = copy.deepcopy(n["data"]["node"])
        everything = client.get("/api/v1/all")
        for cat in everything.values():
            if isinstance(cat, dict) and "TextInput" in cat and "TextInput" not in self.builtin:
                self.builtin["TextInput"] = copy.deepcopy(cat["TextInput"])
        self.custom: dict[str, dict[str, Any]] = {}

    def template_for(self, ntype: str) -> dict[str, Any]:
        if ntype in self.registry:
            if ntype not in self.custom:
                path, cls = self.registry[ntype]
                r = self.client.http.post("/api/v1/custom_component", json={"code": d.component_source(path, cls)})
                if r.status_code != 200:
                    raise d.DeployError(f"custom_component {ntype}: HTTP {r.status_code} {r.text[:300]}")
                self.custom[ntype] = r.json()["data"]
            return copy.deepcopy(self.custom[ntype])
        if ntype not in self.builtin:
            raise d.DeployError(f"no template for {ntype}")
        node = copy.deepcopy(self.builtin[ntype])
        for key in ("_frontend_node_flow_id", "_frontend_node_folder_id"):
            node["template"].pop(key, None)
        return node


class Flow:
    def __init__(self, b: Builder):
        self.b = b
        self.nodes: list[dict[str, Any]] = []
        self.edges: list[dict[str, Any]] = []

    def add(self, ntype: str, key: str, x: float, y: float, **values: Any) -> dict[str, Any]:
        nid = f"{ntype}-{key}"
        fn = self.b.template_for(ntype)
        for field, value in values.items():
            if field not in fn["template"]:
                raise d.DeployError(f"{nid}: no field {field}")
            fn["template"][field]["value"] = value
        node = {
            "id": nid,
            "type": "genericNode",
            "position": {"x": x, "y": y},
            "data": {"id": nid, "type": ntype, "node": fn, "showNode": True},
        }
        self.nodes.append(node)
        return node

    def connect(self, src: dict[str, Any], output: str, tgt: dict[str, Any], field: str) -> None:
        outs = {o["name"]: o for o in src["data"]["node"]["outputs"]}
        if output not in outs:
            raise d.DeployError(f"{src['id']}: no output {output} (has {list(outs)})")
        f = tgt["data"]["node"]["template"].get(field)
        if f is None:
            raise d.DeployError(f"{tgt['id']}: no field {field}")
        sh = {"dataType": src["data"]["type"], "id": src["id"], "name": output, "output_types": outs[output]["types"]}
        th = {"fieldName": field, "id": tgt["id"], "inputTypes": f.get("input_types"), "type": f.get("type")}
        self.edges.append(
            {
                "animated": False,
                "className": "",
                "data": {"sourceHandle": sh, "targetHandle": th},
                "id": f"reactflow__edge-{src['id']}{_enc(sh)}-{tgt['id']}{_enc(th)}",
                "selected": False,
                "source": src["id"],
                "sourceHandle": _enc(sh),
                "target": tgt["id"],
                "targetHandle": _enc(th),
            }
        )

    def prompt(self, key: str, x: float, y: float, variables: list[str]) -> dict[str, Any]:
        node = self.add("Prompt Template", key, x, y)
        fn = node["data"]["node"]
        tpl = fn["template"]
        sample = None
        for name in list(fn.get("custom_fields", {}).get("template", [])):
            sample = sample or copy.deepcopy(tpl[name])
            tpl.pop(name, None)
        sample = sample or {
            "field_type": "str", "required": False, "placeholder": "", "list": False, "show": True,
            "multiline": True, "value": "", "fileTypes": [], "file_path": "", "advanced": False,
            "input_types": ["Message"], "dynamic": False, "info": "", "load_from_db": False,
            "title_case": False, "type": "str",
        }
        for var in variables:
            field = copy.deepcopy(sample)
            field.update({"name": var, "display_name": var, "value": ""})
            tpl[var] = field
        fn["custom_fields"] = {"template": variables}
        tpl["use_double_brackets"]["value"] = True
        tpl["template"]["value"] = f"(injected from langflow/prompts/ by deploy_flows.py; variables: {variables})"
        return node

    def llm(self, key: str, x: float, y: float) -> dict[str, Any]:
        return self.add("LanguageModelComponent", key, x, y, system_message="", temperature=0.0, stream=False)

    def chat_input(self, key: str, x: float, y: float) -> dict[str, Any]:
        return self.add("ChatInput", key, x, y, should_store_message=False)

    def chat_output(self, key: str, x: float, y: float) -> dict[str, Any]:
        return self.add("ChatOutput", key, x, y, should_store_message=False)

    def chroma(self, key: str, x: float, y: float) -> dict[str, Any]:
        return self.add(
            CHROMA_TYPE, key, x, y,
            collection_name=CHROMA_COLLECTION, persist_directory=CHROMA_DIR, number_of_results=4,
            search_type="Similarity", allow_duplicates=False, should_cache_vector_store=False,
        )

    def embedding(self, key: str, x: float, y: float) -> dict[str, Any]:
        return self.add("EmbeddingModel", key, x, y)

    def export(self, endpoint: str) -> dict[str, Any]:
        return {
            "name": endpoint,
            "description": d.FLOWS[endpoint]["description"],
            "endpoint_name": endpoint,
            "data": {"nodes": self.nodes, "edges": self.edges, "viewport": {"x": 0, "y": 0, "zoom": 0.6}},
        }


def checkin_triage(b: Builder) -> dict[str, Any]:
    f = Flow(b)
    ci = f.chat_input("ci", 0, 300)
    parse = f.add("TuntasParseInput", "parse", 300, 300)
    prompt = f.prompt("extract", 650, 80, ["note"])
    llm = f.llm("extract", 1000, 80)
    guard = f.add("TuntasExtractionGuard", "guard", 1350, 200)
    triage = f.add("TriageRules", "triage", 1700, 300)
    snap = f.add("TuntasRiskSnapshot", "snapshot", 2050, 450)
    risk = f.add("RiskScore", "risk", 2400, 450)
    out = f.add("TuntasBuildOutput", "output", 2750, 300)
    co = f.chat_output("co", 3100, 300)
    # Explain stage (add-family-reply): query from symptom labels -> Chroma -> prompt -> guard.
    query = f.add("TuntasBuildQuery", "query", 2050, 750)
    emb = f.embedding("explain", 2050, 1100)
    chroma = f.chroma("explain", 2400, 900)
    secs = f.add("TuntasExplainSections", "sections", 2750, 900)
    eprompt = f.prompt("explain", 3100, 750, ["level", "symptoms", "sections"])
    explain = f.add("TuntasExplainGuard", "explain", 3450, 650)
    f.connect(ci, "message", parse, "input_value")
    f.connect(parse, "note", prompt, "note")
    f.connect(prompt, "prompt", guard, "prompt")
    f.connect(llm, "model_output", guard, "model")
    f.connect(parse, "parsed", guard, "parsed")
    f.connect(parse, "chips", triage, "chips")
    f.connect(parse, "note", triage, "text")
    f.connect(guard, "triage_context", triage, "context_json")
    f.connect(parse, "parsed", snap, "parsed")
    f.connect(guard, "extracted", snap, "extracted")
    f.connect(triage, "triage", snap, "triage")
    f.connect(snap, "snapshot", risk, "snapshot_json")
    f.connect(parse, "parsed", out, "parsed")
    f.connect(guard, "extracted", out, "extracted")
    f.connect(triage, "triage", out, "triage")
    f.connect(risk, "risk", out, "risk")
    f.connect(snap, "snapshot", out, "snapshot")
    f.connect(triage, "triage", query, "triage")
    f.connect(guard, "extracted", query, "extracted")
    f.connect(query, "query", chroma, "search_query")
    f.connect(emb, "embeddings", chroma, "embedding")
    f.connect(chroma, "search_results", secs, "search_results")
    f.connect(query, "level", eprompt, "level")
    f.connect(query, "symptoms", eprompt, "symptoms")
    f.connect(secs, "sections", eprompt, "sections")
    f.connect(eprompt, "prompt", explain, "prompt")
    f.connect(llm, "model_output", explain, "model")
    f.connect(secs, "retrieved", explain, "retrieved")
    f.connect(explain, "explanation", out, "explanation")
    f.connect(out, "output", co, "input_value")
    return f.export("checkin_triage")


def ask_guideline(b: Builder) -> dict[str, Any]:
    f = Flow(b)
    ci = f.chat_input("ci", 0, 300)
    q = f.add("TuntasParseQuestion", "question", 300, 300)
    emb = f.embedding("ask", 300, 650)
    chroma = f.chroma("ask", 650, 450)
    gate = f.add("TuntasRelevanceGate", "gate", 1000, 300)
    prompt = f.prompt("ask", 1350, 100, ["sections", "question"])
    llm = f.llm("ask", 1700, 100)
    answer = f.add("TuntasBuildAnswer", "answer", 2050, 200)
    co = f.chat_output("answer", 2400, 200)
    f.connect(ci, "message", q, "input_value")
    f.connect(q, "question", chroma, "search_query")
    f.connect(emb, "embeddings", chroma, "embedding")
    f.connect(emb, "embeddings", gate, "embedding")
    f.connect(chroma, "search_results", gate, "search_results")
    f.connect(q, "question", gate, "question")
    f.connect(gate, "sections", prompt, "sections")
    f.connect(q, "question", prompt, "question")
    f.connect(prompt, "prompt", answer, "prompt")
    f.connect(llm, "model_output", answer, "model")
    f.connect(gate, "gate", answer, "gate")
    f.connect(answer, "answer", co, "input_value")
    return f.export("ask_guideline")


def nurse_digest(b: Builder) -> dict[str, Any]:
    # Chat Input rather than Text Input: Langflow's MCP tool call (and the app's
    # input_type "chat") only feed Chat Input; a Text Input node receives nothing.
    f = Flow(b)
    ti = f.chat_input("request", 0, 300)
    reader = f.add("TuntasQueueReader", "reader", 300, 300)
    prompt = f.prompt("digest", 650, 150, ["entries"])
    llm = f.llm("digest", 1000, 150)
    merge = f.add("TuntasDigestMerge", "merge", 1350, 300)
    co = f.chat_output("co", 1700, 300)
    f.connect(ti, "message", reader, "request")
    f.connect(reader, "prompt_entries", prompt, "entries")
    f.connect(prompt, "prompt", merge, "prompt")
    f.connect(llm, "model_output", merge, "model")
    f.connect(reader, "queue", merge, "queue")
    f.connect(merge, "digest", co, "input_value")
    return f.export("nurse_digest")


def ingest_corpus(b: Builder) -> dict[str, Any]:
    f = Flow(b)
    ci = f.chat_input("bundle", 0, 300)
    split = f.add(
        "SplitText", "sections", 300, 300,
        separator=d.BUNDLE_SEPARATOR, chunk_size=10, chunk_overlap=0, keep_separator="False", clean_output=False,
    )
    emb = f.embedding("ingest", 300, 650)
    sync = f.add("TuntasCorpusSync", "sync", 650, 300,
                 persist_directory=CHROMA_DIR, collection_name=CHROMA_COLLECTION)
    chroma = f.chroma("ingest", 1000, 450)
    report = f.add("TuntasIngestReport", "report", 1350, 300)
    co = f.chat_output("co", 1700, 300)
    f.connect(ci, "message", split, "data_inputs")
    f.connect(split, "dataframe", sync, "chunks")
    f.connect(emb, "embeddings", sync, "embedding")
    f.connect(emb, "embeddings", chroma, "embedding")
    f.connect(sync, "new_chunks", chroma, "ingest_data")
    f.connect(sync, "report", report, "report")
    f.connect(chroma, "search_results", report, "stored")
    f.connect(report, "report_text", co, "input_value")
    return f.export("ingest_corpus")


def main(argv: list[str] | None = None) -> int:
    only = set((argv if argv is not None else sys.argv[1:]) or [])  # e.g. checkin_triage
    config = d.load_config()
    client = d.LangflowClient(config["base_url"], config["api_key"])
    b = Builder(client)
    for build in (checkin_triage, ask_guideline, nurse_digest, ingest_corpus):
        if only and build.__name__ not in only:
            continue
        flow = build(b)
        path = d.FLOWS_DIR / f"{flow['endpoint_name']}.json"
        path.write_text(json.dumps(d.strip_for_export(flow), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {path.relative_to(d.ROOT)} ({len(flow['data']['nodes'])} nodes, {len(flow['data']['edges'])} edges)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
