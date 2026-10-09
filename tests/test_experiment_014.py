"""Unit and integration tests for Experiment 014: Research Synthesis & Cross-Experiment Analysis."""

import json
from pathlib import Path
import tempfile
import unittest

from routemate.synthesis import (
    EXPERIMENT_METADATA_REGISTRY,
    ExperimentAuditRecord,
    HypothesisEvaluationRecord,
    SynthesisReport,
    TradeoffAnalysisRecord,
    audit_repository_experiments,
    compile_hypothesis_evaluations,
    compile_tradeoff_analyses,
    compile_threats_to_validity,
    run_experiment_014,
    save_experiment_014_outputs,
)


class TestExperiment014ResearchSynthesis(unittest.TestCase):
    """Validation suite for Experiment 014 synthesis and cross-experiment meta-analysis."""

    def test_audit_covers_all_thirteen_experiments(self) -> None:
        """Audit must comprehensively cover Experiments 001 through 013."""
        records = audit_repository_experiments()
        self.assertEqual(len(records), 13, "Must audit exactly 13 experiments (001-013)")
        
        expected_ids = [f"{i:03d}" for i in range(1, 14)]
        found_ids = [r.experiment_id[:3] for r in records]
        self.assertEqual(found_ids, expected_ids, "All experiments 001-013 must be audited in order")

        for r in records:
            self.assertIsInstance(r, ExperimentAuditRecord)
            self.assertTrue(r.title)
            self.assertTrue(r.evidence_class)
            self.assertTrue(r.benchmark_scope)
            self.assertGreater(len(r.primary_methods), 0)
            self.assertGreater(len(r.primary_metrics), 0)
            self.assertGreater(len(r.key_findings), 0)

    def test_hypothesis_evaluations_mapping(self) -> None:
        """Pre-registered hypotheses and research questions must map to verified statuses."""
        hypotheses = compile_hypothesis_evaluations()
        required_keys = {
            "H1_multi_objective_pooling",
            "H2_uncertainty_and_congestion",
            "H3_compute_quality_frontier",
            "RQ4_fairness_and_equity",
            "RQ5_explanations_and_acceptance",
        }
        self.assertEqual(set(hypotheses.keys()), required_keys)

        # H1: Supported
        h1 = hypotheses["H1_multi_objective_pooling"]
        self.assertEqual(h1.status, "supported")
        self.assertIn("011_multi_rider_pooling", h1.supporting_experiments)
        self.assertIn("013_rolling_dispatch", h1.supporting_experiments)

        # H2: Supported
        h2 = hypotheses["H2_uncertainty_and_congestion"]
        self.assertEqual(h2.status, "supported")
        self.assertIn("010_dynamic_congestion", h2.supporting_experiments)
        self.assertIn("012_dynamic_recourse", h2.supporting_experiments)

        # H3: Supported
        h3 = hypotheses["H3_compute_quality_frontier"]
        self.assertEqual(h3.status, "supported")
        self.assertIn("007_assignment_scaling", h3.supporting_experiments)
        self.assertIn("009_hybrid_pruning", h3.supporting_experiments)

        # RQ4 & RQ5: Partially Supported with clear caveats
        rq4 = hypotheses["RQ4_fairness_and_equity"]
        self.assertEqual(rq4.status, "partially_supported")
        self.assertTrue(rq4.caveats_and_limitations)

        rq5 = hypotheses["RQ5_explanations_and_acceptance"]
        self.assertEqual(rq5.status, "partially_supported")
        self.assertTrue(rq5.caveats_and_limitations)

    def test_tradeoff_analyses_eight_dimensions(self) -> None:
        """Trade-off analyses must cover all eight architectural decision dimensions."""
        tradeoffs = compile_tradeoff_analyses()
        self.assertEqual(len(tradeoffs), 8, "Must analyze exactly eight architectural trade-offs")

        expected_dimensions = [
            "ranking_quality_vs_heuristics",
            "road_network_accuracy_vs_euclidean",
            "routing_latency_vs_expansion",
            "pruning_recall_vs_search_speedup",
            "assignment_optimality_vs_solver_runtime",
            "pooling_capacity_vs_detour_burden",
            "congestion_delay_vs_recourse_adaptation",
            "rolling_dispatch_vs_batch_quantization",
        ]
        for dim in expected_dimensions:
            self.assertIn(dim, tradeoffs)
            t = tradeoffs[dim]
            self.assertIsInstance(t, TradeoffAnalysisRecord)
            self.assertTrue(t.tension)
            self.assertTrue(t.low_cost_regime)
            self.assertTrue(t.high_fidelity_regime)
            self.assertTrue(t.measured_impact)
            self.assertTrue(t.recommended_operating_point)

    def test_threats_to_validity_structure(self) -> None:
        """Threats to validity must categorize construct, internal, external validity and leakage."""
        threats = compile_threats_to_validity()
        self.assertIn("construct_validity", threats)
        self.assertIn("internal_validity", threats)
        self.assertIn("external_validity", threats)
        self.assertIn("reproducibility_and_leakage", threats)
        for cat, items in threats.items():
            self.assertIsInstance(items, list)
            self.assertGreater(len(items), 0)

    def test_full_experiment_014_execution(self) -> None:
        """Experiment 014 runner produces complete SynthesisReport."""
        rep = run_experiment_014()
        self.assertIsInstance(rep, SynthesisReport)
        self.assertEqual(rep.experiments_audited_count, 13)
        self.assertEqual(len(rep.experiments), 13)
        self.assertEqual(len(rep.hypotheses_evaluations), 5)
        self.assertEqual(len(rep.tradeoff_analyses), 8)
        self.assertIn("key_system_breakthroughs", rep.conclusions_summary)
        self.assertEqual(len(rep.conclusions_summary["key_system_breakthroughs"]), 5)

    def test_save_experiment_014_outputs(self) -> None:
        """Artifact saving correctly serializes JSON, CSV, and manifest outputs."""
        rep = run_experiment_014()
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_dir = Path(tmp_dir)
            results_p, metrics_p, manifest_p, table_p = save_experiment_014_outputs(rep, output_dir=out_dir)

            self.assertTrue(results_p.exists())
            self.assertTrue(metrics_p.exists())
            self.assertTrue(manifest_p.exists())
            self.assertTrue(table_p.exists())

            # Check results.json
            with open(results_p, "r", encoding="utf-8") as f:
                res_data = json.load(f)
            self.assertEqual(res_data["experiments_audited_count"], 13)
            self.assertIn("001_baseline", res_data["experiments"])
            self.assertIn("013_rolling_dispatch", res_data["experiments"])

            # Check manifest.json
            with open(manifest_p, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
            self.assertEqual(manifest_data["experiment_id"], "014_research_synthesis")
            self.assertEqual(len(manifest_data["artifacts"]), 4)

            # Check CSV row counts
            with open(metrics_p, "r", encoding="utf-8") as f:
                metric_lines = f.readlines()
            self.assertEqual(len(metric_lines), 6)  # header + 5 hypotheses

            with open(table_p, "r", encoding="utf-8") as f:
                table_lines = f.readlines()
            self.assertEqual(len(table_lines), 14)  # header + 13 experiments


if __name__ == "__main__":
    unittest.main()
