"""Explain stage of checkin_triage (add-family-reply 5.3, 5.4)."""

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "langflow" / "components"))

import explain_parts as xp  # noqa: E402
import extract_parse as ep  # noqa: E402

TABLE = json.loads((ROOT / "rules" / "triage-table.json").read_text(encoding="utf-8"))
LEXICON = json.loads((ROOT / "rules" / "lexicon.id.json").read_text(encoding="utf-8"))
MANIFEST = json.loads((ROOT / "corpus" / "manifest.json").read_text(encoding="utf-8"))
TERMS = xp.forbidden_terms(LEXICON)
PROMPT = (ROOT / "langflow" / "prompts" / "explain.id.md").read_text(encoding="utf-8")

CHUNKS = [
    "[section_id: efek-samping-ringan#urin-merah]\n[label: Panduan keluhan ringan, bagian kencing merah]\nKencing merah karena obat.",
    "[section_id: tanda-bahaya#mata-kulit-kuning]\n[label: Panduan tanda bahaya, bagian mata kuning]\nMata kuning perlu diperiksa.",
    "[section_id: efek-samping-ringan#urin-merah]\n[label: dup]\nduplicate",
    "no header at all",
]
LABELS = xp.format_sections(CHUNKS)["labels"]


def model(obj) -> str:
    return json.dumps(obj, ensure_ascii=False)


# --- 5.3 prompt rules -------------------------------------------------------


def test_explain_prompt_rules():
    low = PROMPT.lower()
    assert 'kata "aman"' in low  # no "aman"
    assert "dosis" in low and "jumlah tablet" in low and "miligram" in low  # no dosing
    assert "tepat satu section_id" in low  # one citation
    assert 'kosongkan penjelasan: "family_message": ""' in low  # empty if no section fits
    assert "35 kata" in low
    assert "nama penyakit" in low  # no condition names
    assert set(re.findall(r"\{\{(\w+)\}\}", PROMPT)) == {"level", "symptoms", "sections"}


# --- Build Query ------------------------------------------------------------


def test_query_uses_symptom_labels_and_mood_flags_not_the_note():
    q = xp.build_query(
        {"level": "YELLOW", "symptoms": ["nausea_mild"]},
        {"mood_flags": ["stop_intent", "nonsense"]},
        TABLE,
    )
    label = next(s["label_id"] for s in TABLE["symptoms"] if s["code"] == "nausea_mild")
    assert q["query"] == f"{label}; sudah merasa sehat tetapi pengobatan belum selesai; keluhan yang perlu diceritakan ke perawat"
    assert q["level"] == "YELLOW" and q["labels"] == [label] and q["mood_flags"] == ["stop_intent"]


def test_prompt_facts_carry_durations_and_mood_in_plain_words():
    q = xp.build_query(
        {"level": "YELLOW", "symptoms": ["nausea_mild", "urine_orange", "not_a_code"]},
        {"symptoms": [{"code": "nausea_mild", "duration_days": 7}, {"code": "urine_orange", "duration_days": 1}],
         "mood_flags": ["stop_intent"]},
        TABLE,
    )
    label = {s["code"]: s["label_id"] for s in TABLE["symptoms"]}
    assert q["facts"] == [f"{label['nausea_mild']} (7 hari)", label["urine_orange"],
                          "bilang sudah sembuh atau ingin berhenti minum obat"]


@pytest.mark.parametrize("level,expected", [("GREEN", "keluhan ringan"), ("RED", "tanda bahaya"), (None, "perawat")])
def test_query_without_symptoms_falls_back_by_level(level, expected):
    q = xp.build_query({"level": level, "symptoms": []}, {}, TABLE)
    assert expected in q["query"]


# --- Explain Sections ------------------------------------------------------


def test_format_sections_dedupes_and_keeps_labels():
    s = xp.format_sections(CHUNKS)
    assert list(s["labels"]) == ["efek-samping-ringan#urin-merah", "tanda-bahaya#mata-kulit-kuning"]
    assert s["labels"]["efek-samping-ringan#urin-merah"] == "Panduan keluhan ringan, bagian kencing merah"
    assert "[section_id: tanda-bahaya#mata-kulit-kuning]\nMata kuning perlu diperiksa." in s["text"]
    assert "[label:" not in s["text"]
    assert xp.format_sections([])["text"] == "(tidak ada bagian)"
    assert len(xp.format_sections(CHUNKS, top_k=1)["labels"]) == 1


# --- Explain Guard ---------------------------------------------------------


def test_clean_message_with_a_retrieved_citation_is_kept():
    g = xp.guard_explanation(
        "```json\n" + model({"family_message": "Kencing merah sering terjadi karena obat ini.", "nurse_line": "kencing merah",
                              "citation_id": "efek-samping-ringan#urin-merah"}) + "\n```",
        LABELS, TERMS,
    )
    assert g == {
        "family_message": "Kencing merah sering terjadi karena obat ini.",
        "nurse_line": "kencing merah",
        "citation": {"id": "efek-samping-ringan#urin-merah", "label": "Panduan keluhan ringan, bagian kencing merah"},
        "reason": None,
    }


