"""Unit tests for Experiment 007: Multi-Rider Assignment Optimality and Scaling."""
import tempfile
import unittest
from pathlib import Path

from routemate.assignment_scaling import (
    generate_batch_instance,
    run_scale_point,
    run_assignment_scaling_experiment,
    save_experiment_outputs,
)


class Experiment007Tests(unittest.TestCase):
    def test_generate_batch_instance_determinism(self):
        r1, d1 = generate_batch_instance(5, 3, seed=42)
        r2, d2 = generate_batch_instance(5, 3, seed=42)
        self.assertEqual(len(r1), 5)
        self.assertEqual(len(d1), 3)
        self.assertEqual([r.journey_id for r in r1], [r.journey_id for r in r2])
        self.assertEqual([d.journey_id for d in d1], [d.journey_id for d in d2])
        for r in r1:
            self.assertGreaterEqual(r.seats_requested, 1)
        for d in d1:
            self.assertGreaterEqual(d.vehicle.capacity, 2)
            self.assertTrue(d.verification.identity_verified)

    def test_run_scale_point_micro(self):
        pt = run_scale_point("test_micro", 5, 3, seed=42, timeout_seconds=1.0)
        self.assertEqual(pt.scale_name, "test_micro")
        self.assertEqual(pt.num_riders, 5)
        self.assertEqual(pt.num_drivers, 3)
        self.assertEqual(pt.total_pairs, 15)
        self.assertGreaterEqual(pt.feasible_edges, 0)

        # Optimal must be at least as good as greedy and auction
        self.assertGreaterEqual(pt.optimal.objective_value + 1e-6, pt.greedy.objective_value)
        self.assertGreaterEqual(pt.optimal.objective_value + 1e-6, pt.auction.objective_value)
        self.assertEqual(pt.optimal.optimality_gap_pct, 0.0)
        self.assertGreaterEqual(pt.greedy.optimality_gap_pct, 0.0)
        self.assertGreaterEqual(pt.optimal.nodes_explored, 1)
        self.assertGreaterEqual(pt.optimal.solve_time_ms, 0.0)

    def test_run_scale_point_small(self):
        pt = run_scale_point("test_small", 10, 5, seed=101, timeout_seconds=2.0)
        self.assertEqual(pt.num_riders, 10)
        self.assertEqual(pt.num_drivers, 5)
        self.assertGreater(pt.optimal.nodes_explored, 1)
        self.assertGreaterEqual(pt.optimal.objective_value + 1e-6, pt.greedy.objective_value)

    def test_run_scaling_suite_and_save_outputs(self):
        test_scales = (
            ("micro_5x3", 5, 3),
            ("small_10x5", 10, 5),
        )
        report = run_assignment_scaling_experiment(
            scale_configs=test_scales,
            seeds=(42, 101),
            timeout_seconds=2.0,
        )
        self.assertEqual(report.total_evaluations, 4)
        self.assertEqual(len(report.aggregates), 2)
        self.assertGreaterEqual(report.overall_greedy_mean_gap_pct, 0.0)

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_path = Path(tmp_dir)
            saved = save_experiment_outputs(report, out_path)
            self.assertTrue(saved["results_json"].exists())
            self.assertTrue(saved["metrics_csv"].exists())


if __name__ == "__main__":
    unittest.main()
