"""Make ``eval/`` (the ``tuntas_eval`` package) importable from the tests."""

import shutil
import sys
from pathlib import Path

import pytest

EVAL_DIR = Path(__file__).resolve().parents[1]
ROOT = EVAL_DIR.parent
sys.path.insert(0, str(EVAL_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from tuntas_eval import local_rules  # noqa: E402


@pytest.fixture(scope="session")
def rules() -> local_rules.Rules:
    return local_rules.Rules()


@pytest.fixture()
def rules_copy(tmp_path: Path) -> Path:
    """A writable copy of rules/ for tests that break the rules on purpose."""
    dst = tmp_path / "rules"
    shutil.copytree(ROOT / "rules", dst, ignore=shutil.ignore_patterns("fixtures", "schema"))
    return dst
