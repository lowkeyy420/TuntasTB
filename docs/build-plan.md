# TuntasTB: Postmortem and Build Plan

Oct 11, 2026 · @Josafat Anderson

## Verdict

TuntasTB is worth building, but not as pitched. As a "pill reminder + daily check-in" app it scores about **66/100**, because reminder apps are a crowded category with weak evidence and the headline data point was used loosely. Rebuilt as a **side-effect triage and dropout early-warning system that puts the Puskesmas TB nurse in the loop**, it scores about **80/100**, level with KejarImun and just under OmprengCek (84).

The core change: the AI stops being a reminder and becomes a decision. Every daily check-in from the patient or their family PMO gets sorted into continue, call the nurse, or stop and go now, using fixed guideline rules. Every morning the nurse gets a ranked list of who is about to drop out and why. That matches what actually drives dropout in the field: side effects, boredom and stigma, mostly in the first months.

| Version | Problem | Innovation + money | Impact | Tech | Responsible AI | Total /100 |
| --- | --- | --- | --- | --- | --- | --- |
| Original pitch (reminder app) | 7 | 5 | 7 | 8 | 6 | 66 |
| Fixed TuntasTB (triage + nurse loop) | 9 | 7 | 8 | 8 | 8 | 80 |

Scores are out of 10 per criterion, weighted 20/20/20/15/15 and normalized to 100 (class participation excluded), same method as the earlier rounds.

## Postmortem: what's wrong with the original pitch

Seven problems a judge would find. The first three are the ones that would sink it.

1. **It's a reminder app, and reminder apps are everywhere.** Indonesian campuses and Puskesmas have already built SMART-TB, KANG TB (for PMOs in Pekalongan), JAMU TB in Pontianak, TOBAT, and a video-observed therapy app called MyTBCompanion for Malaysia and Indonesia. A judge has seen this.
2. **The evidence for reminders alone is weak.** A UGM study in two Puskesmas found an education plus reminder app did not significantly improve TB patients' knowledge or adherence. Pitching "we remind people" invites that rebuttal.
3. **The headline number was used loosely.** The 37.5% figure comes from the SKI 2023 household survey: people with a doctor's TB diagnosis who say they didn't finish 6 months. It is self-reported and not the program's official dropout rate. Its top reason was drugs not being available (34.3%), which an app cannot fix.
4. **The real drivers weren't in the pitch.** A Sulsel TB program officer said the treatment success rate there is about 84%, and most of the 16% gap is dropout, driven by side effects, boredom and stigma. Side effects and stigma need a human response, not a notification.
5. **The user was fuzzy.** "TB patients" is a category. The patient, the family PMO and the Puskesmas TB nurse each need different things, and only the nurse can act on a red flag.
6. **Medical safety was hand-waved.** "Side-effect triage" with an LLM deciding is dangerous. A missed jaundice or vision problem is real harm.
7. **No one pays for it.** TB drugs are free and patients won't pay. The pitch had no buyer.

What was right: the problem is real, national and measurable, the PMO angle is grounded in program practice, and Indonesia's own 2025 target is a 90% treatment success rate, so a tool that moves that number has an obvious government audience.

## The fixed idea

**Pitch:** "Two months into TB treatment, your mom feels nauseous every morning and says she's cured anyway. TuntasTB tells the family what's normal, what's an emergency, and makes sure the Puskesmas nurse calls before she quits."

**Users**

| Role | What they do in TuntasTB | Why they matter |
| --- | --- | --- |
| Family PMO (primary) | Sends a 20-second daily check-in for the patient | Lives with the patient, sees side effects and "I'm cured" talk first |
| Patient | Can check in themselves, asks "is this normal?" | The one who decides to stop |
| Puskesmas TB nurse (customer) | Gets a ranked morning list and red-flag alerts | The only person who can act clinically |
| Community TB companion (channel) | Uses the same nurse view for their caseload | Already funded to accompany patients in 190 districts |

