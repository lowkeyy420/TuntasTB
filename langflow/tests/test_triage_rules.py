"""Tests for the Python triage rule component (mirror of web/src/lib/triage)."""

import copy
import importlib
import json
import sys

import pytest

from conftest import read_json, read_jsonl
import triage_rules as tr


@pytest.fixture(scope="module")
def rules():
    return tr.load_rules(read_json("triage-table.json"), read_json("lexicon.id.json"))


def run(rules, **kwargs):
    return tr.triage({"chips": [], "text": "", **kwargs}, rules)


# --------------------------------------------------------------------------
# normalise (same cases as the TypeScript unit tests, via the shared fixture)
# --------------------------------------------------------------------------

NORMALISE_CASES = read_json("fixtures/normalise.json")


@pytest.mark.parametrize("case", NORMALISE_CASES, ids=[c["id"] for c in NORMALISE_CASES])
def test_normalise_fixture(case):
    assert tr.normalise(case["input"]) == case["sentences"]


def test_normalise_steps():
    assert tr.normalise_sentence("MATA Kuning") == "mata kuning"
    assert tr.normalise_sentence("mual,muntah-(sedikit)") == "mual muntah sedikit"
    assert tr.normalise_sentence("MUALLL banget") == "mual banget"
    assert tr.normalise_sentence("baal") == "baal"
    assert tr.normalise_sentence("matanya kakiku badanmu") == "mata kaki badan"
    assert tr.normalise_sentence("aku tamu") == "aku tamu"
    assert tr.normalise("a b. c d! e f? g h; i j\nk l, m n") == [
        "a b", "c d", "e f", "g h", "i j", "k l m n",
    ]
    assert tr.normalise("") == []
    assert tr.normalise(" ?!. ") == []


# --------------------------------------------------------------------------
# matching and durations
# --------------------------------------------------------------------------


def test_phrase_matching_uses_token_boundaries():
    assert tr.has_phrase("mual terus", "mual")
    assert not tr.has_phrase("mualnya", "mual")
    assert not tr.has_phrase("kencing agak merah", "kencing merah")


def test_combo_matching(rules):
    def flags(text):
        return tr.match_codes(tr.normalise(text), rules["red_flag_entries"])

    assert "jaundice" in flags("matanya agak kuning")
    assert "jaundice" not in flags("mata baik. kuning")
    assert flags("kencingnya kuning pekat") == []


def test_duration_parser(rules):
    def days(text):
        return tr.parse_duration_days(tr.normalise(text), rules["durations"])

    assert days("mual terus seminggu") == 7
    assert days("mual 3 hari") == 3
    assert days("mual 2 minggu") == 14
    assert days("mual 5hari") == 5
    assert days("mual tiga minggu") == 21
    assert days("mual 3 hari. sakit kepala 2 minggu") == 14
    assert days("mual terus") == 0
    assert days("") == 0
    assert days("mual 1234 hari") == 0


# --------------------------------------------------------------------------
# parity fixture shared with Vitest
# --------------------------------------------------------------------------

PARITY = read_jsonl("fixtures/parity.jsonl")


def test_parity_fixture_is_well_formed():
    assert len(PARITY) >= 60
    assert len({c["id"] for c in PARITY}) == len(PARITY)
    for c in PARITY:
        assert isinstance(c["input"]["chips"], list)
        assert isinstance(c["input"]["text"], str)
        assert c["expected"]["level"] in tr.LEVELS


@pytest.mark.parametrize("case", PARITY, ids=[c["id"] for c in PARITY])
def test_parity(case, rules):
    result = tr.triage(case["input"], rules)
    assert result["level"] == case["expected"]["level"]
    assert result["symptoms"] == case["expected"]["symptoms"]
    assert result["redFlags"] == case["expected"]["redFlags"]
    if "decidedBy" in case["expected"]:
        assert result["decidedBy"] == case["expected"]["decidedBy"]


def test_determinism(rules):
    for case in PARITY:
        first = json.dumps(tr.triage(case["input"], rules), sort_keys=True)
        for _ in range(100):
            assert json.dumps(tr.triage(case["input"], rules), sort_keys=True) == first


def test_red_recall_is_100_percent_on_fixture(rules):
    for case in PARITY:
        if case["expected"]["level"] == "RED":
            assert tr.triage(case["input"], rules)["level"] == "RED", case["id"]


