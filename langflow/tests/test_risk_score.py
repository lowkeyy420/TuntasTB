"""Tests for the Python risk component (mirror of web/src/lib/risk/score.ts)."""

import copy
import importlib
import importlib.util
import json
import sys
import types

import pytest

from conftest import read_json, read_jsonl
import risk_score as rs

POINTS = rs.load_risk_points(read_json("risk-points.json"))
CASES = read_jsonl("fixtures/risk-parity.jsonl")

BASE = {
    "doseStatus": "yes", "consecutiveMissedBefore": 0, "stopIntent": False, "stigma": False,
    "maxPersistenceDays": 0, "level": "GREEN", "missedPickup": False, "hasPmo": True,
    "daysSinceLastCheckin": 0,
}


def score(**over):
    return rs.score_risk({**BASE, **over}, POINTS)


def test_fixture_is_well_formed():
    assert len(CASES) >= 40
    assert len({c["id"] for c in CASES}) == len(CASES)
    factors = {f for c in CASES for f in c["expected"]["factors"]}
    assert factors == set(rs.FACTOR_IDS)
    assert {3, 4, 7, 8} <= {c["expected"]["score"] for c in CASES}
    assert {c["expected"]["band"] for c in CASES} == {"low", "medium", "high"}


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_parity(case):
    r = rs.score_risk(case["snapshot"], POINTS)
    assert r["score"] == case["expected"]["score"]
    assert r["band"] == case["expected"]["band"]
    assert [x["factor"] for x in r["reasons"]] == case["expected"]["factors"]
    assert sum(x["points"] for x in r["reasons"]) == r["score"]


def test_point_values_equal_the_plan():
    f = POINTS["factors"]
    assert f["missed_dose_today"]["points"] == 2
    assert (f["consecutive_missed_day"]["points"], f["consecutive_missed_day"]["cap"]) == (2, 10)
    assert f["partial_dose"]["points"] == 1
    assert f["stop_intent"]["points"] == 4
    assert f["stigma"]["points"] == 2
    assert (f["unresolved_side_effect"]["points"], f["unresolved_side_effect"]["min_days"]) == (3, 7)
    assert f["yellow_today"]["points"] == 1
    assert f["red_today"]["points"] == 5
    assert f["missed_pickup"]["points"] == 4
    assert f["no_pmo"]["points"] == 2
    assert (f["no_checkin"]["points"], f["no_checkin"]["min_days"]) == (3, 3)
    assert list(f) == list(rs.FACTOR_IDS)


def test_adherence_scenarios():
    assert score()["score"] == 0
    assert score(doseStatus="no")["score"] == 2
    assert score(doseStatus="no", consecutiveMissedBefore=2)["score"] == 6
    r = score(doseStatus="no", consecutiveMissedBefore=8)
    assert r["score"] == 12
    assert next(x for x in r["reasons"] if x["factor"] == "consecutive_missed_day")["points"] == 10
    assert score(doseStatus="partial")["score"] == 1


def test_uncapped_table_does_not_cap():
    uncapped = copy.deepcopy(POINTS)
    del uncapped["factors"]["consecutive_missed_day"]["cap"]
    assert rs.score_risk({**BASE, "consecutiveMissedBefore": 8}, uncapped)["score"] == 16


def test_words_side_effect_level_program():
    assert score(stopIntent=True)["score"] == 4
    assert score(stigma=True)["score"] == 2
    assert score(maxPersistenceDays=7)["score"] == 3
    assert score(maxPersistenceDays=10)["score"] == 3
    assert score(maxPersistenceDays=6)["score"] == 0
    assert score(level="YELLOW")["score"] == 1
    assert score(level="RED")["score"] == 5
    assert score(level=None)["score"] == 0
    assert score(missedPickup=True)["score"] == 4
    assert score(hasPmo=False)["score"] == 2
    assert score(daysSinceLastCheckin=3)["score"] == 3
    assert score(daysSinceLastCheckin=2)["score"] == 0


def test_zero_point_factor_adds_no_reason():
    zero = copy.deepcopy(POINTS)
    zero["factors"]["stigma"]["points"] = 0
    r = rs.score_risk({**BASE, "stigma": True}, zero)
    assert r == {"score": 0, "band": "low", "reasons": []}


def test_bands_and_demo_day_41():
    assert [rs.band_for(s, POINTS) for s in (0, 3, 4, 7, 8, 500)] == [
        "low", "low", "medium", "medium", "high", "high",
    ]
    r = score(stopIntent=True, maxPersistenceDays=7, level="YELLOW")
    assert (r["score"], r["band"]) == (8, "high")
    assert score() == {"score": 0, "band": "low", "reasons": []}
    red = score(level="RED")
    assert (red["score"], [x["factor"] for x in red["reasons"]]) == (5, ["red_today"])


def test_band_for_table_without_open_band_is_unreachable():
    with pytest.raises(AssertionError):
        rs.band_for(99, {"bands": [{"max": 3, "band": "low"}]})


