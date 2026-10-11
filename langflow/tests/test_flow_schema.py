"""langflow/flows/checkin_triage.schema.json: design examples validate, bad samples do not."""

import copy
import json
import sys
from pathlib import Path

import pytest

jsonschema = pytest.importorskip("jsonschema")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "langflow" / "components"))
SCHEMA = json.loads((ROOT / "langflow" / "flows" / "checkin_triage.schema.json").read_text(encoding="utf-8"))

# The two example objects from openspec/changes/add-symptom-extraction/design.md.
DESIGN_INPUT = {
    "text": "mual terus, matanya agak kuning",
    "chips": ["nausea_mild"],
    "dose_status": "yes",
    "treatment_day": 41,
    "context": {
        "persistence_days": {"nausea_mild": 7},
        "consecutive_missed_before": 0,
        "missed_pickup": False,
        "has_pmo": True,
        "days_since_last_checkin": 0,
    },
    "rules_version": "0.1.0-draft",
}
DESIGN_OUTPUT = {
    "extracted": {
        "symptoms": [{"code": "jaundice", "quote": "matanya agak kuning", "duration_days": None}],
        "unknown_symptoms": [],
        "dose_status": "yes",
        "mood_flags": [],
        "confidence": 0.86,
    },
    "level": "RED",
    "risk": {"score": 5, "band": "medium"},
    "reasons": ["red_flag_keyword:jaundice"],
    "family_message": "",
    "nurse_line": "",
    "citations": [],
}


def output_validator():
    return jsonschema.Draft7Validator(SCHEMA)


def input_validator():
    return jsonschema.Draft7Validator({**SCHEMA, "$ref": "#/definitions/input"})


def test_schema_is_valid_draft7():
    jsonschema.Draft7Validator.check_schema(SCHEMA)


def test_design_examples_validate():
    input_validator().validate(DESIGN_INPUT)
    output_validator().validate(DESIGN_OUTPUT)


def _mutate(obj, path, value=None, delete=False):
    obj = copy.deepcopy(obj)
    cur = obj
    for key in path[:-1]:
        cur = cur[key]
    if delete:
        del cur[path[-1]]
    else:
        cur[path[-1]] = value
    return obj


@pytest.mark.parametrize("bad", [
    _mutate(DESIGN_OUTPUT, ["level"], "SAFE"),
    _mutate(DESIGN_OUTPUT, ["extracted"], delete=True),
    _mutate(DESIGN_OUTPUT, ["risk", "score"], "5"),
    _mutate(DESIGN_OUTPUT, ["extracted", "confidence"], 1.5),
    _mutate(DESIGN_OUTPUT, ["extracted", "mood_flags"], ["happy"]),
    _mutate(DESIGN_OUTPUT, ["extracted", "level"], "GREEN"),
    _mutate(DESIGN_OUTPUT, ["extra"], True),
    _mutate(DESIGN_OUTPUT, ["risk", "band"], "none"),
])
def test_invalid_outputs_rejected(bad):
    assert not output_validator().is_valid(bad)


@pytest.mark.parametrize("bad", [
    _mutate(DESIGN_INPUT, ["dose_status"], "maybe"),
    _mutate(DESIGN_INPUT, ["text"], delete=True),
    _mutate(DESIGN_INPUT, ["patient_code"], "TB-0001"),
    _mutate(DESIGN_INPUT, ["context", "puskesmas"], "Puskesmas X"),
])
def test_invalid_inputs_rejected(bad):
    assert not input_validator().is_valid(bad)


def test_flow_output_builder_matches_schema():
    import extract_parse as ep

    parsed = ep.parse_input(json.dumps(DESIGN_INPUT))
    codes = {"jaundice", "nausea_mild"}
    guard = ep.guard_extraction(json.dumps(DESIGN_OUTPUT["extracted"]), DESIGN_INPUT["text"], codes, "yes")
    out = ep.build_output(parsed, guard, {"level": "RED", "redFlags": ["jaundice"], "symptoms": ["jaundice"]},
                          {"score": 5, "band": "medium", "reasons": []})
    output_validator().validate(out)
    # The failure shape (no model output) is schema-valid too.
    output_validator().validate(ep.build_output(parsed, ep.guard_extraction("", "x", codes), {}, {}))