def test_input_is_not_mutated(rules):
    inp = {"chips": ["urine_orange"], "text": "Mual", "extracted": [{"code": "x"}]}
    before = copy.deepcopy(inp)
    tr.triage(inp, rules)
    assert inp == before


# --------------------------------------------------------------------------
# coverage of the table by fixtures
# --------------------------------------------------------------------------


def find_uncovered(rules, cases):
    missing = []
    for s in rules["table"]["symptoms"]:
        if not any(s["code"] in c["expected"]["symptoms"] for c in cases):
            missing.append(f"symptom:{s['code']}")
    for entry in rules["red_flag_entries"]:
        if not any(entry["code"] in c["expected"]["redFlags"] for c in cases):
            missing.append(f"red_flag:{entry['code']}")
    for i, rule in enumerate(rules["table"]["duration_rules"]):
        for code in rule["codes"]:
            if not any(
                c["expected"].get("decidedBy") == "duration_rule" and code in c["expected"]["symptoms"]
                for c in cases
            ):
                missing.append(f"duration_rule[{i}]:{code}")
    return missing


def test_every_rule_entry_has_a_fixture_case(rules):
    assert find_uncovered(rules, PARITY) == []


def test_missing_fixture_line_is_named(rules):
    without = [c for c in PARITY if "confusion" not in c["expected"]["redFlags"]]
    assert "red_flag:confusion" in find_uncovered(rules, without)
    no_duration = [c for c in PARITY if c["expected"].get("decidedBy") != "duration_rule"]
    missing = find_uncovered(rules, no_duration)
    assert "duration_rule[0]:nausea_mild" in missing
    assert "duration_rule[0]:appetite_loss" in missing


def test_new_symptom_without_fixture_is_named(rules):
    table = read_json("triage-table.json")
    table["symptoms"].append(
        {"code": "new_symptom", "level": "YELLOW", "label_id": "Baru", "chip_only": True}
    )
    extended = tr.load_rules(table, read_json("lexicon.id.json"))
    assert find_uncovered(extended, PARITY) == ["symptom:new_symptom"]


def test_every_lexicon_pattern_matches_its_code(rules):
    for section in ("symptom_entries", "red_flag_entries"):
        for entry in rules[section]:
            for phrase in entry["any"]:
                assert tr.match_codes(tr.normalise(phrase), [entry]) == [entry["code"]], phrase
            if entry["combo"]:
                terms = [g[0] for g in entry["combo"]]
                assert tr.match_codes([" ".join(terms)], [entry]) == [entry["code"]]
                assert tr.match_codes([" ".join(reversed(terms))], [entry]) == [entry["code"]]
                for gi, group in enumerate(entry["combo"]):
                    for term in group:
                        sentence = " ".join(
                            term if i == gi else g[0] for i, g in enumerate(entry["combo"])
                        )
                        assert tr.match_codes([sentence], [entry]) == [entry["code"]], sentence


def test_every_red_flag_phrase_is_red_even_negated(rules):
    for entry in rules["red_flag_entries"]:
        phrases = list(entry["any"])
        if entry["combo"]:
            phrases.append(" ".join(g[0] for g in entry["combo"]))
        for p in phrases:
            assert run(rules, text=p)["level"] == "RED", p
            assert run(rules, text=f"tidak ada {p} kayaknya")["level"] == "RED", p


# --------------------------------------------------------------------------
# spec scenarios
# --------------------------------------------------------------------------


def test_lone_chips(rules):
    expected = {
        "urine_orange": "GREEN", "nausea_mild": "GREEN", "joint_ache_mild": "GREEN",
        "appetite_loss": "GREEN", "tingling_feet": "YELLOW", "itching_no_rash": "YELLOW",
        "jaundice": "RED", "vision_change": "RED", "skin_rash": "RED",
        "vomiting_repeated": "RED", "confusion": "RED",
    }
    for code, level in expected.items():
        r = run(rules, chips=[code])
        assert (r["level"], r["symptoms"], r["decidedBy"]) == (level, [code], "table")


def test_nothing_reported_is_green(rules):
    assert run(rules)["level"] == "GREEN"
    assert run(rules)["decidedBy"] == "no_symptoms"


def test_highest_level_wins(rules):
    assert run(rules, chips=["urine_orange", "jaundice"])["level"] == "RED"
    assert run(rules, chips=["nausea_mild", "tingling_feet"])["level"] == "YELLOW"


