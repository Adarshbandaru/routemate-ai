"""Tests for Experiment 011: Multi-Rider Capacity Pooling under Dynamic Congestion."""

import unittest
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile

from routemate.congestion import BPRCongestionModel, TimeDependentRouter
from routemate.geometry import Coordinate, haversine_km
from routemate.hybrid_pruning import generate_stress_instances
from routemate.models import Journey, Vehicle
from routemate.multi_rider_pooling import (
    StopNode,
    MultiRiderRouteResult,
    validate_stop_sequence,
    generate_valid_stop_sequences,
    evaluate_stop_sequence_dynamic,
    solve_multi_rider_exact,
    solve_multi_rider_greedy_insertion,
    is_multi_rider_subset_admissible,
    run_experiment_011,
    save_experiment_011_outputs,
)
from routemate.routing import create_osm_sf_downtown_network


class TestExperiment011MultiRiderPooling(unittest.TestCase):
    """Validation suite for Experiment 011 multi-rider pooling under congestion."""

    def setUp(self):
        self.network = create_osm_sf_downtown_network()
        self.bpr_model = BPRCongestionModel(scenario="no_congestion")
        self.td_router = TimeDependentRouter(self.network, self.bpr_model)
        self.departure_time = datetime(2026, 10, 8, 8, 30, tzinfo=timezone.utc)

        self.thresholds = {
            "pickup_km": 1.5,
            "dest_km": 1.5,
            "detour_km": 5.0,
            "detour_time_s": 1000.0,
            "time_diff_min": 15.0,
        }

        # Generate realistic, reachable drivers and riders from the road network
        drvs, rids = generate_stress_instances(self.network, num_drivers=2, num_riders=4, seed=42)
        self.driver = drvs[0]
        self.rider_a = rids[0]
        self.rider_b = rids[1]

    def test_zero_rider_edge_case(self):
        """Zero riders assigned to a driver returns empty/trivial result."""
        res_exact, nodes, timed_out = solve_multi_rider_exact(
            self.driver,
            (),
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
        )
        self.assertIsNone(res_exact)
        self.assertEqual(nodes, 0)
        self.assertFalse(timed_out)

        res_greedy = solve_multi_rider_greedy_insertion(
            self.driver,
            (),
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
        )
        self.assertTrue(res_greedy.is_valid_sequence)
        self.assertEqual(len(res_greedy.rider_ids), 0)
        self.assertEqual(res_greedy.driver_detour_km, 0.0)

    def test_precedence_constraint_enforcement(self):
        """Dropoff cannot occur before pickup for any rider."""
        p_a = StopNode("rdr_A", "pickup", self.rider_a.start, seats=1)
        d_a = StopNode("rdr_A", "dropoff", self.rider_a.destination, seats=1)

        # Invalid sequence: dropoff before pickup
        invalid_seq = (d_a, p_a)
        self.assertFalse(validate_stop_sequence(invalid_seq, capacity=2))

        # Valid sequence: pickup before dropoff
        valid_seq = (p_a, d_a)
        self.assertTrue(validate_stop_sequence(valid_seq, capacity=2))

        # Evaluator marks valid sequence with is_valid_sequence = True
        res_valid = evaluate_stop_sequence_dynamic(
            self.driver,
            valid_seq,
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
        )
        self.assertTrue(res_valid.is_valid_sequence)

    def test_capacity_constraint_enforcement(self):
        """Intermediate vehicle load cannot exceed vehicle capacity."""
        p_a = StopNode("rdr_A", "pickup", self.rider_a.start, seats=1)
        d_a = StopNode("rdr_A", "dropoff", self.rider_a.destination, seats=1)
        p_b = StopNode("rdr_B", "pickup", self.rider_b.start, seats=1)
        d_b = StopNode("rdr_B", "dropoff", self.rider_b.destination, seats=1)

        # Concurrent pickups: (P_A, P_B, D_A, D_B)
        concurrent_seq = (p_a, p_b, d_a, d_b)
        
        # When capacity=1, concurrent pickups are invalid
        self.assertFalse(validate_stop_sequence(concurrent_seq, capacity=1))

        # When capacity=2, concurrent pickups are valid
        self.assertTrue(validate_stop_sequence(concurrent_seq, capacity=2))

        res_cap2 = evaluate_stop_sequence_dynamic(
            self.driver,
            concurrent_seq,
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
        )
        self.assertTrue(res_cap2.is_valid_sequence)
        self.assertEqual(res_cap2.max_vehicle_load, 2)

    def test_stop_sequence_generator_combinatorics(self):
        """Valid stop sequences obey theoretical combinatorial limits."""
        # For 2 riders with capacity 2: 6 precedence permutations
        seqs_2_cap2 = generate_valid_stop_sequences([self.rider_a, self.rider_b], capacity=2)
        self.assertEqual(len(seqs_2_cap2), 6)

        # For 2 riders with capacity 1: only (P_a, D_a, P_b, D_b) and (P_b, D_b, P_a, D_a) = 2
        seqs_2_cap1 = generate_valid_stop_sequences([self.rider_a, self.rider_b], capacity=1)
        self.assertEqual(len(seqs_2_cap1), 2)

        # All generated sequences must pass validation
        for seq in seqs_2_cap2:
            self.assertTrue(validate_stop_sequence(seq, capacity=2))

    def test_exact_vs_greedy_agreement_on_single_rider(self):
        """For a single rider, greedy insertion and exact solver find identical sequences."""
        res_exact, _, _ = solve_multi_rider_exact(
            self.driver,
            [self.rider_a],
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
        )
        res_greedy = solve_multi_rider_greedy_insertion(
            self.driver,
            [self.rider_a],
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
        )
        self.assertIsNotNone(res_exact)
        self.assertEqual(res_exact.stop_sequence_names, res_greedy.stop_sequence_names)
        self.assertAlmostEqual(res_exact.total_distance_km, res_greedy.total_distance_km, places=4)
        self.assertAlmostEqual(res_exact.objective_score, res_greedy.objective_score, places=4)

    def test_exact_solver_timeout_behavior(self):
        """Exact solver exposes status='timeout', proven_objective=None, and timed_out=True."""
        # Setting timeout_seconds to 0.0 forces an immediate timeout
        res = solve_multi_rider_exact(
            self.driver,
            [self.rider_a, self.rider_b],
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
            timeout_seconds=0.0,
        )
        self.assertTrue(res.timed_out)
        self.assertEqual(res.status, "timeout")
        self.assertNotEqual(res.status, "optimal")
        self.assertIsNone(res.proven_objective)
        self.assertGreaterEqual(res.nodes_explored, 0)
        self.assertGreaterEqual(res.elapsed_time_ms, 0.0)

    def test_timeout_cannot_produce_zero_optimality_gap(self):
        """Timeout must report exact_objective=None, optimality_gap=None, NEVER 0.0%."""
        res_exact = solve_multi_rider_exact(
            self.driver,
            [self.rider_a, self.rider_b],
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
            timeout_seconds=0.0,
        )
        res_greedy = solve_multi_rider_greedy_insertion(
            self.driver,
            [self.rider_a, self.rider_b],
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
        )

        # Simulation of reporting logic:
        if res_exact.timed_out:
            reported_status = "timeout"
            reported_exact_obj = res_exact.proven_objective
            reported_gap = None
        else:
            reported_status = "optimal"
            reported_exact_obj = res_exact.proven_objective
            reported_gap = 0.0

        self.assertEqual(reported_status, "timeout")
        self.assertIsNone(reported_exact_obj)
        self.assertIsNone(reported_gap)
        self.assertNotEqual(reported_gap, 0.0)
        self.assertGreaterEqual(res_greedy.objective_score, 0.0)

    def test_exact_solver_proven_optimality(self):
        """When search finishes within time limit, status is 'optimal' and proven_objective is positive."""
        res = solve_multi_rider_exact(
            self.driver,
            [self.rider_a],
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=self.thresholds,
            timeout_seconds=5.0,
        )
        self.assertFalse(res.timed_out)
        self.assertEqual(res.status, "optimal")
        self.assertIsNotNone(res.proven_objective)
        self.assertGreater(res.proven_objective, 0.0)
        self.assertEqual(res.best_known_objective, res.proven_objective)
        self.assertGreater(res.nodes_explored, 0)

    def test_congestion_dependent_travel_time_delay(self):
        """Severe congestion increases travel times and detours monotonically."""
        cong_model = BPRCongestionModel(scenario="severe_congestion")
        cong_router = TimeDependentRouter(self.network, cong_model)
        lenient_thresholds = {**self.thresholds, "detour_time_s": 3600.0}

        res_free, _, _ = solve_multi_rider_exact(
            self.driver,
            [self.rider_a],
            self.departure_time,
            self.td_router,
            capacity=2,
            thresholds=lenient_thresholds,
        )
        res_severe, _, _ = solve_multi_rider_exact(
            self.driver,
            [self.rider_a],
            self.departure_time,
            cong_router,
            capacity=2,
            thresholds=lenient_thresholds,
        )
        self.assertIsNotNone(res_free)
        self.assertIsNotNone(res_severe)
        self.assertGreater(res_severe.total_duration_seconds, res_free.total_duration_seconds)
        self.assertGreater(res_severe.driver_detour_seconds, res_free.driver_detour_seconds)

    def test_admissible_multi_rider_pruning_zero_false_negatives(self):
        """Multi-rider admissible lower-bound pruning produces zero false negatives."""
        drvs, rids = generate_stress_instances(self.network, num_drivers=3, num_riders=4, seed=42)
        
        drv = drvs[0]
        direct_res = self.td_router.route_time_dependent(drv.start, drv.destination, self.departure_time)
        direct_road_km = direct_res.distance_km

        for r1, r2 in [(rids[0], rids[1]), (rids[1], rids[2]), (rids[2], rids[3])]:
            is_safe = is_multi_rider_subset_admissible(
                drv,
                [r1, r2],
                direct_road_km,
                self.thresholds,
            )
            
            # Ground truth feasibility via exact search
            gt_res, _, _ = solve_multi_rider_exact(
                drv,
                [r1, r2],
                self.departure_time,
                self.td_router,
                capacity=2,
                thresholds=self.thresholds,
            )
            
            if gt_res is not None and gt_res.is_feasible:
                self.assertTrue(
                    is_safe,
                    f"Admissibility violation: subset ({r1.journey_id}, {r2.journey_id}) was feasible "
                    f"with detour {gt_res.driver_detour_km:.2f}km, but lower bound pruned it!"
                )

    def test_full_experiment_011_execution_and_persistence(self):
        """Experiment 011 benchmark runs deterministically and saves required outputs."""
        report = run_experiment_011(seed=42)
        self.assertIn("San Francisco Downtown", report.study_area)
        self.assertIn("capacity_1", report.capacity_results)
        self.assertIn("capacity_4", report.capacity_results)

        # Capacity monotonicity: capacity 4 matches at least as many riders as capacity 1
        c1 = report.capacity_results["capacity_1"]
        c4 = report.capacity_results["capacity_4"]
        self.assertGreaterEqual(c4.matched_riders_count, c1.matched_riders_count)

        # Pruning safety: 0 false negatives
        self.assertEqual(report.pruning_metrics.false_negatives, 0)
        self.assertEqual(report.pruning_metrics.feasible_recall, 1.0)

        # Persistence test in temporary directory
        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = Path(tmpdir)
            res_p, met_p, man_p = save_experiment_011_outputs(report, out_dir)
            self.assertTrue(res_p.exists())
            self.assertTrue(met_p.exists())
            self.assertTrue(man_p.exists())

            with open(res_p, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.assertIn("capacity_results", data)
                self.assertIn("stop_order_shift_rate", data)


if __name__ == "__main__":
    unittest.main()
