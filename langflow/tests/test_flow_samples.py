"""Shared contract samples (add-symptom-extraction 4.2), JSON Schema half.

``langflow/flows/checkin_triage.samples.json`` is also run through the web's zod
schemas (``web/src/lib/langflow/flowSchema.test.ts``); both sides assert the same
``valid`` flag per sample, so the JSON Schema and the zod schema agree.
"""

import copy
import json
from pathlib import Path

import pytest

jsonschema = pytest.importorskip("jsonschema")

ROOT = Path(__file__).resolve().parents[2]
FLOWS = ROOT / "langflow" / "flows"
SCHEMA = json.loads((FLOWS / "checkin_triage.schema.json").read_text(encoding="utf-8"))
SAMPLES = json.loads((FLOWS / "checkin_triage.samples.json").read_text(encoding="utf-8"))


def build(base, sample):
    """Apply a sample's ``set``/``delete`` edits; ``"@<n>"`` stands for a string of n characters."""
    obj = copy.deepcopy(base)
    for path, value in sample.get("set", []):
        if isinstance(value, str) and value.startswith("@") and value[1:].isdigit():
            value = "x" * int(value[1:])
        cur = obj
        for key in path[:-1]:
            cur = cur[key]
        cur[path[-1]] = value
    for path in sample.get("delete", []):
        cur = obj
        for key in path[:-1]:
            cur = cur[key]
        del cur[path[-1]]
    return obj


OUTPUT = jsonschema.Draft7Validator(SCHEMA)
INPUT = jsonschema.Draft7Validator({**SCHEMA, "$ref": "#/definitions/input"})


def test_samples_cover_both_outcomes():
    for kind in ("output", "input"):
        flags = {s["valid"] for s in SAMPLES[kind]}
        assert flags == {True, False}, kind
        ids = [s["id"] for s in SAMPLES[kind]]
        assert len(ids) == len(set(ids)), kind


@pytest.mark.parametrize("sample", SAMPLES["output"], ids=lambda s: s["id"])
def test_output_samples(sample):
    assert OUTPUT.is_valid(build(SAMPLES["base_output"], sample)) is sample["valid"]


@pytest.mark.parametrize("sample", SAMPLES["input"], ids=lambda s: s["id"])
def test_input_samples(sample):
    assert INPUT.is_valid(build(SAMPLES["base_input"], sample)) is sample["valid"]
