# corpus/

Curated guideline text in Bahasa Indonesia that grounds every generated explanation
and every Q&A answer. **Status: DRAFT — perlu ditinjau klinisi.** Nothing here has been
reviewed by a clinician yet; `review_status: draft` is carried into the manifest.

| File | Sections |
| --- | --- |
| `efek-samping-ringan.md` | orange/red urine, mild nausea, joint ache, appetite (GREEN codes) |
| `efek-samping-perlu-perawat.md` | tingling feet, itching without rash, lasting nausea/appetite loss (YELLOW) |
| `tanda-bahaya.md` | yellow eyes/skin, vision, rash, repeated vomiting, confusion, what to do (RED) |
| `minum-obat-teratur.md` | feeling better is not cured, why it takes long, missed doses, reminders, boredom |
| `ambil-obat.md` | pickup schedule, late pickup, travelling |
| `peran-pendamping.md` | PMO role, daily report, shame/stigma, privacy, preventing spread at home |
| `manifest.json` | generated: `{ generated_by, review_status, sections: [{ id, label, source, review_status, codes }] }` |
| `build_manifest.py` | parser + manifest builder (`--check` fails when the manifest is stale) |

Format: front matter (`id` = file name, `display_title`, `source`, `review_status`,
`reviewed_by`), then one `## Heading {#slug}` per citable section. Section id is
`<file id>#<slug>`, e.g. `efek-samping-ringan#urin-merah`. An optional
`<!-- codes: urine_orange -->` line maps triage codes to the section.

Writing rules (checked by `langflow/tests/test_corpus.py`): short plain sentences, no
dosing amounts or dose changes, no diagnosis, never the word "aman", missed doses always
go to the nurse. Display titles and labels are neutral (no "TB", "TBC", "tuberkulosis");
the body may name the illness.

After editing: `python corpus/build_manifest.py`, then redeploy
(`python langflow/scripts/deploy_flows.py`), which re-ingests changed sections.
