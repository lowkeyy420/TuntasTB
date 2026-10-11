"""Corpus Sync and Ingest Report for the ``ingest_corpus`` flow.

The flow (admin only, not an MCP tool)::

    Chat Input (corpus bundle built by deploy_flows.py from corpus/*.md)
      -> Split Text (one chunk per section, on the bundle separator)
      -> Corpus Sync (removes stored chunks that are no longer in the corpus,
                      passes on only chunks that are not stored yet)
      -> Chroma (collection tuntastb_corpus) <- Embedding Model
      -> Ingest Report -> Chat Output

Running the flow twice leaves exactly one copy of each section; editing a section
replaces its old copy. Each chunk starts with ``[section_id: <doc>#<slug>]`` and
``[label: ...]`` lines, which ``ask_parts.parse_chunk`` reads back at query time.
"""

from __future__ import annotations

import json
import re
from typing import Any

_SECTION_ID = re.compile(r"^\s*\[section_id:\s*([^\]\s]+)\s*\]\s*$", re.MULTILINE)


def plan_sync(stored: list[tuple[str, str]], incoming: list[str]) -> dict[str, Any]:
    """What to delete and what to add so the store holds each incoming text once.

    ``stored`` is ``[(id, text), ...]`` from the collection; ``incoming`` the chunk
    texts of this run. Returns ``{"delete_ids", "add_texts", "kept"}``.
    """
    wanted = {t.strip() for t in incoming if t and t.strip()}
    delete_ids: list[str] = []
    kept: set[str] = set()
    for doc_id, text in stored:
        t = (text or "").strip()
        if t in wanted and t not in kept:
            kept.add(t)
        else:
            delete_ids.append(doc_id)
    add_texts: list[str] = []
    for t in incoming:
        t = (t or "").strip()
        if t and t not in kept and t not in add_texts:
            add_texts.append(t)
    return {"delete_ids": delete_ids, "add_texts": add_texts, "kept": len(kept)}


def section_ids(texts: list[str]) -> list[str]:
    ids = []
    for t in texts:
        m = _SECTION_ID.search(t or "")
        if m:
            ids.append(m.group(1))
    return ids


def _texts(value: Any) -> list[str]:
    """Chunk texts from a DataFrame/Table, a list of Data/JSON, or one Data."""
    if value is None:
        return []
    if hasattr(value, "to_data_list"):
        value = value.to_data_list()
    if not isinstance(value, list):
        value = [value]
    out = []
    for item in value:
        data = getattr(item, "data", item)
        if isinstance(data, dict):
            out.append(str(data.get("text") or ""))
        else:
            out.append(str(getattr(item, "text", "") or ""))
    return [t for t in out if t.strip()]


# --------------------------------------------------------------------------
# Langflow components (defined only when Langflow is installed)
# --------------------------------------------------------------------------

try:  # Langflow 1.7+ (lfx)
    from lfx.custom.custom_component.component import Component
    from lfx.io import DataInput, HandleInput, Output, StrInput
    from lfx.schema.data import Data
    from lfx.schema.message import Message

    _HAS_LANGFLOW = True
except ImportError:
    try:  # older Langflow 1.x
        from langflow.custom import Component
        from langflow.io import DataInput, HandleInput, Output, StrInput
        from langflow.schema import Data
        from langflow.schema.message import Message

        _HAS_LANGFLOW = True
    except ImportError:
        _HAS_LANGFLOW = False

if _HAS_LANGFLOW:

    class CorpusSyncComponent(Component):  # type: ignore[misc]
        display_name = "Corpus Sync"
        description = "Deletes stale corpus chunks from Chroma and passes on only new chunks."
        icon = "RefreshCw"
        name = "TuntasCorpusSync"

        inputs = [
            HandleInput(
                name="chunks",
                display_name="Chunks",
                input_types=["Data", "JSON", "DataFrame", "Table"],
                is_list=True,
            ),
            HandleInput(name="embedding", display_name="Embedding", input_types=["Embeddings"]),
            StrInput(name="persist_directory", display_name="Persist Directory", value="/app/langflow/tuntastb_chroma"),
            StrInput(name="collection_name", display_name="Collection Name", value="tuntastb_corpus"),
        ]
        outputs = [
            Output(display_name="New chunks", name="new_chunks", method="new_chunks_out"),
            Output(display_name="Report", name="report", method="report_out"),
        ]

        def _sync(self) -> dict:
            if hasattr(self, "_tuntas_sync"):
                return self._tuntas_sync
            from langchain_chroma import Chroma
            from lfx.base.vectorstores.chroma_security import chroma_langchain_collection_kwargs
            from lfx.base.vectorstores.user_scoping import runtime_user_id, scoped_collection_name

            chunks = self.chunks
            incoming: list[str] = []
            for c in chunks if isinstance(chunks, list) else [chunks]:
                incoming += _texts(c)
            store = Chroma(
                persist_directory=str(self.resolve_path(self.persist_directory)),
                embedding_function=self.embedding,
                collection_name=scoped_collection_name(self.collection_name, runtime_user_id(self)),
                **chroma_langchain_collection_kwargs(),
            )
            got = store.get(include=["documents"])
            stored = list(zip(got.get("ids", []), got.get("documents", [])))
            plan = plan_sync(stored, incoming)
            if plan["delete_ids"]:
                store.delete(ids=plan["delete_ids"])
            self._tuntas_sync = {
                "sections": len(incoming),
                "stored_before": len(stored),
                "removed": len(plan["delete_ids"]),
                "added": len(plan["add_texts"]),
                "kept": plan["kept"],
                "section_ids": section_ids(incoming),
                "add_texts": plan["add_texts"],
            }
            return self._tuntas_sync

        def new_chunks_out(self) -> list[Data]:
            s = self._sync()
            self.status = f"sections={s['sections']} added={s['added']} removed={s['removed']}"
            return [Data(text=t) for t in s["add_texts"]]

        def report_out(self) -> Data:
            s = self._sync()
            return Data(data={k: v for k, v in s.items() if k != "add_texts"})

    class IngestReportComponent(Component):  # type: ignore[misc]
        display_name = "Ingest Report"
        description = "Summarises an ingest run (runs after the Chroma node)."
        icon = "ClipboardCheck"
        name = "TuntasIngestReport"

        inputs = [
            DataInput(name="report", display_name="Sync report"),
            HandleInput(
                name="stored",
                display_name="Chroma output",
                input_types=["Data", "JSON", "DataFrame", "Table"],
                is_list=True,
                required=False,
            ),
        ]
        outputs = [Output(display_name="Report", name="report_text", method="report_out")]

        def report_out(self) -> Message:
            report = getattr(self.report, "data", self.report) or {}
            self.status = report
            return Message(text=json.dumps(report, ensure_ascii=False))