**The moment:** months 1 to 3 of treatment, when side effects peak, the patient starts feeling better, and pickups at the Puskesmas get easy to skip.

**Problem statement:** Families supervising a TB patient at home in Jakarta (user + condition) need to know whether a symptom is normal or dangerous and keep the patient on track (need), but side effects are confusing, the nurse only sees them at pickup, and dropout often goes unnoticed until it's too late (challenge). TuntasTB aims for every red-flag symptom reaching a nurse the same day and fewer missed pickups in the first 3 months (outcome + measure).

**HMW:** How might we help family PMOs and Puskesmas TB nurses catch side effects and dropout risk early, despite infrequent clinic contact and stigma that keeps patients quiet?

**In scope for the MVP**

- Drug-sensitive TB (TB SO), adults, first-line regimen
- Daily check-in by text or voice, in Bahasa Indonesia
- Rule-based side-effect triage with three outcomes
- Dropout-risk score and a ranked nurse queue
- Refill and pickup planner
- Grounded Q&A from a curated guideline corpus

**Out of scope, on purpose**

- Diagnosis, dose changes, or any treatment decision
- Drug-resistant TB (TB RO), children, TB-HIV (later phases, need specialist rules)
- Real SITB integration (mocked with synthetic data; needs Kemenkes access)
- WhatsApp Business API (web PWA first; WhatsApp is phase 2)

## Evidence

The case rests on four numbers: Indonesia carries about 10% of the world's TB, the government's target is 90% treatment success, regions report well below it, and dropout is the biggest share of the gap.

