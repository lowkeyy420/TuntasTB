"""Tests for langflow/components/ask_parts.py (no Langflow needed)."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "langflow" / "components"))

import ask_parts as ap  # noqa: E402

CHUNKS = [
    {"id": "efek-samping-ringan#urin-merah", "label": "Panduan A, bagian kencing merah", "text": "Kencing merah wajar."},
    {"id": "tanda-bahaya#mata-kulit-kuning", "label": "Panduan B, bagian mata kuning", "text": "Mata kuning: ke Puskesmas."},
    {"id": "ambil-obat#jadwal-ambil", "label": "Panduan C, bagian jadwal", "text": "Ambil obat sesuai jadwal."},
]


def gate(scores=(0.81, 0.74, 0.62), min_score=0.7):
    return ap.relevance_gate(CHUNKS, list(scores), min_score)


def reply(answer="Warna kencing merah karena obat dan wajar.", ids=("efek-samping-ringan#urin-merah",), abstained=False):
    return json.dumps({"answer": answer, "citation_ids": list(ids), "abstained": abstained})


def test_parse_question():
    assert ap.parse_question('{"question": "  kenapa kencingnya merah?  "}') == "kenapa kencingnya merah?"
    assert ap.parse_question("kenapa merah?") == "kenapa merah?"
    assert ap.parse_question('{"q": 1}') == ""
    assert len(ap.parse_question("a" * 400)) == 300


def test_parse_chunk_reads_ingest_header():
    c = ap.parse_chunk("[section_id: efek-samping-ringan#urin-merah]\n[label: Panduan X, bagian y]\n## Judul\nIsi.")
    assert c == {"id": "efek-samping-ringan#urin-merah", "label": "Panduan X, bagian y", "text": "## Judul\nIsi."}
    assert ap.parse_chunk("tanpa header")["id"] is None


def test_cosine():
    assert ap.cosine([1, 0], [1, 0]) == pytest.approx(1.0)
    assert ap.cosine([1, 0], [0, 1]) == pytest.approx(0.0)
    assert ap.cosine([], [1]) == 0.0


def test_gate_orders_by_score_and_keeps_top_k():
    g = ap.relevance_gate(CHUNKS + [{**CHUNKS[0]}], [0.6, 0.9, 0.7, 0.99], 0.7, top_k=2)
    assert g["retrieved_ids"] == ["tanda-bahaya#mata-kulit-kuning", "ambil-obat#jadwal-ambil"]  # duplicate id dropped
    assert g["passed"] and g["best_score"] == 0.9


def test_below_threshold_abstains_without_model():
    g = gate(scores=(0.55, 0.5, 0.4))
    assert not g["passed"]
    out, reason = ap.build_answer(reply(), g)  # even a good-looking reply is ignored
    assert out == {"answer": "", "citations": [], "retrieved_ids": g["retrieved_ids"], "abstained": True}
    assert reason == "low_relevance"


def test_empty_retrieval_abstains():
    g = ap.relevance_gate([], [], 0.7)
    assert not g["passed"] and g["retrieved_ids"] == []


def test_citation_mapping_and_retrieved_ids():
    g = gate()
    out, reason = ap.build_answer(reply(ids=["efek-samping-ringan#urin-merah", "efek-samping-ringan#urin-merah"]), g)
    assert reason is None and out["abstained"] is False
    assert out["citations"] == [{"id": "efek-samping-ringan#urin-merah", "label": "Panduan A, bagian kencing merah"}]
    assert out["retrieved_ids"] == ["efek-samping-ringan#urin-merah", "tanda-bahaya#mata-kulit-kuning", "ambil-obat#jadwal-ambil"]
    assert set(out) == {"answer", "citations", "retrieved_ids", "abstained"}


@pytest.mark.parametrize("model_text,reason", [
    ("bukan json", "model_output_invalid"),
    (reply(abstained=True), "model_abstained"),
    (reply(answer="  "), "empty_answer"),
    (reply(ids=[]), "no_citation"),
    (reply(ids=["peran-pendamping#tugas-pendamping"]), "citation_not_retrieved"),
    (reply(ids=["efek-samping-ringan#urin-merah", "tidak-ada#x"]), "citation_not_retrieved"),
    (reply(answer="Tenang, ini aman kok."), "reassurance"),
    (reply(answer="Minum 2 tablet saja."), "dosing"),
    (reply(answer="Dosis bisa dikurangi."), "dosing"),
    (reply(answer="Anda menderita hepatitis."), "diagnosis"),
    (reply(answer=" ".join(["kata"] * 81)), "too_long"),
])
def test_abstain_paths(model_text, reason):
    out, why = ap.build_answer(model_text, gate())
    assert why == reason
    assert out["abstained"] is True and out["answer"] == "" and out["citations"] == []


def test_nyaman_is_not_reassurance():
    out, why = ap.build_answer(reply(answer="Buat pasien merasa nyaman saat minum obat."), gate())
    assert why is None and out["abstained"] is False


def test_lexicon_forbidden_output_is_added():
    forbidden = ap.compile_forbidden({"forbidden_output": {"dosing": ["setengah obat"], "conditions": ["tifus"]}})
    assert ap.forbidden_reason("minum setengah obat", forbidden) == "dosing"
    assert ap.forbidden_reason("mungkin tifus", forbidden) == "diagnosis"
    assert ap.forbidden_reason("mungkin tifus", ap.compile_forbidden()) is None


def test_format_sections():
    text = ap.format_sections(gate())
    assert text.startswith("[efek-samping-ringan#urin-merah]\nKencing merah wajar.")
    assert text.count("[") == 3


def test_invoke_model_never_raises():
    class Broken:
        def invoke(self, prompt):
            raise ValueError("bad")

    assert ap.invoke_model(Broken(), "p", 1) == ("", "model_error:ValueError")
    assert ap.invoke_model(None, "p", 1) == ("", "model_missing")
