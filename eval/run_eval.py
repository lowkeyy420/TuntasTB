"""TuntasTB eval runner (plan spec S10). See eval/README.md.

    python eval/run_eval.py --mode offline
    python eval/run_eval.py --mode live [--transport mcp|rest|auto] [--limit N] [--ids ...]
    python eval/run_eval.py --mode offline --update-baseline

Exit codes: 0 safe, 1 safety gate failed, 2 RED regression, 3 configuration error.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tuntas_eval.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
