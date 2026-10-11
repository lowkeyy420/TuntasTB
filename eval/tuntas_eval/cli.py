"""Command line: ``python eval/run_eval.py --mode offline|live``."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Any

from . import baseline as baseline_mod
from . import forbidden as fb
from . import golden, local_rules, paths, report, scoring, templates


def offline_results(cases: list[dict[str, Any]], rules: local_rules.Rules,
                    tmpl: list[dict[str, str]]) -> list[dict[str, Any]]:
    results = []
    for case in cases:
        r = local_rules.evaluate_case(case, rules)
        reply = templates.compose_offline_reply(
            r["actual"], tmpl, no_symptom=r["no_symptom"], dose_missed=case["input"]["dose_status"] != "yes",
            stop_intent="stop_intent" in r["mood_flags"])
        r["reply"] = reply
        r["violations"] = [
            {"source": f"{case['id']}:reply", "reason": "must_not_contain", "match": p, "text": reply}
            for p in fb.must_not_contain_hits(reply, case["expected"].get("must_not_contain", []))
        ]
        problems = scoring.expectation_problems(case, r["mood_flags"], r["risk"]["band"],
                                                detectable=("stop_intent", "stigma"))
        if case["category"] == "redaction" and r["redacted_level"] != r["raw_level"]:
            problems.append(f"redaction changed the level ({r['raw_level']} -> {r['redacted_level']})")
        r["problems"] = problems
        results.append(r)
    return results


def build_report(*, mode: str, transport: str, transport_note: str | None, rules: local_rules.Rules,
                 cases: list[dict[str, Any]], results: list[dict[str, Any]], template_scan: dict[str, Any],
                 templates_scanned: int, questions: list[dict[str, Any]] | None, baseline: dict[str, Any] | None,
                 question_count: int = 0) -> dict[str, Any]:
    metrics = scoring.level_metrics(results)
    violations = list(template_scan["violations"])
    neutral = list(template_scan["neutral_wording"])
    for r in results:
        violations += r.get("violations", [])
        if r.get("neutral_wording"):
            neutral.append({"source": f"{r['id']}:family_message", "terms": r["neutral_wording"], "text": r["family_message"]})
    for q in questions or []:
        violations += q["violations"]
        if q.get("neutral_wording"):
            neutral.append({"source": f"{q['id']}:answer", "terms": q["neutral_wording"], "text": q["answer"]})
    counts = scoring.count_violations(violations)
    regs = scoring.regressions(results, baseline)
    code = scoring.exit_code(metrics, counts, regs)

    live = mode == "live"
    called = [r for r in results if r.get("flow_called")]
    generated = [r for r in results if r.get("family_message")]
    reasons = []
    if metrics["red_recall"] is None or metrics["red_recall"] < 1.0:
        reasons.append(f"RED recall {scoring.pct(metrics['red_recall'])}")
    for k in scoring.GATING_VIOLATIONS:
        if counts[k]:
            reasons.append(f"{counts[k]} {k} violation(s)")
    if regs["red"]:
        reasons.append(f"{len(regs['red'])} RED regression(s): {', '.join(r['id'] for r in regs['red'])}")

    meta = report.run_meta(mode, transport, rules.version)
    meta.update({"transport_note": transport_note, "golden_cases": len(cases),
                 "reviewed_cases": golden.reviewed_count(cases), "questions": question_count})
    red_hit = metrics["red_cases"] - len(metrics["red_missed"])
    return {
        "meta": meta,
        "gate": {"exit_code": code, "passed": code == 0, "reasons": reasons},
        "metrics": {
            "red_recall": metrics["red_recall"],
            "red_hit": red_hit,
            "red_cases": metrics["red_cases"],
            "yellow_precision": metrics["yellow_precision"],
            "yellow_green_accuracy": metrics["yellow_green_accuracy"],
            "accuracy_warning": metrics["accuracy_warning"],
            "dosing_violations": counts["dosing"],
            "diagnosis_violations": counts["diagnosis"],
            "reassurance_violations": counts["reassurance"],
            "must_not_contain_violations": counts["must_not_contain"],
            "citation_coverage": (scoring.ratio(sum(1 for q in questions if q["covered"]), len(questions))
                                  if live and questions else None),
            "family_citation_rate": (scoring.ratio(sum(1 for r in generated if r["family_cited"]), len(generated))
                                     if live else None),
            "family_messages_generated": len(generated) if live else None,
            "fallback_rate": scoring.ratio(sum(1 for r in called if r["fallback"] or r.get("model_failed")),
                                           len(called)) if live else None,
            "invalid_output_rate": scoring.ratio(sum(1 for r in called if r["fallback"]), len(called)) if live else None,
            "model_failure_rate": scoring.ratio(sum(1 for r in called if r.get("model_failed")), len(called))
            if live else None,
            "flow_calls": len(called) if live else None,
            "templates_scanned": templates_scanned,
            "neutral_wording_findings": len(neutral),
            "confusion": metrics["confusion"],
        },
        "red_missed": metrics["red_missed"],
        "violations": violations,
        "neutral_wording": neutral,
        "regressions": regs,
        "failing_cases": scoring.case_failures(results),
        "questions": questions or [],
        "results": results,
    }


def _print_summary(rep: dict[str, Any], out: Any) -> None:
    m = rep["metrics"]
    print(f"Mode: {rep['meta']['mode']}  transport: {rep['meta']['transport']}"
          + (f"  ({rep['meta']['transport_note']})" if rep["meta"].get("transport_note") else ""), file=out)
    print(f"RED recall: {scoring.pct(m['red_recall'])} ({m['red_hit']}/{m['red_cases']})", file=out)
    print(f"YELLOW precision: {scoring.pct(m['yellow_precision'])}", file=out)
    print(f"YELLOW/GREEN accuracy: {scoring.pct(m['yellow_green_accuracy'])}"
          + ("  WARNING: below the 90% target" if m["accuracy_warning"] else ""), file=out)
    total = sum(m[k] for k in ("dosing_violations", "diagnosis_violations", "reassurance_violations",
                               "must_not_contain_violations"))
    print(f"Violations: {total} (dosing {m['dosing_violations']}, diagnosis {m['diagnosis_violations']}, "
          f"aman {m['reassurance_violations']}, must_not_contain {m['must_not_contain_violations']})", file=out)
    if rep["meta"]["mode"] == "live":
        print(f"Citation coverage (Q&A): {scoring.pct(m['citation_coverage'])}  "
              f"family citation rate: {scoring.pct(m['family_citation_rate'])} "
              f"({m['family_messages_generated']} generated)  fallback rate: {scoring.pct(m['fallback_rate'])} "
              f"(invalid output {scoring.pct(m['invalid_output_rate'])}, model failed inside the flow "
              f"{scoring.pct(m['model_failure_rate'])})", file=out)
        answered = [q for q in rep["questions"] if q["kind"] == q["expected"]]
        print(f"Questions as expected: {len(answered)}/{len(rep['questions'])} (reported, not gating)", file=out)
    print(f"Clinician-reviewed: {rep['meta']['reviewed_cases']} of {rep['meta']['golden_cases']} cases", file=out)
    for r in rep["red_missed"]:
        print(f"MISSED RED: {r['id']} scored {r['actual']}", file=out)
    for v in rep["violations"]:
        print(f"VIOLATION {v['reason']}: {v['source']}: {v['match']!r} in {v['text']!r}", file=out)
    for r in rep["regressions"]["red"]:
        print(f"RED REGRESSION: {r['id']} was RED, now {r['actual']} (label {r['expected']})", file=out)
    for r in rep["regressions"]["other"]:
        print(f"regression (not gating): {r['id']} was {r['baseline']}, now {r['actual']}", file=out)
    print(f"Failing cases: {len(rep['failing_cases'])}  neutral-wording findings: {m['neutral_wording_findings']}", file=out)
    print(f"Gate: {'PASS' if rep['gate']['passed'] else 'FAIL'} (exit {rep['gate']['exit_code']})"
          + (": " + "; ".join(rep["gate"]["reasons"]) if rep["gate"]["reasons"] else ""), file=out)


def _select(cases: list[dict[str, Any]], ids: list[str] | None, limit: int | None) -> list[dict[str, Any]]:
    if ids:
        wanted = set(ids)
        cases = [c for c in cases if c["id"] in wanted]
    return cases[:limit] if limit else cases


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="run_eval.py", description="TuntasTB golden-set evaluation (S10).")
    p.add_argument("--mode", choices=("offline", "live"), required=True)
    p.add_argument("--transport", choices=("auto", "mcp", "rest"), default="auto", help="live mode only")
    p.add_argument("--limit", type=int, help="evaluate only the first N check-ins and questions")
    p.add_argument("--ids", nargs="+", help="evaluate only these case or question ids")
    p.add_argument("--update-baseline", action="store_true", help="offline mode: write eval/baseline.json")
    p.add_argument("--golden", type=Path, default=golden.CHECKINS_PATH, help=argparse.SUPPRESS)
    p.add_argument("--questions", type=Path, default=golden.QUESTIONS_PATH, help=argparse.SUPPRESS)
    p.add_argument("--baseline", type=Path, default=paths.BASELINE_PATH, help=argparse.SUPPRESS)
    p.add_argument("--reports-dir", type=Path, default=paths.REPORTS_DIR, help=argparse.SUPPRESS)
    p.add_argument("--rules-dir", type=Path, default=paths.RULES_DIR, help=argparse.SUPPRESS)
    p.add_argument("--family-copy", type=Path, default=paths.FAMILY_COPY_PATH, help=argparse.SUPPRESS)
    p.add_argument("--concurrency", type=int, default=4, help="live mode: parallel flow calls (default 4)")
    p.add_argument("--quiet", action="store_true", help="no per-case progress in live mode")
    return p.parse_args(argv)


def main(argv: list[str] | None = None, out: Any = None) -> int:
    out = out or sys.stdout
    args = parse_args(argv)
    try:
        rules = local_rules.Rules(
            paths.read_json(args.rules_dir / "triage-table.json"),
            paths.read_json(args.rules_dir / "lexicon.id.json"),
            paths.read_json(args.rules_dir / "risk-points.json"),
        )
        forbidden = fb.load_forbidden(rules.lexicon)
        cases = golden.load_checkins(args.golden)
        questions = golden.load_questions(args.questions) if args.mode == "live" else []
        tmpl = templates.load_templates(rules.table, args.family_copy)
    except (golden.GoldenError, ValueError, OSError) as e:
        print(f"CONFIG ERROR: {e}", file=out)
        return scoring.EXIT_CONFIG
    cases = _select(cases, args.ids, args.limit)
    questions = _select(questions, args.ids, args.limit)
    tscan = templates.scan_templates(tmpl, forbidden)

    if args.mode == "offline":
        results = offline_results(cases, rules, tmpl)
        base = baseline_mod.load(args.baseline)
        rep = build_report(mode="offline", transport="none (offline)", transport_note=None, rules=rules, cases=cases,
                           results=results, template_scan=tscan, templates_scanned=len(tmpl), questions=None,
                           baseline=base)
    else:
        from . import live

        try:
            cfg = live.load_live_config()
        except live.ConfigError as e:
            print(f"CONFIG ERROR: {e}", file=out)
            return scoring.EXIT_CONFIG
        try:
            rep = asyncio.run(_live(args, cfg, cases, questions, rules, tmpl, forbidden, tscan, out))
        except (live.ConfigError, live.TransportError) as e:
            print(f"CONFIG ERROR: {e}", file=out)
            return scoring.EXIT_CONFIG

    written = report.write_reports(rep, args.reports_dir)
    _print_summary(rep, out)
    latest = written["latest-" + rep["meta"]["mode"]]
    print(f"Report: {latest}", file=out)

    code = rep["gate"]["exit_code"]
    if args.update_baseline:
        if args.mode != "offline":
            print("--update-baseline is offline only; live baselines are not committed", file=out)
            return scoring.EXIT_CONFIG
        if scoring.safety_failed(scoring.level_metrics(rep["results"]), scoring.count_violations(rep["violations"])):
            print("Baseline NOT updated: the safety gate fails", file=out)
            return code
        baseline_mod.save(baseline_mod.build(rep["results"], rules.version), args.baseline)
        print(f"Baseline written: {args.baseline}", file=out)
        return scoring.EXIT_OK
    return code


async def _live(args: argparse.Namespace, cfg: dict[str, Any], cases: list[dict[str, Any]],
                questions: list[dict[str, Any]], rules: local_rules.Rules, tmpl: list[dict[str, str]],
                forbidden: dict[str, list[str]], tscan: dict[str, Any], out: Any) -> dict[str, Any]:
    from . import live

    if not cfg["project_id"]:
        cfg["project_id"] = await live.discover_project_id(cfg["base_url"], cfg["api_key"])
    transport, note = await live.open_transport(args.transport, cfg)
    try:
        progress = (lambda s: None) if args.quiet else (lambda s: print("  " + s, file=out, flush=True))
        res = await live.run_live(cases, questions, rules, transport, tmpl, forbidden, progress,
                                  concurrency=max(1, args.concurrency))
    finally:
        await transport.__aexit__(None, None, None)
    rep = build_report(mode="live", transport=transport.name, transport_note=note, rules=rules, cases=cases,
                       results=res["checkins"], template_scan=tscan, templates_scanned=len(tmpl),
                       questions=res["questions"], baseline=None, question_count=len(questions))
    rep["meta"]["base_url"] = cfg["base_url"]
    rep["meta"]["project_id"] = cfg["project_id"]
    rep["meta"]["concurrency"] = max(1, args.concurrency)
    return rep
