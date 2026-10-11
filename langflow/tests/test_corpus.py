"""Corpus files, manifest and ingest chunking."""

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "corpus"))
sys.path.insert(0, str(ROOT / "langflow" / "components"))

import ask_parts  # noqa: E402
import build_manifest as bm  # noqa: E402
import corpus_ingest as ci  # noqa: E402

TABLE = json.loads((ROOT / "rules" / "triage-table.json").read_text(encoding="utf-8"))
SECTIONS = bm.load_sections()
DOCS = sorted(p for p in (ROOT / "corpus").glob("*.md") if p.name.lower() != "readme.md")
FORBIDDEN = ask_parts.compile_forbidden(json.loads((ROOT / "rules" / "lexicon.id.json").read_text(encoding="utf-8")))


def test_manifest_is_up_to_date():
    assert (ROOT / "corpus" / "manifest.json").read_text(encoding="utf-8") == bm.render(bm.build_manifest())


def test_unique_ids_label_and_source():
    ids = [s["id"] for s in SECTIONS]
    assert len(ids) == len(set(ids))
    for s in SECTIONS:
        assert re.fullmatch(r"[a-z0-9-]+#[a-z0-9-]+", s["id"])
        assert s["label"] and s["source"]


def test_labels_are_neutral():
    for s in SECTIONS:
        assert bm.label_problems(s["label"]) == [], s["id"]


@pytest.mark.parametrize("level", ["GREEN", "YELLOW", "RED"])
def test_every_symptom_code_maps_to_a_section(level):
    mapped = {c for s in SECTIONS for c in s["codes"]}
    for sym in TABLE["symptoms"]:
        if sym["level"] == level:
            assert sym["code"] in mapped, sym["code"]


def test_red_codes_map_to_red_flag_sections():
    for sym in TABLE["symptoms"]:
        if sym["level"] == "RED":
            assert any(sym["code"] in s["codes"] and s["doc"] == "tanda-bahaya" for s in SECTIONS)


def test_front_matter_is_draft_with_source_and_note():
    for path in DOCS:
        meta, body = bm.parse_front_matter(path.read_text(encoding="utf-8"))
        assert meta["review_status"] == "draft" and meta["source"]
        assert "DRAFT — perlu ditinjau klinisi" in body


def test_required_topics_present():
    ids = {s["id"] for s in SECTIONS}
    for required in (
        "efek-samping-ringan#urin-merah", "efek-samping-ringan#mual-ringan", "efek-samping-ringan#nyeri-sendi",
        "efek-samping-perlu-perawat#kesemutan-kaki", "efek-samping-perlu-perawat#gatal-tanpa-ruam",
        "tanda-bahaya#mata-kulit-kuning", "tanda-bahaya#penglihatan", "tanda-bahaya#ruam-kulit",
        "tanda-bahaya#muntah-berulang", "tanda-bahaya#bingung", "minum-obat-teratur#merasa-sehat",
        "minum-obat-teratur#obat-terlewat", "ambil-obat#jadwal-ambil", "peran-pendamping#rasa-malu",
        "peran-pendamping#tugas-pendamping",
    ):
        assert required in ids


def test_no_reassurance_dosing_or_diagnosis_in_corpus():
    for s in SECTIONS:
        assert ask_parts.forbidden_reason(s["heading"] + "\n" + s["body"], FORBIDDEN) is None, s["id"]


def test_missed_dose_goes_to_the_nurse():
    body = next(s["body"] for s in SECTIONS if s["id"] == "minum-obat-teratur#obat-terlewat").lower()
    assert "hubungi perawat" in body
    assert not re.search(r"\d", body)


def test_sentences_are_short():
    for s in SECTIONS:
        for sentence in re.split(r"(?<=[.!?])\s+", s["body"]):
            assert len(sentence.split()) <= 20, (s["id"], sentence)


def test_chunk_round_trip_with_ask_parts():
    for s in SECTIONS:
        parsed = ask_parts.parse_chunk(bm.chunk_text(s))
        assert parsed["id"] == s["id"] and parsed["label"] == s["label"]


def test_bundle_has_one_chunk_per_section():
    sys.path.insert(0, str(ROOT / "langflow" / "scripts"))
    import deploy_flows

    text, ids = deploy_flows.corpus_bundle()
    assert ids == [s["id"] for s in SECTIONS]
    assert text.count(deploy_flows.BUNDLE_SEPARATOR) == len(SECTIONS) - 1
    assert ci.section_ids(text.split(deploy_flows.BUNDLE_SEPARATOR)) == ids


def test_plan_sync_is_idempotent_and_replaces_edits():
    first = ci.plan_sync([], ["a", "b"])
    assert first == {"delete_ids": [], "add_texts": ["a", "b"], "kept": 0}
    again = ci.plan_sync([("1", "a"), ("2", "b")], ["a", "b"])
    assert again == {"delete_ids": [], "add_texts": [], "kept": 2}
    edited = ci.plan_sync([("1", "a"), ("2", "b"), ("3", "b")], ["a", "b2"])
    assert edited == {"delete_ids": ["2", "3"], "add_texts": ["b2"], "kept": 1}


def test_parser_rejects_heading_without_slug(tmp_path):
    (tmp_path / "x.md").write_text(
        "---\nid: x\ndisplay_title: T\nsource: S\nreview_status: draft\n---\n## Judul tanpa slug\nIsi.\n", encoding="utf-8"
    )
    with pytest.raises(bm.CorpusError):
        bm.load_sections(tmp_path)
