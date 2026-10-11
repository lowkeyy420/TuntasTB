# Tasks

## 1. Corpus

- [ ] 1.1 Write `corpus/efek-samping-ringan.md` and `corpus/efek-samping-perlu-perawat.md` with front matter and one `##` section per GREEN and YELLOW symptom; verify every GREEN and YELLOW symptom code maps to a section (pytest check against the triage table)
- [ ] 1.2 Write `corpus/tanda-bahaya.md` with one section per RED symptom; verify every RED symptom code maps to a section
- [ ] 1.3 Write `corpus/minum-obat-teratur.md`, `corpus/ambil-obat.md` and `corpus/peran-pendamping.md`; verify each has front matter with `source` and `review_status: draft`
- [ ] 1.4 Implement `corpus/build_manifest.py` and generate `corpus/manifest.json`, with pytest tests for unique ids, a label and source per section, and no forbidden term in any label; verify the tests pass
- [ ] 1.5 Add a CI step that regenerates the manifest and fails on a diff; verify it fails after editing a heading without regenerating

## 2. Forbidden-output patterns and templates

- [ ] 2.1 Add the `forbidden_output` block (dosing, diagnosis, conditions, jargon, stop and continue instructions) to `rules/lexicon.id.json` and its schema; verify the rule file validation passes
- [ ] 2.2 Add `action_variants.stop_intent`, `no_symptom`, `dose_missed` and a default citation id per level to `rules/triage-table.json`; verify validation passes and every default citation id exists in the manifest (unit test)

## 3. Filter

- [x] 3.1 Implement the `reassurance`, `dosing` and `diagnosis` checks with unit tests for every scenario in the spec, including "AMAN", "nyaman", "300 mg", "2 tablet", "kurangi dosis", "ganti obat", "ini tanda hepatitis" and "Anda menderita"; verify the tests pass
- [x] 3.2 Implement the `level_mismatch`, `contradiction`, `jargon` and `sentence_length` checks with unit tests for each scenario; verify the tests pass
- [x] 3.3 Implement the `citation` and `too_long` checks with unit tests for no citation, unknown id, two citations and the 60-word boundary; verify the tests pass
- [x] 3.4 Implement `checkStatic` and a test that runs it over every template and variant and that each template plus action is at most 60 words; verify it passes and fails when "aman" is inserted into a template
- [x] 3.5 Set coverage thresholds for `web/src/lib/reply/filter.ts` to 100% lines and branches; verify `npm run test:coverage` passes

## 4. Composition and nurse line

- [x] 4.1 Implement `composeReply` (explanation or template, fixed action with variants, source label, contact last) with unit tests for the structure scenarios, the fallback warning and demo day 41; verify the tests pass
- [x] 4.2 Implement `buildNurseLine` and the selection between generated and deterministic lines, with unit tests for demo day 41, a rejected generated line and the 120-character limit; verify the tests pass
- [x] 4.3 Add the migration for `reply_template_used` and `reply_replace_reason` and store them with the composed reply in phase B, with a test for the recorded reason; verify the test passes
- [x] 4.4 Replace the reply builder from `add-daily-checkin` with `composeReply` and update the reply screen to show explanation, action, "Sumber:" and contact; verify the existing check-in tests still pass and view the three demo replies in the browser

## 5. Flows

- [ ] 5.1 Build `ingest_corpus` in the Langflow UI (loader, split by section, embeddings, Chroma collection `tuntas_corpus` with `section_id` metadata) and export it to `langflow/flows/ingest_corpus.json`; verify the export loads as JSON
- [ ] 5.2 Extend `deploy_flows.py` to upload the corpus, reset the collection and run `ingest_corpus`, with a pytest test on a mocked transport for the call sequence; verify the test passes and two real runs leave one copy of each section
- [ ] 5.3 Write `langflow/prompts/explain.id.md` with the rules from design.md; verify a pytest check finds the "no aman", "no dosing", "one citation" and "empty if no section fits" rules in the file
- [ ] 5.4 Add the Build Query, retriever, explain prompt and model nodes to `checkin_triage`, update `Build Output` and its pytest tests for the citation mapping, and re-export the flow; verify the tests pass
- [ ] 5.5 Update the flow output JSON Schema and zod schema for `citations: [{ id, label }]`; verify the schema agreement test passes
- [ ] 5.6 Redeploy and run the three demo notes in the playground; verify each returns a message of at most 35 words with one citation id from the manifest

## 6. Integration check

- [ ] 6.1 With Langflow running, submit the three demo check-ins and the dosing question from the spec; verify each reply has one action, one source label, the contact last, at most 60 words and no forbidden content
- [ ] 6.2 Stop Langflow and submit a check-in; verify the static template, the standing warning and the contact are shown and the replacement reason is stored