@pytest.mark.parametrize("msg,cid,reason", [
    ("Ini aman, tidak perlu khawatir.", "efek-samping-ringan#urin-merah", "reassurance"),
    ("Minum 2 tablet saja.", "efek-samping-ringan#urin-merah", "dosing"),
    ("Jangan lupa 300 mg.", "efek-samping-ringan#urin-merah", "dosing"),
    ("Sebaiknya kurangi dosis.", "efek-samping-ringan#urin-merah", "dosing"),
    ("Ini tanda hepatitis.", "tanda-bahaya#mata-kulit-kuning", "diagnosis"),
    ("Kencing merah karena obat.", "", "citation_not_retrieved"),
    ("Kencing merah karena obat.", "ambil-obat#bepergian", "citation_not_retrieved"),
    (" ".join(["kata"] * 36), "efek-samping-ringan#urin-merah", "too_long"),
    ("", "efek-samping-ringan#urin-merah", "empty_message"),
])
def test_doubtful_messages_are_emptied(msg, cid, reason):
    g = xp.guard_explanation(model({"family_message": msg, "nurse_line": "", "citation_id": cid}), LABELS, TERMS)
    assert g["reason"] == reason
    assert g["family_message"] == "" and g["citation"] is None


def test_nurse_line_checks_and_non_json():
    g = xp.guard_explanation(model({"family_message": "", "nurse_line": "kurangi dosis", "citation_id": ""}), LABELS, TERMS)
    assert g["nurse_line"] == ""
    g = xp.guard_explanation(model({"family_message": "", "nurse_line": "x" * 121, "citation_id": ""}), LABELS, TERMS)
    assert g["nurse_line"] == ""
    assert xp.guard_explanation("bukan json", LABELS, TERMS)["reason"] == "model_output_not_json"
    assert xp.guard_explanation(None, LABELS, TERMS)["reason"] == "model_output_not_json"


def test_invoke_model_never_raises():
    class Slow:
        def invoke(self, _p):
            import time

            time.sleep(0.5)

    class Broken:
        def invoke(self, _p):
            raise RuntimeError("x")

    class Ok:
        def invoke(self, _p):
            return type("R", (), {"content": [{"text": "a"}, "b"]})()

    assert xp.invoke_model(None, "p", 1) == ("", "model_missing")
    assert xp.invoke_model(Slow(), "p", 0.05) == ("", "model_timeout")
    assert xp.invoke_model(Broken(), "p", 1) == ("", "model_error:RuntimeError")
    assert xp.invoke_model(Ok(), "p", 1) == ("ab", None)


# --- Build Output citation mapping (5.4) -----------------------------------


def _output(explanation):
    parsed = ep.parse_input(json.dumps({"text": "kencingnya merah", "chips": [], "dose_status": "yes", "context": {}}))
    guard = ep.guard_extraction("", "", {"urine_orange"})
    return ep.build_output(parsed, guard, {"level": "GREEN", "symptoms": ["urine_orange"]}, {"score": 0, "band": "low"},
                           None, explanation)


def test_build_output_maps_the_citation_to_id_and_label():
    out = _output({"family_message": "Kencing merah sering terjadi.", "nurse_line": "kencing merah",
                   "citation": {"id": "efek-samping-ringan#urin-merah", "label": "L"}})
    assert out["family_message"] == "Kencing merah sering terjadi."
    assert out["nurse_line"] == "kencing merah"
    assert out["citations"] == [{"id": "efek-samping-ringan#urin-merah", "label": "L"}]


def test_build_output_drops_a_message_without_citation_and_handles_no_explanation():
    out = _output({"family_message": "x", "nurse_line": "n", "citation": None})
    assert (out["family_message"], out["nurse_line"], out["citations"]) == ("", "n", [])
    out = _output({"family_message": "", "nurse_line": "", "citation": {"id": "a#b", "label": "L"}})
    assert out["citations"] == []
    out = _output(None)
    assert (out["family_message"], out["nurse_line"], out["citations"]) == ("", "", [])


def test_build_output_with_explanation_matches_the_schema():
    jsonschema = pytest.importorskip("jsonschema")
    schema = json.loads((ROOT / "langflow" / "flows" / "checkin_triage.schema.json").read_text(encoding="utf-8"))
    out = _output({"family_message": "m", "nurse_line": "", "citation": {"id": "a#b", "label": "L"}})
    jsonschema.Draft7Validator(schema).validate(out)


def test_every_retrievable_section_id_is_in_the_manifest_format():
    ids = {s["id"] for s in MANIFEST["sections"]}
    assert "efek-samping-ringan#urin-merah" in ids and "tanda-bahaya#mata-kulit-kuning" in ids


def test_provider_status_token_is_kept_without_the_message():
    class Quota:
        def invoke(self, _p):
            raise RuntimeError("429 RESOURCE_EXHAUSTED quota for prompt 'matanya kuning'")

    assert ep.invoke_model(Quota(), "p", 1) == ("", "model_error:RuntimeError:RESOURCE_EXHAUSTED")
