"""Unit tests for Experiment 010: Dynamic Congestion Curves & Peak-Hour Time-Window Robustness."""
from datetime import datetime, timezone
import tempfile
import unittest
from pathlib import Path

from routemate.congestion import (
    BPRCongestionModel,
    BPRParameters,
    TimeDependentRouter,
)
from routemate.dynamic_congestion import (
    evaluate_congestion_scenario,
    evaluate_dynamic_pruning,
    evaluate_time_window_sensitivity,
    run_experiment_010,
    save_experiment_010_outputs,
)
from routemate.hybrid_pruning import generate_stress_instances
from routemate.routing import (
    NetworkGraphRouter,
    RoadNetwork,
    RouteNotFoundError,
    RouteQuery,
    create_osm_sf_downtown_network,
)


class TestExperiment010(unittest.TestCase):
    def setUp(self):
        self.network = create_osm_sf_downtown_network()
        self.static_router = NetworkGraphRouter(self.network, weight="duration")
        self.base_time = datetime(2026, 10, 8, 8, 30, tzinfo=timezone.utc)
        self.thresholds = {
            "pickup_km": 0.8,
            "dest_km": 1.0,
            "detour_km": 1.2,
            "detour_time_s": 240.0,
            "time_diff_min": 15.0,
        }

    def test_static_equivalence_when_congestion_zero(self):
        # BPR model with zero congestion multiplier
        model_zero = BPRCongestionModel(params=BPRParameters(alpha=0.0), scenario="no_congestion")
        dyn_router = TimeDependentRouter(self.network, model_zero)

        origin = self.network.nodes["market_4th"]
        dest = self.network.nodes["market_beale"]

        # Static route result
        static_res = self.static_router.route(RouteQuery(origin, dest))
        # Dynamic route result with alpha = 0
        dyn_res = dyn_router.route_time_dependent(origin, dest, self.base_time)

        self.assertAlmostEqual(static_res.distance_km, dyn_res.distance_km, delta=1e-3)
        self.assertAlmostEqual(static_res.duration_seconds, dyn_res.free_flow_duration_seconds, delta=0.5)
        self.assertAlmostEqual(dyn_res.congested_duration_seconds, dyn_res.free_flow_duration_seconds, delta=0.5)
        self.assertEqual(dyn_res.congestion_delay_seconds, 0.0)

    def test_fifo_consistency_arrival_times(self):
        model = BPRCongestionModel(scenario="moderate_congestion")
        dyn_router = TimeDependentRouter(self.network, model)

        origin = self.network.nodes["howard_4th"]
        dest = self.network.nodes["howard_beale"]

        # Depart at 08:00 vs depart at 08:15
        t1 = datetime(2026, 10, 8, 8, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 10, 8, 8, 15, tzinfo=timezone.utc)

        res1 = dyn_router.route_time_dependent(origin, dest, t1)
        res2 = dyn_router.route_time_dependent(origin, dest, t2)

        # FIFO property: earlier departure guarantees arrival is not later than subsequent departure
        self.assertLess(res1.arrival_time, res2.arrival_time)

    def test_directional_peak_asymmetry(self):
        # Morning peak: inbound should experience higher v/c than outbound
        model = BPRCongestionModel(scenario="moderate_congestion")
        inbound_vc = model.get_time_of_day_vc_ratio(self.base_time, direction="inbound")
        outbound_vc = model.get_time_of_day_vc_ratio(self.base_time, direction="outbound")

        self.assertGreater(inbound_vc, outbound_vc)

    def test_congestion_delays_positive(self):
        model = BPRCongestionModel(scenario="moderate_congestion")
        dyn_router = TimeDependentRouter(self.network, model)

        origin = self.network.nodes["howard_4th"]
        dest = self.network.nodes["howard_beale"]

        res = dyn_router.route_time_dependent(origin, dest, self.base_time)
        self.assertGreater(res.congested_duration_seconds, res.free_flow_duration_seconds)
        self.assertGreater(res.congestion_delay_seconds, 0.0)

    def test_disconnected_dock_spur_raises_route_not_found(self):
        model = BPRCongestionModel(scenario="moderate_congestion")
        dyn_router = TimeDependentRouter(self.network, model)

        main_node = self.network.nodes["market_4th"]
        dock_node = self.network.nodes["dock_spur_1"]

        with self.assertRaises(RouteNotFoundError):
            dyn_router.route_time_dependent(main_node, dock_node, self.base_time)

    def test_dynamic_pruning_zero_false_negatives_contract(self):
        # Critical scientific safety invariant:
        # Physical Euclidean distance lower bounds must have exactly 0 false negatives
        drivers, riders = generate_stress_instances(self.network, num_drivers=10, num_riders=15, seed=42)
        prune_eval = evaluate_dynamic_pruning(
            drivers=drivers,
            riders=riders,
            departure_time=self.base_time,
            network=self.network,
            thresholds=self.thresholds,
        )

        self.assertTrue(prune_eval.is_provably_admissible)
        self.assertEqual(prune_eval.false_negatives, 0)
        self.assertEqual(prune_eval.feasible_recall, 1.0)
        self.assertEqual(prune_eval.top1_ranking_agreement_rate, 1.0)
        self.assertGreater(prune_eval.percentage_pruned, 50.0)

    def test_time_window_sensitivity_stability(self):
        drivers, riders = generate_stress_instances(self.network, num_drivers=5, num_riders=10, seed=42)
        sensitivities = evaluate_time_window_sensitivity(
            nominal_departure=self.base_time,
            drivers=drivers,
            riders=riders,
            network=self.network,
            thresholds=self.thresholds,
            offsets=(-10, 0, 10),
        )

        self.assertEqual(len(sensitivities), 3)
        zero_off = next(s for s in sensitivities if s.offset_minutes == 0)
        self.assertEqual(zero_off.feasibility_flip_count, 0)
        self.assertEqual(zero_off.top1_rank_disagreement_rate, 0.0)

    def test_experiment_outputs_persistence(self):
        report = run_experiment_010(network=self.network, seed=42)
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_p = Path(tmp_dir)
            res_p, met_p, man_p = save_experiment_010_outputs(report, out_p)
            self.assertTrue(res_p.exists())
            self.assertTrue(met_p.exists())
            self.assertTrue(man_p.exists())


if __name__ == "__main__":
    unittest.main()
