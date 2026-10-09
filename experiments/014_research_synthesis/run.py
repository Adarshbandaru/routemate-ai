"""Experiment 014 runner: Research Synthesis & Cross-Experiment Analysis."""

from __future__ import annotations

from pathlib import Path

from routemate.synthesis import (
    DEFAULT_EXPERIMENT_014_OUTPUT_DIR,
    run_experiment_014,
    save_experiment_014_outputs,
)


def print_banner(text: str) -> None:
    line = "=" * 105
    print(f"\n{line}\n{text}\n{line}")


def main() -> None:
    print_banner("EXPERIMENT 014: Research Synthesis & Cross-Experiment Meta-Analysis")
    print("Auditing and synthesizing Experiments 001 through 013 across 8 architectural dimensions...\n")

    report = run_experiment_014()

    print(f"Total Experiments Audited: {report.experiments_audited_count} (001 - 013)")
    print(f"Synthesis Timestamp: {report.created_at_utc}")

    # 1. Cross-Experiment Comparison Matrix
    print("\n" + "-" * 135)
    print("1. CROSS-EXPERIMENT ARCHITECTURAL & EMPIRICAL SYNTHESIS MATRIX (001 - 013)")
    print("-" * 135)
    headers = [
        "Experiment",
        "Title",
        "Evidence Class",
        "Scope / Setting",
        "Key Verified Outcome",
    ]
    fmt = "{:<12} | {:<32} | {:<28} | {:<25} | {:<30}"
    print(fmt.format(*headers))
    print("-" * 135)

    for exp_id, exp_rec in report.experiments.items():
        outcome = exp_rec.key_findings[0] if exp_rec.key_findings else "Audited successfully"
        print(
            fmt.format(
                exp_id,
                exp_rec.title[:32],
                exp_rec.evidence_class[:28],
                exp_rec.benchmark_scope[:25],
                outcome[:30],
            )
        )
    print("-" * 135)

    # 2. Hypothesis Verification Summary
    print("\n" + "-" * 115)
    print("2. PRE-REGISTERED HYPOTHESES & RESEARCH QUESTIONS VERIFICATION STATUS")
    print("-" * 115)
    h_headers = ["ID", "Research Question", "Status", "Supporting Experiments", "Key Empirical Evidence"]
    h_fmt = "{:<5} | {:<22} | {:<18} | {:<22} | {:<40}"
    print(h_fmt.format(*h_headers))
    print("-" * 115)

    for h_id, h_data in report.hypotheses_evaluations.items():
        exps_str = ", ".join(h_data.supporting_experiments)
        ev_brief = h_data.empirical_evidence[:40]
        status_str = f"[{h_data.status.upper()}]"
        print(h_fmt.format(h_data.hypothesis_id, h_data.research_question[:22], status_str, exps_str[:22], ev_brief))
    print("-" * 115)

    # 3. Eight-Dimensional Architectural Trade-off Summary
    print("\n" + "-" * 125)
    print("3. EIGHT-DIMENSIONAL ARCHITECTURAL TRADE-OFF SUMMARY")
    print("-" * 125)
    t_headers = ["Dimension", "Low-Cost Baseline", "High-Fidelity Regime", "Measured Trade-off Impact"]
    t_fmt = "{:<32} | {:<28} | {:<28} | {:<30}"
    print(t_fmt.format(*t_headers))
    print("-" * 125)

    for dim_key, t_rec in report.tradeoff_analyses.items():
        print(
            t_fmt.format(
                t_rec.dimension_name[:32],
                t_rec.low_cost_regime[:28],
                t_rec.high_fidelity_regime[:28],
                t_rec.measured_impact[:30],
            )
        )
    print("-" * 125)

    # 4. Save artifacts
    res_p, met_p, man_p, tbl_p = save_experiment_014_outputs(report)
    print("\nSaved Experiment 014 synthesis artifacts:")
    print(f"  - results:         {res_p}")
    print(f"  - metrics:         {met_p}")
    print(f"  - manifest:        {man_p}")
    print(f"  - synthesis_table: {tbl_p}")


if __name__ == "__main__":
    main()
