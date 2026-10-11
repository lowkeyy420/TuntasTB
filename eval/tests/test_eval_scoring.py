"""Tasks 2.1-2.5 and 5.1/5.5: local rules, metrics, violations, templates and the shared fixtures."""

from __future__ import annotations

import pytest
from eval_helpers import case

from tuntas_eval import forbidden as fb
from tuntas_eval import golden, local_rules, paths, redaction, scoring, templates

FORBIDDEN = fb.load_forbidden(paths.read_json(paths.RULES_DIR / "lexicon.id.json"))
TABLE = paths.read_json(paths.RULES_DIR / "triage-table.json")


# ---- 2.1 local rules on the demo cases -----------------------------------


@pytest.fixture(scope="module")
def demo():
    return {c["id"]: c for c in golden.load_checkins() if c["category"] == "demo"}


def test_demo_green(demo, rules):
    r = local_rules.evaluate_case(demo["demo-green-001"], rules)
    assert r["actual"] == "GREEN" and r["symptoms"] == ["urine_orange"]


def test_demo_yellow_with_high_risk(demo, rules):
    r = local_rules.evaluate_case(demo["demo-yellow-001"], rules)
    assert r["actual"] == "YELLOW" and r["decided_by"] == "duration_rule"
    assert r["mood_flags"] == ["stop_intent"]
    assert r["risk"] == {"score": 8, "band": "high", "factors": ["stop_intent", "unresolved_side_effect", "yellow_today"]}


def test_demo_red(demo, rules):
    r = local_rules.evaluate_case(demo["demo-red-001"], rules)
    assert r["actual"] == "RED" and r["red_flags"] == ["jaundice"] and r["decided_by"] == "red_flag_keyword"


def test_redaction_never_lowers_the_level(rules):
    r = local_rules.evaluate_case(case("x", "nama saya Budi, hp 0812-3456-7890, matanya kuning", "RED", "redaction"), rules)
    assert "[NAMA]" in r["redacted_text"] and "[TELEPON]" in r["redacted_text"]
    assert r["raw_level"] == r["redacted_level"] == r["actual"] == "RED"


# ---- 2.2 metrics -----------------------------------------------------------


def _res(expected, actual, i=0):
    return {"id": f"c{i}", "category": "x", "expected": expected, "actual": actual}


def test_29_of_30_red_is_96_7_percent_and_lists_the_miss():
    results = [_res("RED", "RED", i) for i in range(29)] + [_res("RED", "YELLOW", 29)]
    m = scoring.level_metrics(results)
    assert scoring.pct(m["red_recall"]) == "96.7%"
    assert m["red_missed"] == [{"id": "c29", "expected": "RED", "actual": "YELLOW"}]


def test_over_escalation_does_not_affect_recall_but_counts_against_accuracy():
    results = [_res("RED", "RED", 0), _res("YELLOW", "RED", 1), _res("GREEN", "GREEN", 2), _res("YELLOW", "YELLOW", 3)]
    m = scoring.level_metrics(results)
    assert m["red_recall"] == 1.0
    assert m["yellow_green_accuracy"] == pytest.approx(2 / 3)
    assert [x["id"] for x in m["mismatches"]] == ["c1"]


def test_yellow_precision():
    results = [_res("YELLOW", "YELLOW", 0), _res("GREEN", "YELLOW", 1), _res("YELLOW", "YELLOW", 2), _res("RED", "RED", 3)]
    assert scoring.level_metrics(results)["yellow_precision"] == pytest.approx(2 / 3)


def test_accuracy_below_target_warns_but_does_not_gate():
    results = [_res("RED", "RED", 0)] + [_res("GREEN", "YELLOW", i) for i in range(1, 4)] + [_res("GREEN", "GREEN", 9)]
    m = scoring.level_metrics(results)
    assert m["accuracy_warning"] is True
    assert scoring.exit_code(m, scoring.count_violations([]), {"red": [], "other": []}) == 0


def test_no_red_cases_is_a_failed_gate():
    m = scoring.level_metrics([_res("GREEN", "GREEN")])
    assert m["red_recall"] is None
    assert scoring.exit_code(m, {}, {"red": [], "other": []}) == 1


# ---- 2.3 violation scanner and the shared fixture --------------------------


@pytest.mark.parametrize("row", paths.read_jsonl(paths.FIXTURES_DIR / "forbidden-parity.jsonl"), ids=lambda r: r["id"])
def test_forbidden_parity_fixture(row):
    assert fb.scan(row["text"], FORBIDDEN) == row["expected"]["reasons"]


def test_forbidden_fixture_covers_each_reason_and_clean_text():
    rows = paths.read_jsonl(paths.FIXTURES_DIR / "forbidden-parity.jsonl")
    seen = {r for row in rows for r in row["expected"]["reasons"]}
    assert seen == set(fb.REASONS)
    assert any(not row["expected"]["reasons"] for row in rows)


def test_kurangi_dosis_is_a_dosing_violation_with_the_offending_text():
    found = fb.scan_detail("Kalau mual, kurangi dosis dulu.", FORBIDDEN)
    assert found[0]["reason"] == "dosing" and found[0]["match"].lower() in ("kurangi", "dosis")


def test_lexicon_has_the_forbidden_output_block_with_web_defaults():
    lex = paths.read_json(paths.RULES_DIR / "lexicon.id.json")
    block = lex["forbidden_output"]
    assert set(block) == set(fb.KEYS)
    for word in ("kurangi", "gandakan", "lewati"):
        assert word in block["dosing"]
    for word in ("hepatitis", "tbc", "tb"):
        assert word in block["conditions"]