def test_red_flag_scenarios(rules):
    r = run(rules, text="mual terus, matanya agak kuning")
    assert r["level"] == "RED" and r["redFlags"] == ["jaundice"]
    assert r["decidedBy"] == "red_flag_keyword"
    assert run(rules, text="kayaknya penglihatannya buram")["level"] == "RED"
    assert run(rules, chips=["urine_orange"], text="muntah terus dari pagi")["level"] == "RED"
    assert run(rules, text="matanya tidak kuning")["level"] == "RED"
    assert run(rules, text="matanya kuning")["level"] == "RED"


def test_slang_scenarios(rules):
    r = run(rules, text="kencingnya merah")
    assert r["symptoms"] == ["urine_orange"] and r["level"] == "GREEN"
    assert run(rules, text="MUALLL banget")["symptoms"] == ["nausea_mild"]
    r = run(rules, text="kakinya kesemutan terus")
    assert r["symptoms"] == ["tingling_feet"] and r["level"] == "YELLOW"
    assert run(rules, text="kuning")["level"] in ("YELLOW", "RED")


def test_duration_scenarios(rules):
    r = run(rules, text="mual terus seminggu")
    assert r["level"] == "YELLOW" and r["decidedBy"] == "duration_rule"
    assert run(rules, chips=["nausea_mild"], persistenceDays={"nausea_mild": 8})["level"] == "YELLOW"
    assert run(rules, chips=["nausea_mild"], persistenceDays={"nausea_mild": 3})["level"] == "GREEN"
    assert run(rules, chips=["appetite_loss"], text="3 hari", persistenceDays={"appetite_loss": 9})["level"] == "YELLOW"
    assert run(
        rules, chips=["appetite_loss"], extracted=[{"code": "appetite_loss", "durationDays": 7}]
    )["level"] == "YELLOW"
    assert run(
        rules,
        chips=["nausea_mild"],
        extracted=[{"code": "urine_orange", "durationDays": 30}, {"code": "nausea_mild"}],
    )["level"] == "GREEN"
    assert run(rules, chips=["urine_orange"], persistenceDays={"urine_orange": 40})["level"] == "GREEN"
    assert run(rules, persistenceDays={"nausea_mild": 40})["level"] == "GREEN"
    # JSON null durations behave like missing ones
    assert run(
        rules, chips=["nausea_mild"], persistenceDays={"nausea_mild": None},
        extracted=[{"code": "nausea_mild", "durationDays": None}],
    )["level"] == "GREEN"


def test_unknown_is_never_green(rules):
    r = run(rules, text="badannya aneh rasanya")
    assert r["level"] == "YELLOW" and r["decidedBy"] == "unknown_symptom"
    assert "text_unmatched" in r["unknown"]
    r = run(rules, chips=["nyeri_dada"])
    assert r["level"] == "YELLOW" and r["unknown"] == ["nyeri_dada"] and r["symptoms"] == []
    r = run(rules, chips=["urine_orange"], unknownSymptoms=["rasa aneh"])
    assert r["level"] == "YELLOW" and r["symptoms"] == ["urine_orange"]
    assert run(rules, extracted=[{"code": "foo"}])["unknown"] == ["foo"]
    assert run(rules, text="mual muntah")["unknown"] == ["watch:muntah"]
    assert run(rules, text="capek minum obat")["level"] == "YELLOW"
    assert run(rules, chips=["tingling_feet", "zzz"])["decidedBy"] == "table"


def test_unknown_level_red_in_table_makes_unknown_red():
    table = read_json("triage-table.json")
    table["unknown_level"] = "RED"
    strict = tr.load_rules(table, read_json("lexicon.id.json"))
    assert run(strict, chips=["zzz"])["level"] == "RED"


def test_result_is_sorted_and_versioned(rules):
    r = run(rules, chips=["urine_orange", "nausea_mild", "urine_orange"], text="kencing merah, mual")
    assert r["symptoms"] == ["nausea_mild", "urine_orange"]
    assert r["rulesVersion"] == "0.1.0-draft/0.1.0-draft"


def test_max_level_all_pairs():
    rank = {"GREEN": 0, "YELLOW": 1, "RED": 2}
    for a in tr.LEVELS:
        for b in tr.LEVELS:
            expected = a if rank[a] >= rank[b] else b
            assert tr.max_level(a, b) == expected
            assert tr.max_level(b, a) == expected