| Fact | Value | Source | How to say it on stage |
| --- | --- | --- | --- |
| Global share | \~1.09 million cases in 2023, about 10% of global TB, 2nd in the world | [Unair journal, citing WHO and Kemenkes](https://e-journal.unair.ac.id/MGK/article/download/76674/34706/462754) | "One in ten TB patients on Earth is Indonesian" |
| National target | 90% treatment success rate in 2025 | [Perpres 79/2025 via Databoks](https://databoks.katadata.co.id/en/consumer-services/statistics/68dcefefe5891/4-indonesian-government-targets-for-the-tb-eradication-program-by-2025) | Quote as the government's own target |
| Regional gap | Sulsel success rate \~84%; most of the remaining 16% is dropout, driven by side effects, boredom, stigma | [RRI Makassar, Apr 2026](https://rri.co.id/makassar/kesehatan/2323884/dinkes-sulsel-ingatkan-pasien-tbc-tuntaskan-pengobatan-selama-enam-bulan) | Name it as one province's program officer, not a national rate |
| Self-reported non-completion | 37.5% didn't finish 6 months; reasons: drugs unavailable 34.3%, felt healthy 32.4%; 4 in 10 had no PMO | [BKPK Kemenkes, SKI 2023](https://www.badankebijakan.kemkes.go.id/?p=11915) | Say "household survey, self-reported" every time |
| Drug-resistant TB | 52% success for the 2020 MDR/RR cohort | [WHO country profile](https://www.aidsdatahub.org/sites/default/files/resource/indonesia-tb-profile.pdf) | Use only to justify phase 2 |
| Drug supply | First-line drugs made domestically, stock reported safe; resistant-TB drugs are the real supply risk | [Kontan](https://nasional.kontan.co.id/news/obat-tbc-cukup-sampai-februari-2026-pengamatpendanaan-bersandar-dari-internasional), [RRI Samarinda, Aug 2026](https://rri.co.id/samarinda/kesehatan/2625588/dinkes-samarinda-pastikan-stok-obat-tbc-dan-hiv-aman-tersedia) | Explains why a refill planner is enough for TB SO |
| Reminder apps alone | Education + reminder app showed no significant adherence gain | [UGM study](https://journal.ugm.ac.id/jmpf/article/download/88408/pdf) | Use it yourself, before a judge does |

One gap to close in interviews: there is no public national dropout rate for 2025 in these sources. Ask a Puskesmas TB nurse for their own cohort numbers (started, completed, dropped) and use those in the pitch.

## Existing solutions and the gap

Everything that exists today either reminds the patient or relies on a human seeing them in person. Nothing turns what the family notices at home into a same-day clinical signal for the nurse.

| What exists | What it does | What it misses |
| --- | --- | --- |
| PMO system at the Puskesmas | A family member or volunteer watches the patient take pills | 4 in 10 patients have none, and PMOs aren't trained to judge side effects |
| Weekly or biweekly pickup ([Unair ITD](https://itd.unair.ac.id/wp/?p=829)) | Nurse sees the patient when they collect drugs | A week of silence between visits, which is when patients quit |
| Reminder apps: [SMART-TB](https://www.ejournal.unma.ac.id/index.php/bernas/article/download/17802/8183/76906), [KANG TB](https://ejurnal.ung.ac.id/index.php/jjhsr/article/view/20786), [JAMU TB](https://litbang.pontianak.go.id/file/bappelitbang/1728869559.docx) | Notifications, dose logging, education | No triage, no prioritization, usually no nurse loop; mostly pilots |
| Video observed therapy ([study](https://journal.universitaspahlawan.ac.id/index.php/ners/article/download/44607/28452/154384), [MyTBCompanion](https://eprints.whiterose.ac.uk/223515)) | Patient records themselves swallowing pills | Proves the pill went down, not whether the patient is about to quit or has jaundice |
| Community companions ([Penabulu-STPI](https://penabulufoundation.org/?p=11336)) | Funded volunteers accompany patients in 30 provinces and 190 districts | Caseloads tracked by hand; no early warning |

**The gap TuntasTB fills:** a decision, not a reminder. It reads free-text or voice check-ins, applies guideline red-flag rules, scores dropout risk transparently, and hands the nurse a ranked list each morning. Reminders are a minor feature, not the product.

Position it as a layer that feeds the existing program (PMO, companions, SITB later), not a competitor to it.

## How it works

One daily check-in feeds two decisions: a triage level for today's symptoms, and a dropout-risk score that orders the nurse's list. Rules decide; the LLM only reads messy input and writes plain explanations.

&#91;embedded content: Check-in triage flow · three levels, one risk score\]

The LLM only turns messy text into fields; the rule table picks the level, and RED skips the queue to alert the nurse immediately.

**User flows**

1. **Onboarding (nurse, 3 min):** nurse registers the patient with a code (no name needed), start date, regimen phase, pickup schedule and PMO phone. The family gets a link to the PWA.
2. **Daily check-in (family or patient, 20 sec):** "Obat hari ini sudah diminum?" plus symptom chips, plus an optional free-text or voice note like "mual terus, matanya agak kuning".
3. **Instant reply (family):** what this symptom usually means, whether to keep taking the drugs, and what to do next, with the guideline source.
4. **Morning queue (nurse):** patients ranked by risk, each with a one-line reason and a suggested action (call, home visit, early pickup).
5. **Red-flag alert (nurse, real time):** any RED check-in pings the nurse immediately.
6. **Pickup planner (family):** pills left vs next pickup date, with a nudge 2 days before.

**AI workflow**

| Stage | What happens | Who decides |
| --- | --- | --- |
| Input | Dose taken (yes / no / partial), symptom chips, free text or voice transcript, day of treatment | User |
| Extract | LLM connector turns the message into strict JSON: symptoms, dose status, mood flags ("sudah sembuh", "malu", "bosan"), confidence | LLM, schema-checked |
| Triage | Python rule component maps each symptom to GREEN / YELLOW / RED from a guideline table; the highest level wins | Rules |
| Risk score | Transparent points: missed doses, consecutive misses, stop-intent words, stigma words, unresolved side effects, missed pickup, no PMO | Rules |
| Explain | RAG over the curated corpus writes the family message and the nurse's one-line reason, with a citation | LLM, grounded |
| Output | Family reply + nurse queue entry + RED alert when needed | System |

**Draft triage table** (to be checked by a clinician against the national TB guideline before any real use; categories follow the minor vs major split described by [Alomedika](https://alomedika.com/menangani-efek-samping-terapi-tuberkulosis)):

| Level | Example symptoms | Message to family |
| --- | --- | --- |
| GREEN | Orange or red urine, mild nausea after pills, mild joint ache | "Common and usually fades in 2 to 4 weeks. Keep taking the drugs. Tips: take with a little food if the nurse allows." |
| YELLOW | Tingling or burning feet, itching without rash, nausea or poor appetite lasting over 7 days, any symptom the system can't classify | "Keep taking the drugs. Your nurse will contact you within 1 working day." |
| RED | Yellow eyes or skin, blurred vision or color changes, skin rash, repeated vomiting, confusion | "Stop and go to the Puskesmas or IGD today. Your nurse has been alerted." |

**Failure responses**

- Extraction confidence low or symptom unknown → YELLOW, never GREEN.
- Any red-flag word appears, even uncertain → RED. The system errs toward escalation.
- Question outside the corpus → "Saya belum bisa menjawab ini, tanyakan ke perawat" with the Puskesmas number.
- LLM or Langflow down → static fallback: "Kalau ada mata/kulit kuning, ruam, atau gangguan penglihatan, segera ke Puskesmas."
- The system never says "aman", never changes doses, never diagnoses.

## Architecture

A Next.js PWA talks to its own API, which calls Langflow flows server-side; Bob connects to the same flows over MCP to test, audit and document them. All AI calls go through generic LLM and embedding connectors (Gemini or Claude via API key).

&#91;embedded content: TuntasTB architecture · app and Bob share one Langflow project\]

The browser never talks to Langflow directly; Bob reaches the same three flows as MCP tools for evals and reports.

**Langflow flows (one project, exposed as an MCP server)**

| Flow / MCP tool | Components | Output |
| --- | --- | --- |
| `checkin_triage` | Chat Input → LLM connector with structured output → Python rule component (triage) → Python component (risk score) → Retriever → Prompt → LLM connector → Chat Output | JSON: level, risk score, reasons, family message, nurse line, citations |
| `ask_guideline` | Chat Input → Retriever (top 4) → Prompt with abstain rule → LLM connector → Chat Output | Answer with citation, or a refusal |
| `nurse_digest` | Text Input (Puskesmas id, date) → custom component reading the API → ranking → LLM summary → Chat Output | Ranked list with one-line reasons |
| `ingest_corpus` | File → Split Text → embedding connector → vector store | Updated corpus (admin only) |

The refill planner is plain app code, not a flow: it's date math and doesn't need AI.

**Data model (Postgres)**

| Table | Key fields |
| --- | --- |
| `patients` | code, puskesmas\_id, start\_date, phase, pickup\_interval\_days, pmo\_contact\_hash, consent\_at |
| `checkins` | patient\_id, treatment\_day, dose\_status, symptoms\_json, text\_redacted, triage\_level, risk\_score, created\_at |
| `alerts` | checkin\_id, level, acknowledged\_by, acknowledged\_at |
| `pickups` | patient\_id, due\_date, done\_at |
| `audit_log` | actor, action, target, timestamp |

**App**

- Family view: check-in, reply screen, pickup countdown, "ask a question". Opened by a per-patient link token; no account, no name stored.
- Nurse console: ranked queue, alert inbox with acknowledge button, patient timeline. Nurse login required.
- API routes hold the Langflow API key; the browser never calls Langflow directly.

**Bob via MCP**

- Register the Langflow project MCP server (streamable HTTP, `x-api-key` header) in the repo's `.bob/mcp.json`, with `alwaysAllow` left empty so every tool call needs approval.
- A custom Bob mode, "Auditor TB", with three jobs:
  1. **Eval:** run a golden set of 120+ synthetic check-ins through `checkin_triage` and report RED recall (must be 100%), YELLOW precision and citation coverage.
  2. **Regression:** rerun the set after every prompt or rule change and block the merge if a RED case drops.
  3. **Docs and ops:** generate the technical documentation from the flows, and draft a weekly cohort report for a Puskesmas from `nurse_digest`.
- During the build, Bob (or Claude, Gemini, Kiro) scaffolds the Next.js code and the rule component; the final integration shown to judges is Bob through MCP.
- Day 1 task: confirm the exact Langflow MCP endpoint and Bob config on your installed versions; earlier research could not find a published joint example.

**Deployment**

- Docker Compose: `web` (Next.js), `langflow`, `postgres` (with pgvector or a separate Chroma container), Caddy for TLS, on a small VPS.
- Langflow with `AUTO_LOGIN=false` and keys stored as global variables.
- GitHub Actions: lint, unit tests for the rule and risk components, and the eval set as a gate.

## Responsible AI, safety and privacy

The safety rule is simple: the AI may only make escalation more likely, never less. A wrong RED costs a nurse a phone call; a wrong GREEN can cost a liver.

| Risk | Mitigation |
| --- | --- |
| Missed red flag (jaundice, vision, rash) | Rules, not the LLM, set the level; red-flag keywords force RED even at low confidence; RED recall of 100% on the eval set is a release gate |
| Medical advice overreach | No dosing, no diagnosis, no "aman"; every message ends with the Puskesmas contact; clinician reviews the triage table and corpus |
| Hallucinated guidance | Q&A answers only from the curated corpus with a citation, otherwise abstains; Bob checks citation coverage in every eval run |
| Stigma and disclosure | App name and notifications never say "TB" or "TBC" (e.g. "Pengingat harian"); no name stored, only a patient code; family link can be revoked by the nurse |
| Health data under UU PDP 27/2022 | Health data is "specific" personal data: explicit consent at onboarding, data minimization, free text redacted before any LLM call, Indonesia-hosted database, retention limited to treatment period plus a set window, deletion on request |
| Third-party LLM exposure | Only redacted text is sent; no phone numbers, names or addresses in prompts; provider choice documented |
| Fairness and access | Works on low-end Android via PWA, large text, voice input for low-literacy and older PMOs, plain Bahasa Indonesia at a primary-school reading level |
| Automation bias at the clinic | Nurse sees the reasons behind each score, can override the level with a note, and every override is logged |
| Misuse (employer or landlord learning someone's status) | Access only via the patient's own link or a nurse account; audit log on every read |

Frame it to judges against Kominfo's AI ethics circular (SE 9/2023) and the draft national AI rules covered in earlier research, and say plainly: the tool supports the nurse and the PMO, it never replaces them.

## Business Model Canvas

Free for patients and families, paid by the people accountable for the 90% target: city health offices and the funded community TB programs.

| Block | Draft |
| --- | --- |
| Customer segments | Paying: Dinkes (city or district), Puskesmas, community TB programs such as [Penabulu-STPI](https://penabulufoundation.org/?p=11336) and their sub-recipients, private hospitals running TB DOTS. Free users: patients and family PMOs |
| Value propositions | Nurses: a ranked daily list instead of guessing who to call; same-day red-flag alerts; an audit trail. Families: "is this normal?" answered in seconds with a clear next step. Dinkes: earlier signal on dropout against the 90% target |
| Channels | Pilot through one Jakarta Puskesmas TB unit, then Sudinkes; community TB companions; TB survivor groups |
| Customer relationships | Onboarding session for nurses, monthly cohort report generated with Bob, a feedback line for corpus updates |
| Revenue streams | Per-Puskesmas subscription (assumption to test: Rp1 to 2 million per Puskesmas per month); grant-funded deployments through community TB programs; CSR from pharma or insurers for scale-up |
| Key resources | Reviewed triage rules and corpus, eval dataset, Langflow flows, nurse console design |
| Key activities | Clinical review of rules, eval runs, nurse training, corpus updates when guidelines change |
| Key partners | Puskesmas TB units, Sudinkes/Dinkes DKI, community TB programs, a clinician advisor, survivor organizations |
| Cost structure | LLM and embedding usage (small: short texts), VPS hosting, clinical review time, field visits |

The price is a guess. Ask every nurse and program manager you interview what they'd pay for, and from which budget line.

## Metrics and validation

Two numbers must be perfect in the demo (RED recall and zero dosing advice); the rest are measured in a small pilot.

| Metric | Target | How measured |
| --- | --- | --- |
| RED recall on golden set | 100% | Bob eval run over 120+ labeled synthetic check-ins |
| YELLOW/GREEN accuracy | ≥ 90% vs clinician labels | Same eval set, labels reviewed by a nurse or doctor |
| Dosing or diagnosis in any output | 0 | Red-team prompts in the eval set |
| Citation coverage on Q&A | 100% or abstain | Eval run |
| Check-in time | ≤ 30 seconds median | Usability test with 5 family members |
| Nurse triage time per morning | Cut vs their current method | Time 2 nurses with and without the queue |
| Same-day nurse contact after RED | 100% in pilot | Alert acknowledgement log |
| Missed pickups, months 1 to 3 | Lower than the Puskesmas's own baseline | Pilot cohort vs nurse's historical numbers |

**Who to interview in Jakarta (48 hours)**

- 2 Puskesmas TB nurses or program holders (pemegang program TB)
- 1 community TB companion or kader
- 2 or 3 TB survivors, recruited through a survivor group or the nurse
- 2 family members who were PMOs
- 1 doctor or pharmacist to review the triage table

Interview former patients and families rather than people early in treatment: it's kinder, avoids stigma pressure, and they can describe the whole 6 months.

**Interview script (15 min)**

1. "Ceritakan saat terakhir ada pasien yang berhenti minum obat. Kapan Anda tahu?"
2. "Efek samping apa yang paling sering bikin pasien atau keluarga panik?"
3. "Bagaimana pasien menghubungi Anda di antara jadwal ambil obat?"
4. "Kalau setiap pagi Anda dapat daftar pasien yang berisiko, apa yang akan Anda lakukan duluan?"
5. "Kata-kata apa yang biasa dipakai pasien kalau mau berhenti?" (feeds the stop-intent rules)
6. Show the prototype: "Apa yang Anda percaya dan tidak percaya dari jawaban ini?"
7. "Kalau sistem ini salah, apa akibatnya?"
8. "Dari anggaran mana alat seperti ini bisa dibayar?"

Collect the Puskesmas's own cohort numbers (started, completed, dropped) for the pitch.

## Demo scenario (3 minutes)

The demo follows one family through one bad week, then flips to the nurse and to Bob. All data is synthetic.

1. **Hook (20 s):** "One in ten TB patients on Earth is Indonesian. The drugs are free and they work. People still quit, mostly in the first months, mostly because of side effects and stigma."
2. **GREEN (30 s):** Ibu Rina checks in for her son Dimas, day 18: "kencingnya merah". Reply: common with the drugs, keep going, here's the source.
3. **YELLOW + risk (40 s):** Day 41: "mual terus seminggu, Dimas bilang sudah sembuh, mau berhenti". Triage YELLOW, risk jumps to high because of stop-intent plus a lingering side effect. Ibu Rina sees "jangan berhenti dulu, perawat akan menghubungi besok".
4. **Nurse queue (30 s):** Next morning, nurse console: Dimas is #1 with the reason "mual 7 hari + bilang sudah sembuh" and a suggested call script.
5. **RED (30 s):** Another patient, day 23: "matanya kuning". Instant RED, family told to go today, nurse alert pops up. Show the acknowledge log.
6. **Bob (30 s):** In Bob's "Auditor TB" mode: "Run the golden set." Bob calls `checkin_triage` through MCP and reports 100% RED recall and 0 dosing outputs. Then show it catching a regression after a deliberately bad prompt edit.
7. **Close (20 s):** Pilot numbers from your interviews, the business model, and the ask.

## Build timeline

Planned as 14 days because the deadline isn't confirmed; compress the same order if you have less. Validation runs in parallel with the build, not after it.

| Days | Ciu (dev) | Brother (design) | Done when |
| --- | --- | --- | --- |
| 1 to 2 | Repo, Docker Compose (web, langflow, postgres), confirm Langflow MCP + Bob connection, write specs 1 to 3 | Book interviews, field visit to a Puskesmas, journey map of a family PMO | Bob lists the Langflow tools; 3+ interviews booked |
| 3 to 4 | Corpus ingest flow; draft triage table in code with unit tests | Interviews; collect stop-intent phrases and real side-effect words | Triage rules pass unit tests; phrase list in the repo |
| 5 to 6 | `checkin_triage` flow (extract, rules, risk, explain); golden set v1 (60 cases) | Wireframes: check-in, reply screen, nurse queue | First eval run through Bob |
| 7 to 8 | Next.js family view + API routes; nurse console with queue and alerts | High-fidelity UI, low-literacy copy, neutral app name and icon | End-to-end check-in works on a phone |
| 9 | `ask_guideline` + `nurse_digest`; redaction, consent screen, audit log | Clinician review of triage table and copy | Clinician sign-off notes logged |
| 10 | Golden set v2 (120+ cases incl. red-team); CI gate on RED recall | Usability test with 3 to 5 family members and 1 nurse | RED recall 100%, 0 dosing outputs |
| 11 | Fixes from testing; deploy to VPS | Iterate on screens; Business Model Canvas | Public demo URL |
| 12 | Technical documentation generated with Bob, then edited | Pitch deck, demo storyboard | Docs and deck drafts |
| 13 | Bug bash, seed demo data, backup video | Rehearse pitch, timing | Recorded backup demo |
| 14 | Code freeze, final eval run | Final deck | Submitted |

## Spec-driven development handoff

Ten specs cover the MVP; write P0 specs first and treat their acceptance criteria as tests. A layout that works with Kiro, Claude or Bob: `specs/<id>-<name>/requirements.md`, `design.md`, `tasks.md`.

| ID | Spec | Key acceptance criteria | Priority |
| --- | --- | --- | --- |
| S01 | Patient onboarding | Nurse creates a patient with code, start date, phase, pickup interval; consent recorded before first check-in; no name field | P0 |
| S02 | Daily check-in | Dose status + chips + optional text or voice; submits in ≤ 3 taps; works offline and syncs later | P0 |
| S03 | Symptom extraction | LLM returns schema-valid JSON or the request fails to YELLOW; unknown symptoms flagged, never dropped | P0 |
| S04 | Triage rules | Deterministic table; highest level wins; any red-flag keyword → RED; 100% unit test coverage on the table | P0 |
| S05 | Dropout risk score | Points are transparent and returned with reasons; same input always gives the same score | P0 |
| S06 | Family reply | Plain Bahasa, ≤ 60 words, one action, a citation, Puskesmas contact; never "aman", no dosing | P0 |
| S07 | Nurse queue and alerts | Ranked by risk then recency; RED appears in ≤ 5 s; acknowledge is logged with actor and time | P0 |
| S08 | Guideline Q&A | Answers only with a corpus citation, otherwise abstains with the Puskesmas contact | P1 |
| S09 | Pickup planner | Countdown from pickup interval; nudge 2 days before; missed pickup raises risk score | P1 |
| S10 | Eval harness via Bob | Golden set runs through MCP; reports RED recall, accuracy, dosing violations, citation coverage; CI fails if RED recall < 100% | P0 |

Cross-cutting requirements to put in every spec's design file: redaction before LLM calls, audit logging, neutral wording (no "TB" in notifications), and Bahasa Indonesia copy.

## Risks and open questions

The biggest risk is clinical credibility: without a clinician reviewing the triage table, judges will discount the whole thing.

| Risk | Likelihood | Fallback |
| --- | --- | --- |
| No clinician reviewer in time | Medium | Ask a BINUS or campus clinic doctor, or a pharmacist; at minimum show the table was checked against a published guideline and label it "draft" |
| Can't reach Puskesmas TB staff | Medium | Interview community TB companions and survivors; use public program data |
| Judges see "another TB app" | High | Open with the UGM finding and say why this isn't a reminder app |
| Langflow MCP + Bob config fails | Low to medium | Test on Day 1; fall back to Langflow's stdio MCP proxy |
| LLM extraction misses Indonesian slang | Medium | Phrase list from interviews in the extraction prompt; unknown words default to YELLOW |

**Open questions**

- [ ] What is the actual submission deadline? (timeline assumes 14 days)
- [ ] Which Jakarta Puskesmas will let you observe a TB pickup day?
- [ ] Who reviews the triage table (doctor, pharmacist, or TB nurse)?
- [ ] Does the national TB guideline split side effects exactly like the draft table? Get the current PNPK or Kemenkes TB technical guide and replace the Alomedika reference.
- [ ] What cohort numbers can the Puskesmas share (started, completed, dropped)?
- [ ] Is a per-Puskesmas subscription realistic, or does money flow through Dinkes or grants?

**Caveats**

- The 37.5% non-completion figure is self-reported survey data, not the program's dropout rate.
- The 84% success rate is one province's figure from a radio interview, not national data.
- Drug-supply reassurance comes from 2025 to 2026 statements; resistant-TB drug supply remains a separate risk.
- Scores are honest estimates, not judge predictions.

## Sources

- [Dinkes Sulsel on TB treatment success and dropout causes, RRI Makassar (Apr 2026)](https://rri.co.id/makassar/kesehatan/2323884/dinkes-sulsel-ingatkan-pasien-tbc-tuntaskan-pengobatan-selama-enam-bulan)
- ["Sembuh yang semu" bagi pasien TBC, BKPK Kemenkes (SKI 2023)](https://www.badankebijakan.kemkes.go.id/?p=11915)
- [Indonesia's 2025 TB targets, Perpres 79/2025 via Databoks](https://databoks.katadata.co.id/en/consumer-services/statistics/68dcefefe5891/4-indonesian-government-targets-for-the-tb-eradication-program-by-2025)
- [TPT, TSR and CNR of TB in Indonesia 2021 to 2023, Unair journal](https://e-journal.unair.ac.id/MGK/article/download/76674/34706/462754)
- [WHO TB country profile: Indonesia](https://www.aidsdatahub.org/sites/default/files/resource/indonesia-tb-profile.pdf)
- [Obat TBC cukup sampai Februari 2026, Kontan](https://nasional.kontan.co.id/news/obat-tbc-cukup-sampai-februari-2026-pengamatpendanaan-bersandar-dari-internasional)
- [Dinkes Samarinda: stok obat TBC aman, RRI (Aug 2026)](https://rri.co.id/samarinda/kesehatan/2625588/dinkes-samarinda-pastikan-stok-obat-tbc-dan-hiv-aman-tersedia)
- [Education and reminder app study in two Puskesmas, UGM](https://journal.ugm.ac.id/jmpf/article/download/88408/pdf)
- [SMART-TB adherence app](https://www.ejournal.unma.ac.id/index.php/bernas/article/download/17802/8183/76906)
- [KANG TB app for PMOs, Pekalongan](https://ejurnal.ung.ac.id/index.php/jjhsr/article/view/20786)
- [JAMU TB, Pontianak innovation proposal](https://litbang.pontianak.go.id/file/bappelitbang/1728869559.docx)
- [Video Observed Therapy study](https://journal.universitaspahlawan.ac.id/index.php/ners/article/download/44607/28452/154384)
- [MyTBCompanion, PLoS ONE (in press)](https://eprints.whiterose.ac.uk/223515)
- [Menilik program TBC di Puskesmas, Unair ITD](https://itd.unair.ac.id/wp/?p=829)
- [Konsorsium Komunitas Penabulu-STPI program scope](https://penabulufoundation.org/?p=11336)
- [Menangani efek samping terapi tuberkulosis, Alomedika](https://alomedika.com/menangani-efek-samping-terapi-tuberkulosis)