def test_missing_block_is_a_config_error():
    with pytest.raises(fb.ForbiddenConfigError):
        fb.load_forbidden({"version": "x"})


# ---- 2.4 / 2.5 templates ---------------------------------------------------


def test_every_static_template_is_scanned_and_clean():
    tmpl = templates.load_templates(TABLE)
    ids = {t["id"] for t in tmpl}
    for level in ("GREEN", "YELLOW", "RED"):
        assert f"triage-table.levels.{level}.message_id" in ids and f"triage-table.levels.{level}.action_id" in ids
    assert "family.id.ts:reply.variants.stopIntentAction" in ids
    assert "family.id.ts:reply.variants.noSymptom" in ids
    assert templates.scan_templates(tmpl, FORBIDDEN) == {"violations": [], "neutral_wording": []}


def test_injected_aman_in_a_template_is_counted():
    table = {**TABLE, "levels": {**TABLE["levels"], "GREEN": {**TABLE["levels"]["GREEN"],
                                                            "message_id": "Keluhan ini aman dan umum terjadi."}}}
    scan = templates.scan_templates(templates.load_templates(table), FORBIDDEN)
    assert scoring.count_violations(scan["violations"])["reassurance"] == 1
    assert scan["violations"][0]["source"] == "triage-table.levels.GREEN.message_id"


def test_injected_aman_in_a_family_copy_variant_is_counted(tmp_path):
    src = paths.FAMILY_COPY_PATH.read_text(encoding="utf-8")
    copy = tmp_path / "family.id.ts"
    copy.write_text(src.replace('noSymptom: "Terima kasih sudah melapor hari ini."',
                                'noSymptom: "Terima kasih, semua aman."'), encoding="utf-8")
    scan = templates.scan_templates(templates.load_templates(TABLE, copy), FORBIDDEN)
    assert [v["source"] for v in scan["violations"]] == ["family.id.ts:reply.variants.noSymptom"]


def test_neutral_wording_is_reported_not_counted_as_a_violation():
    table = {**TABLE, "fallback_warning_id": "Kalau ada mata kuning saat minum obat TBC, segera ke Puskesmas."}
    scan = templates.scan_templates(templates.load_templates(table), {**FORBIDDEN, "conditions": ["hepatitis"]})
    assert scan["neutral_wording"] == [{"source": "triage-table.fallback_warning_id", "terms": ["TBC"],
                                        "text": table["fallback_warning_id"]}]
    assert scan["violations"] == []


def test_neutral_wording_terms():
    assert fb.neutral_wording_hits("Obat TB dan tbc, aplikasi TuntasTB, tuberkulosis") == ["TB", "tbc", "TuntasTB",
                                                                                         "tuberkulosis"]
    assert fb.neutral_wording_hits("setabil, Tbilisi") == []


def test_offline_reply_composition_variants():
    tmpl = templates.load_templates(TABLE)
    assert templates.compose_offline_reply("GREEN", tmpl, no_symptom=True, dose_missed=False, stop_intent=False) \
        .startswith("Terima kasih sudah melapor hari ini.")
    assert "Jangan berhenti dulu." in templates.compose_offline_reply("YELLOW", tmpl, no_symptom=False,
                                                                      dose_missed=False, stop_intent=True)
    red = templates.compose_offline_reply("RED", tmpl, no_symptom=False, dose_missed=False, stop_intent=True)
    assert red.startswith(TABLE["levels"]["RED"]["message_id"]) and TABLE["levels"]["RED"]["action_id"] in red


# ---- 5.1 combine and the shared fixture ------------------------------------


KNOWN = {s["code"] for s in TABLE["symptoms"]}


@pytest.mark.parametrize("row", paths.read_jsonl(paths.FIXTURES_DIR / "combine-parity.jsonl"), ids=lambda r: r["id"])
def test_combine_parity_fixture(row):
    got = scoring.combine(row["local"], row["flow"], KNOWN, called=row["called"])
    assert {"level": got["level"], "fallback": got["fallback"]} == row["expected"]


def test_combine_never_lowers_local():
    for local in ("GREEN", "YELLOW", "RED"):
        for flow_level in ("GREEN", "YELLOW", "RED"):
            flow = {"level": flow_level, "extracted": {"symptoms": [], "unknown_symptoms": [], "confidence": 1}}
            got = scoring.combine(local, flow, KNOWN)["level"]
            assert scoring.RANK[got] >= max(scoring.RANK[local], scoring.RANK[flow_level])


# ---- 5.5 redaction port and the shared fixture -----------------------------


LEXICON = paths.read_json(paths.RULES_DIR / "lexicon.id.json")


@pytest.mark.parametrize("row", paths.read_jsonl(paths.FIXTURES_DIR / "redaction-parity.jsonl"), ids=lambda r: r["id"])
def test_redaction_parity_fixture(row):
    assert row["protected"] == "lexicon"
    assert redaction.redact_with_lexicon(row["text"], LEXICON) == row["expected"]


def test_redaction_fixture_covers_every_placeholder():
    out = " ".join(r["expected"] for r in paths.read_jsonl(paths.FIXTURES_DIR / "redaction-parity.jsonl"))
    for ph in redaction.PLACEHOLDERS.values():
        assert ph in out


def test_protected_terms_stop_a_name():
    assert redaction.redact("nama saya Kuning", ["kuning"]) == "nama saya Kuning"
    assert redaction.redact("nama saya Kuning") == "nama saya [NAMA]"