def test_reason_texts():
    r = score(stopIntent=True)
    assert r["reasons"] == [
        {"factor": "stop_intent", "points": 4, "text": "Mengatakan ingin berhenti atau merasa sudah sembuh"}
    ]
    r = score(consecutiveMissedBefore=3, maxPersistenceDays=9, daysSinceLastCheckin=5)
    text = {x["factor"]: x["text"] for x in r["reasons"]}
    assert text["consecutive_missed_day"] == "Tidak minum obat 3 hari berturut-turut sebelumnya"
    assert text["unresolved_side_effect"] == "Keluhan yang sama sudah 9 hari"
    assert text["no_checkin"] == "Tidak ada laporan selama 5 hari"


def test_deterministic_and_pure():
    snap = {**BASE, "doseStatus": "no", "consecutiveMissedBefore": 3, "stopIntent": True}
    before = copy.deepcopy(snap)
    first = json.dumps(rs.score_risk(snap, POINTS), sort_keys=True)
    for _ in range(100):
        assert json.dumps(rs.score_risk(snap, POINTS), sort_keys=True) == first
    assert snap == before


def test_reason_texts_match_the_typescript_table():
    # Both implementations read the same text_id strings from rules/risk-points.json.
    for fid in rs.FACTOR_IDS:
        assert POINTS["factors"][fid]["text_id"].strip() != ""


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------

VALIDATION = [
    ("missing version", lambda d: d.pop("version"), "version"),
    ("missing factor", lambda d: d["factors"].pop("no_pmo"), "factors.no_pmo"),
    ("factors missing", lambda d: d.pop("factors"), "factors.missed_dose_today"),
    ("negative points", lambda d: d["factors"]["stigma"].update(points=-1), "stigma.points"),
    ("bool points", lambda d: d["factors"]["stigma"].update(points=True), "stigma.points"),
    ("bad cap", lambda d: d["factors"]["consecutive_missed_day"].update(cap="x"), "cap"),
    ("missing min_days", lambda d: d["factors"]["no_checkin"].pop("min_days"), "no_checkin.min_days"),
    ("zero min_days", lambda d: d["factors"]["unresolved_side_effect"].update(min_days=0), "min_days"),
    ("blank text", lambda d: d["factors"]["red_today"].update(text_id=" "), "red_today.text_id"),
    ("one band", lambda d: d.update(bands=[{"band": "high"}]), "minimal dua band"),
    ("unknown band", lambda d: d["bands"][0].update(band="x"), "bands[0].band"),
    ("last band with max", lambda d: d["bands"][2].update(max=99), "band terakhir"),
    ("non-increasing max", lambda d: d["bands"][1].update(max=3), "bands[1].max"),
    ("missing max", lambda d: d["bands"][0].pop("max"), "bands[0].max"),
]


@pytest.mark.parametrize("name,mutate,fragment", VALIDATION, ids=[v[0] for v in VALIDATION])
def test_validation_rejects(name, mutate, fragment):
    data = read_json("risk-points.json")
    mutate(data)
    errors = rs.validate_risk_points(data)
    assert fragment in "\n".join(errors)
    with pytest.raises(rs.RiskPointsError):
        rs.load_risk_points(data)


def test_validation_accepts_shipped_file_and_rejects_non_objects():
    assert rs.validate_risk_points(read_json("risk-points.json")) == []
    assert len(rs.validate_risk_points(None)) == 1
    assert len(rs.validate_risk_points([])) == 1


# --------------------------------------------------------------------------
# Langflow component (guarded import)
# --------------------------------------------------------------------------


def test_module_imports_without_langflow():
    assert callable(rs.score_risk)
    assert hasattr(rs, "RiskScoreComponent") == rs._HAS_LANGFLOW


def test_component_class_when_langflow_installed():
    # NB: the repo's own ``langflow/`` directory is a namespace package; ask for a real submodule.
    pytest.importorskip("langflow.custom")
    importlib.reload(rs)
    assert {i.name for i in rs.RiskScoreComponent.inputs} == {"risk_points_json", "snapshot_json"}
    assert [o.name for o in rs.RiskScoreComponent.outputs] == ["risk"]


def test_component_runs_with_stub_base(monkeypatch):
    class _Input:
        def __init__(self, **kw):
            self.__dict__.update(kw)

    class _Component:
        pass

    class _Data:
        def __init__(self, data):
            self.data = data

    mods = {
        "langflow": types.ModuleType("langflow"),
        "langflow.custom": types.ModuleType("langflow.custom"),
        "langflow.io": types.ModuleType("langflow.io"),
        "langflow.schema": types.ModuleType("langflow.schema"),
    }
    mods["langflow.custom"].Component = _Component
    mods["langflow.io"].MultilineInput = _Input
    mods["langflow.io"].Output = _Input
    mods["langflow.schema"].Data = _Data
    for name, mod in mods.items():
        monkeypatch.setitem(sys.modules, name, mod)

    spec = importlib.util.spec_from_file_location("risk_score_stubbed", rs.__file__)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module._HAS_LANGFLOW

    comp = module.RiskScoreComponent()
    comp.risk_points_json = json.dumps(read_json("risk-points.json"))
    comp.snapshot_json = json.dumps({**BASE, "stopIntent": True, "maxPersistenceDays": 7, "level": "YELLOW"})
    out = comp.run_risk()
    assert (out.data["score"], out.data["band"]) == (8, "high")
    assert comp.status == "8 (high)"
