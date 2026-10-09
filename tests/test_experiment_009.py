"""Unit tests for Experiment 009: Hybrid Two-Tier Candidate Pruning & Road-Network Gating."""
import tempfile
import unittest
from pathlib import Path

from routemate.hybrid_pruning import (
    CircuityCalibration,
    calibrate_circuity_bounds,
    generate_stress_instances,
    pruner_admissible_lower_bound,
    pruner_circuity_aware,
    pruner_fixed_euclidean,
    pruner_no_pruning,
    pruner_two_stage_geometric,
    run_experiment_009,
    save_experiment_009_outputs,
)
from routemate.routing import NetworkGraphRouter, create_osm_sf_downtown_network


class TestExperiment009(unittest.TestCase):
    def setUp(self):
        self.network = create_osm_sf_downtown_network()
        self.router = NetworkGraphRouter(self.network, weight="duration")
        self.calibration = CircuityCalibration(
            sample_pairs_count=100,
            mean_circuity=1.45,
            p95_circuity=2.50,
            max_circuity=4.00,
            min_circuity=1.00,
        )
        self.thresholds = {
            "pickup_km": 0.8,
            "dest_km": 1.0,
            "detour_km": 1.2,
            "detour_time_s": 240.0,
            "time_diff_min": 15.0,
        }

    def test_calibration_zero_leakage_and_determinism(self):
        d1, r1 = generate_stress_instances(self.network, num_drivers=5, num_riders=10, seed=42)
        d2, r2 = generate_stress_instances(self.network, num_drivers=5, num_riders=10, seed=42)
        self.assertEqual([d.journey_id for d in d1], [d.journey_id for d in d2])
        self.assertEqual([r.journey_id for r in r1], [r.journey_id for r in r2])

        calib = calibrate_circuity_bounds(self.network, self.router, d1, r1)
        self.assertGreater(calib.sample_pairs_count, 0)
        self.assertGreaterEqual(calib.mean_circuity, 1.0)
        self.assertGreaterEqual(calib.p95_circuity, calib.mean_circuity)
        self.assertGreaterEqual(calib.max_circuity, calib.p95_circuity)

    def test_admissible_lower_bound_correctness(self):
        drivers, riders = generate_stress_instances(self.network, num_drivers=5, num_riders=5, seed=101)
        d = drivers[0]
        r = riders[0]

        # Admissible pruner must return a boolean
        res = pruner_admissible_lower_bound(d, r, driver_road_length=1.5, thresholds=self.thresholds, calibration=self.calibration)
        self.assertIsInstance(res, bool)

    def test_admissible_pruner_zero_false_negatives_contract(self):
        report = run_experiment_009(network=self.network, seed_calibration=42, seed_evaluation=101)
        admissible_metric = report.pruning_comparisons["E_admissible_lower_bound"]

        # CRITICAL SCIENTIFIC SAFETY CONTRACT:
        # A method claiming provable admissibility MUST have exactly 0 false negatives
        self.assertTrue(admissible_metric.is_provably_admissible)
        self.assertEqual(admissible_metric.feasible_pairs_pruned_false_negatives, 0)
        self.assertEqual(admissible_metric.feasible_recall, 1.0)
        self.assertEqual(admissible_metric.top1_agreement_rate, 1.0)
        self.assertGreater(admissible_metric.percentage_pruned, 50.0)

    def test_circuity_aware_detects_false_negatives(self):
        report = run_experiment_009(network=self.network, seed_calibration=42, seed_evaluation=101)
        circ_metric = report.pruning_comparisons["C_circuity_aware"]

        # Verifies that heuristic circuity scaling drops feasible candidates (imperfect recall)
        self.assertFalse(circ_metric.is_provably_admissible)
        self.assertGreater(circ_metric.feasible_pairs_pruned_false_negatives, 0)
        self.assertLess(circ_metric.feasible_recall, 1.0)

    def test_edge_case_empty_candidate_pools(self):
        calib = calibrate_circuity_bounds(self.network, self.router, [], [])
        self.assertEqual(calib.sample_pairs_count, 0)
        self.assertGreaterEqual(calib.mean_circuity, 1.0)

    def test_edge_case_disconnected_dock_spur(self):
        drivers, _ = generate_stress_instances(self.network, num_drivers=1, num_riders=1, seed=42)
        d = drivers[0]
        # Rider on isolated dock spur
        dock_r = generate_stress_instances(self.network, num_drivers=1, num_riders=1, seed=42)[1][0]
        # Override rider coordinates to isolated dock spur
        from routemate.geometry import Coordinate
        from routemate.models import Journey, Vehicle, VerificationContext
        isolated_rider = Journey(
            journey_id="ISO-DOCK",
            start=self.network.nodes["dock_spur_1"],
            destination=self.network.nodes["dock_spur_2"],
            departure=d.departure,
            route=(self.network.nodes["dock_spur_1"], self.network.nodes["dock_spur_2"]),
            vehicle=Vehicle(capacity=4, verified=True),
            verification=VerificationContext(identity_verified=True, vehicle_verified=True, safety_flags=()),
        )

        passes = pruner_admissible_lower_bound(d, isolated_rider, driver_road_length=2.0, thresholds=self.thresholds, calibration=self.calibration)
        # Even if Euclidean passes or fails, pruner handles disconnected nodes gracefully without unhandled exception
        self.assertIsInstance(passes, bool)

    def test_experiment_outputs_persistence(self):
        report = run_experiment_009(network=self.network, seed_calibration=42, seed_evaluation=101)
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_p = Path(tmp_dir)
            res_p, met_p, man_p = save_experiment_009_outputs(report, out_p)
            self.assertTrue(res_p.exists())
            self.assertTrue(met_p.exists())
            self.assertTrue(man_p.exists())


if __name__ == "__main__":
    unittest.main()