def test_level_text(rules):
    assert tr.level_text(rules, "RED")["action_id"].startswith("Berhenti dulu")


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------


def _mutated(mutate):
    table, lexicon = read_json("triage-table.json"), read_json("lexicon.id.json")
    mutate(table, lexicon)
    return table, lexicon


VALIDATION_CASES = [
    ("missing version", lambda t, l: t.pop("version"), "triage-table.version"),
    ("unknown_level GREEN", lambda t, l: t.update(unknown_level="GREEN"), "unknown_level"),
    ("symptoms empty", lambda t, l: t.update(symptoms=[]), "triage-table.symptoms"),
    ("symptom not an object", lambda t, l: t["symptoms"].__setitem__(0, 5), "symptoms[0].code"),
    ("symptom code malformed", lambda t, l: t["symptoms"][0].update(code="Bad Code"), "symptoms[0].code"),
    ("duplicate code", lambda t, l: t["symptoms"][1].update(code=t["symptoms"][0]["code"]), "kode ganda"),
    ("invalid level", lambda t, l: t["symptoms"][0].update(level="BLUE"), "symptoms[0].level"),
    ("missing label", lambda t, l: t["symptoms"][0].pop("label_id"), "label_id"),
    ("duration_rules not a list", lambda t, l: t.update(duration_rules=None), "duration_rules"),
    ("duration rule without codes", lambda t, l: t["duration_rules"][0].update(codes=[]), "duration_rules[0].codes"),
    ("duration rule unknown code", lambda t, l: t["duration_rules"][0].update(codes=["nope"]), "nope"),
    ("duration rule non-string code", lambda t, l: t["duration_rules"][0].update(codes=[7]), "tidak dikenal"),
    ("min_days 0", lambda t, l: t["duration_rules"][0].update(min_days=0), "min_days"),
    ("min_days bool", lambda t, l: t["duration_rules"][0].update(min_days=True), "min_days"),
    ("duration rule bad level", lambda t, l: t["duration_rules"][0].update(level="x"), "duration_rules[0].level"),
    ("levels missing", lambda t, l: t.pop("levels"), "levels.GREEN"),
    ("level text missing message", lambda t, l: t["levels"]["RED"].pop("message_id"), "levels.RED"),
    ("lexicon version missing", lambda t, l: l.pop("version"), "lexicon.version"),
    ("lexicon symptoms missing", lambda t, l: l.pop("symptoms"), "lexicon.symptoms"),
    ("table code without entry", lambda t, l: l["symptoms"].pop("nausea_mild"), "nausea_mild"),
    ("lexicon references unknown code", lambda t, l: l["symptoms"].update(not_in_table={"any": ["halo"]}), "not_in_table"),
    ("entry not an object", lambda t, l: l["symptoms"].update(nausea_mild="mual"), "harus berupa objek"),
    ("entry without any or combo", lambda t, l: l["symptoms"].update(nausea_mild={}), 'perlu "any" atau "combo"'),
    ("any empty", lambda t, l: l["symptoms"].update(nausea_mild={"any": []}), "nausea_mild.any"),
    ("any punctuation-only phrase", lambda t, l: l["symptoms"].update(nausea_mild={"any": ["?!"]}), "nausea_mild.any[0]"),
    ("combo with one group", lambda t, l: l["symptoms"].update(nausea_mild={"combo": [["a"]]}), "minimal dua kelompok"),
    ("combo with empty group", lambda t, l: l["symptoms"].update(nausea_mild={"combo": [["a"], []]}), "combo[1]"),
    ("watch_words empty", lambda t, l: l.update(watch_words=[]), "watch_words"),
    ("stop_intent missing", lambda t, l: l.pop("stop_intent"), "stop_intent"),
    ("durations not a list", lambda t, l: l.update(durations={}), "lexicon.durations"),
    ("duration entry not an object", lambda t, l: l.update(durations=[1]), "durations[0].pattern"),
    ("duration invalid regex", lambda t, l: l.update(durations=[{"pattern": "(", "days": 1}]), "regex tidak valid"),
    ("duration days 0", lambda t, l: l.update(durations=[{"pattern": "a", "days": 0}]), "durations[0].days"),
    ("duration days bad expression", lambda t, l: l.update(durations=[{"pattern": "(a)", "days": "$2"}]), 'harus angka atau "$1"'),
    ("duration group reference without group", lambda t, l: l.update(durations=[{"pattern": "a", "days": "$1"}]), "grup tangkapan"),
]


