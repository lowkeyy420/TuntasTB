#!/usr/bin/env python3
"""Parse the guideline corpus and build ``corpus/manifest.json``.

Corpus format (one file per topic)::

    ---
    id: efek-samping-ringan
    display_title: Panduan keluhan ringan saat minum obat
    source: <guideline or article, with URL>
    review_status: draft
    reviewed_by:
    ---

    > DRAFT — perlu ditinjau klinisi. ...

    ## Kencing berwarna merah atau oranye {#urin-merah}
    <!-- codes: urine_orange -->

    Section text ...

Each ``##`` heading is one citable section with id ``<doc id>#<slug>``. The optional
``<!-- codes: ... -->`` line maps triage symptom codes to the section. The manifest
lists ``{id, label, source, review_status, codes}`` per section; ``label`` is neutral
("<display_title>, bagian <heading>") and is what families see after "Sumber:".

Usage::

    python corpus/build_manifest.py          # write corpus/manifest.json
    python corpus/build_manifest.py --check  # exit 1 when the file is out of date
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

CORPUS_DIR = Path(__file__).resolve().parent
MANIFEST = CORPUS_DIR / "manifest.json"
FORBIDDEN_LABEL_TERMS = ("tb", "tbc", "tuberkulosis", "tuntastb", "aman")

_FRONT = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.DOTALL)
_HEADING = re.compile(r"^##\s+(.+?)\s*\{#([a-z0-9][a-z0-9-]*)\}\s*$")
_CODES = re.compile(r"^<!--\s*codes:\s*(.*?)\s*-->\s*$")
_DOC_ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")


class CorpusError(ValueError):
    pass


def parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    m = _FRONT.match(text)
    if not m:
        raise CorpusError("missing front matter")
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        if ":" not in line:
            raise CorpusError(f"bad front matter line: {line!r}")
        key, value = line.split(":", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        meta[key.strip()] = value
    return meta, text[m.end():]


def parse_doc(path: Path) -> list[dict[str, Any]]:
    meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
    for key in ("id", "display_title", "source", "review_status"):
        if not meta.get(key):
            raise CorpusError(f"{path.name}: front matter needs {key}")
    if meta["id"] != path.stem or not _DOC_ID.match(meta["id"]):
        raise CorpusError(f"{path.name}: id must equal the file name")
    if meta["review_status"] not in ("draft", "reviewed"):
        raise CorpusError(f"{path.name}: review_status must be draft or reviewed")

    sections: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in body.splitlines():
        if line.startswith("## "):
            m = _HEADING.match(line)
            if not m:
                raise CorpusError(f"{path.name}: heading without {{#slug}}: {line!r}")
            current = {
                "id": f"{meta['id']}#{m.group(2)}",
                "doc": meta["id"],
                "slug": m.group(2),
                "heading": m.group(1).strip(),
                "label": f"{meta['display_title']}, bagian {m.group(1).strip().lower()}",
                "source": meta["source"],
                "review_status": meta["review_status"],
                "codes": [],
                "lines": [],
            }
            sections.append(current)
            continue
        if current is None:
            continue  # intro text and the draft note are not citable
        m = _CODES.match(line.strip())
        if m:
            current["codes"] = [c.strip() for c in m.group(1).split(",") if c.strip()]
            continue
        current["lines"].append(line)
    for s in sections:
        s["body"] = "\n".join(s.pop("lines")).strip()
        if not s["body"]:
            raise CorpusError(f"{s['id']}: empty section")
    return sections


def load_sections(corpus_dir: Path = CORPUS_DIR) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    for path in sorted(corpus_dir.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        sections += parse_doc(path)
    ids = [s["id"] for s in sections]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        raise CorpusError(f"duplicate section ids: {dupes}")
    return sections


def label_problems(label: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", label.lower())
    return [t for t in FORBIDDEN_LABEL_TERMS if t in words]


def chunk_text(section: dict[str, Any]) -> str:
    """The text stored in the vector store for one section (read back by ask_parts)."""
    return (
        f"[section_id: {section['id']}]\n"
        f"[label: {section['label']}]\n"
        f"## {section['heading']}\n"
        f"{section['body']}"
    )


def build_manifest(corpus_dir: Path = CORPUS_DIR) -> dict[str, Any]:
    sections = load_sections(corpus_dir)
    for s in sections:
        bad = label_problems(s["label"])
        if bad:
            raise CorpusError(f"{s['id']}: label contains {bad}")
    statuses = {s["review_status"] for s in sections}
    return {
        "generated_by": "corpus/build_manifest.py",
        "review_status": "reviewed" if statuses == {"reviewed"} else "draft",
        "sections": [
            {k: s[k] for k in ("id", "label", "source", "review_status", "codes")} for s in sections
        ],
    }


def render(manifest: dict[str, Any]) -> str:
    return json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build corpus/manifest.json")
    ap.add_argument("--check", action="store_true", help="fail when manifest.json is out of date")
    args = ap.parse_args(argv)
    text = render(build_manifest())
    if args.check:
        current = MANIFEST.read_text(encoding="utf-8") if MANIFEST.exists() else ""
        if current != text:
            print("corpus/manifest.json is out of date; run python corpus/build_manifest.py", file=sys.stderr)
            return 1
        print("corpus/manifest.json is up to date")
        return 0
    MANIFEST.write_text(text, encoding="utf-8")
    print(f"wrote {MANIFEST.name} ({len(json.loads(text)['sections'])} sections)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