@pytest.mark.parametrize("name,mutate,fragment", VALIDATION_CASES, ids=[c[0] for c in VALIDATION_CASES])
def test_validation_rejects(name, mutate, fragment):
    table, lexicon = _mutated(mutate)
    errors = tr.validate_rule_data(table, lexicon)
    assert fragment in "\n".join(errors)
    with pytest.raises(tr.RulesValidationError) as exc:
        tr.load_rules(table, lexicon)
    assert exc.value.errors == errors


def test_validation_accepts_shipped_files_and_chip_only():
    table, lexicon = read_json("triage-table.json"), read_json("lexicon.id.json")
    assert tr.validate_rule_data(table, lexicon) == []
    table["symptoms"].append({"code": "chip_extra", "level": "YELLOW", "label_id": "Ekstra", "chip_only": True})
    assert tr.validate_rule_data(table, lexicon) == []
    del lexicon["watch_words"]
    lexicon["durations"] = [{"pattern": "seminggu", "days": 7}]
    loaded = tr.load_rules(table, lexicon)
    assert loaded["watch"] == []


def test_validation_rejects_non_objects():
    assert len(tr.validate_rule_data(None, None)) >= 2
    assert len(tr.validate_rule_data([], "x")) >= 2


# --------------------------------------------------------------------------
# Langflow component (guarded import)
# --------------------------------------------------------------------------


def test_module_imports_without_langflow():
    # Pure functions are available whether or not Langflow is installed.
    assert callable(tr.triage) and callable(tr.max_level)


def test_component_class_defined_only_with_langflow():
    has_class = hasattr(tr, "TriageRulesComponent")
    assert has_class == tr._HAS_LANGFLOW


def test_component_class_when_langflow_installed():
    # NB: the repo's own ``langflow/`` directory is importable as a namespace package,
    # so ``importorskip("langflow")`` would be fooled; ask for a real submodule.
    pytest.importorskip("langflow.custom")
    importlib.reload(tr)
    comp = tr.TriageRulesComponent
    names = {i.name for i in comp.inputs}
    assert {"triage_table_json", "lexicon_json", "chips", "text", "context_json"} <= names
    assert [o.name for o in comp.outputs] == ["triage"]


def test_component_runs_with_stub_base(monkeypatch):
    """Exercise the component body with minimal stand-ins for the Langflow classes."""
    import types

    class _Input:
        def __init__(self, **kw):
            self.__dict__.update(kw)

    class _Component:
        pass

    class _Data:
        def __init__(self, data):
            self.data = data

    fake_custom = types.ModuleType("langflow.custom")
    fake_custom.Component = _Component
    fake_io = types.ModuleType("langflow.io")
    fake_io.MessageTextInput = _Input
    fake_io.MultilineInput = _Input
    fake_io.Output = _Input
    fake_schema = types.ModuleType("langflow.schema")
    fake_schema.Data = _Data
    fake_pkg = types.ModuleType("langflow")
    for name, mod in {
        "langflow": fake_pkg, "langflow.custom": fake_custom,
        "langflow.io": fake_io, "langflow.schema": fake_schema,
    }.items():
        monkeypatch.setitem(sys.modules, name, mod)
    monkeypatch.delitem(sys.modules, "triage_rules_stubbed", raising=False)

    spec = importlib.util.spec_from_file_location("triage_rules_stubbed", tr.__file__)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module._HAS_LANGFLOW

    comp = module.TriageRulesComponent()
    comp.triage_table_json = json.dumps(read_json("triage-table.json"))
    comp.lexicon_json = json.dumps(read_json("lexicon.id.json"))
    comp.chips = "nausea_mild, urine_orange"
    comp.text = "matanya kuning"
    comp.context_json = '{"persistenceDays": {"nausea_mild": 2}}'
    out = comp.run_triage()
    assert out.data["level"] == "RED"
    assert out.data["action_id"].startswith("Berhenti dulu")
    assert out.data["symptoms"] == ["jaundice", "nausea_mild", "urine_orange"]
    assert comp.status == "RED"
