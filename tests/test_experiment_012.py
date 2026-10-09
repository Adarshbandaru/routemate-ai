"""Unit and integration tests for Experiment 012: Dynamic Curbside Dwell, Incident Congestion, and Online Recourse."""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import random
import tempfile
import unittest

from routemate.congestion import BPRCongestionModel, TimeDependentRouter
from routemate.geometry import Coordinate
from routemate.hybrid_pruning import generate_stress_instances
from routemate.models import Journey, Vehicle, VerificationContext
from routemate.multi_rider_pooling import (
    MultiRiderRouteResult,
    StopNode,
    solve_multi_rider_greedy_insertion,
)
from routemate.recourse import (
    Experiment012Report,
    IncidentAwareRouter,
    IncidentEvent,
    RecourseTripEvaluation,
    StochasticDwellModel,
    build_incident_scenarios,
    evaluate_trip_recourse,
    run_experiment_012,
    save_experiment_012_outputs,
)
from routemate.routing import RouteNotFoundError, create_osm_sf_downtown_network


class TestExperiment012DynamicRecourse(unittest.TestCase):
    """Validation suite for dynamic curbside dwell, incident congestion, and online recourse."""

    def setUp(self) -> None:
        self.network = create_osm_sf_downtown_network()
        self.bpr_model = BPRCongestionModel(scenario="moderate_congestion")
        self.nominal_router = TimeDependentRouter(self.network, self.bpr_model)
        self.base_time = datetime(2026, 10, 8, 8, 30, tzinfo=timezone.utc)
        self.thresholds = {
            "pickup_km": 1.5,
            "dest_km": 1.5,
            "detour_km": 3.5,
            "detour_time_s": 900.0,
            "time_diff_min": 25.0,
        }

    def test_deterministic_stochastic_seeds(self) -> None:
        """Identical stochastic seeds produce identical dwell sequences; distinct seeds diverge."""
        model_a = StochasticDwellModel(seed=42)
        model_b = StochasticDwellModel(seed=42)
        model_c = StochasticDwellModel(seed=999)

        rng_a = random.Random(42)
        rng_b = random.Random(42)
        rng_c = random.Random(999)

        samples_a = [model_a.sample_dwell_seconds("pickup", rng_a) for _ in range(25)]
        samples_b = [model_b.sample_dwell_seconds("pickup", rng_b) for _ in range(25)]
        samples_c = [model_c.sample_dwell_seconds("pickup", rng_c) for _ in range(25)]

        self.assertEqual(samples_a, samples_b, "Identical seeds must produce exact bitwise-matching samples")
        self.assertNotEqual(samples_a, samples_c, "Different seeds should produce divergent samples")

    def test_dwell_time_generation_bounds(self) -> None:
        """Dwell time samples are strictly positive and bounded in [5.0s, 3x mean]."""
        model = StochasticDwellModel(pickup_mean_seconds=60.0, dropoff_mean_seconds=25.0)
        rng = random.Random(12345)

        for _ in range(200):
            p_dwell = model.sample_dwell_seconds("pickup", rng)
            self.assertGreaterEqual(p_dwell, 5.0)
            self.assertLessEqual(p_dwell, 180.0)

            d_dwell = model.sample_dwell_seconds("dropoff", rng)
            self.assertGreaterEqual(d_dwell, 5.0)
            self.assertLessEqual(d_dwell, 75.0)

    def test_incident_activation_deactivation(self) -> None:
        """Incidents are active strictly between start_time and start_time + duration."""
        inc = IncidentEvent(
            incident_id="inc_test",
            edge_source="market_2nd",
            edge_target="market_1st",
            start_time=self.base_time,
            duration_seconds=600.0,
            is_full_closure=True,
        )

        before_start = self.base_time - timedelta(seconds=1)
        at_start = self.base_time
        during = self.base_time + timedelta(seconds=300)
        at_end = self.base_time + timedelta(seconds=600)
        after_end = self.base_time + timedelta(seconds=601)

        self.assertFalse(inc.is_active_at(before_start))
        self.assertTrue(inc.is_active_at(at_start))
        self.assertTrue(inc.is_active_at(during))
        self.assertFalse(inc.is_active_at(at_end), "Interval is half-open [start, start + duration)")
        self.assertFalse(inc.is_active_at(after_end))

    def test_route_invalidation_under_closure(self) -> None:
        """A full closure on a bottleneck edge makes that path invalid."""
        inc = IncidentEvent(
            incident_id="spur_block",
            edge_source="dock_spur_1",
            edge_target="dock_spur_2",
            start_time=self.base_time - timedelta(minutes=5),
            duration_seconds=3600.0,
            is_full_closure=True,
        )
        router = IncidentAwareRouter(self.network, self.bpr_model, [inc])

        with self.assertRaises(RouteNotFoundError):
            router.route_time_dependent(
                self.network.nodes["dock_spur_1"],
                self.network.nodes["dock_spur_2"],
                self.base_time,
            )

    def test_successful_rerouting_around_incident(self) -> None:
        """IncidentAwareRouter successfully finds a detour corridor around active closures."""
        inc = IncidentEvent(
            incident_id="market_closure",
            edge_source="market_2nd",
            edge_target="market_1st",
            start_time=self.base_time - timedelta(minutes=5),
            duration_seconds=3600.0,
            is_full_closure=True,
        )
        router = IncidentAwareRouter(self.network, self.bpr_model, [inc])

        res = router.route_time_dependent(
            self.network.nodes["market_3rd"],
            self.network.nodes["market_fremont"],
            self.base_time,
        )

        self.assertNotIn(
            ("market_2nd", "market_1st"),
            list(zip(res.node_path[:-1], res.node_path[1:])),
            "Rerouted path must not traverse the closed link",
        )
        self.assertGreater(res.distance_km, 0.0)
        self.assertGreater(res.congested_duration_seconds, 0.0)
        self.assertEqual(res.node_path[0], "market_3rd")
        self.assertEqual(res.node_path[-1], "market_fremont")

    def test_impossible_rerouting_raises_error(self) -> None:
        """When no alternative path exists to the destination, RouteNotFoundError is raised."""
        inc = IncidentEvent(
            incident_id="dock_block",
            edge_source="dock_spur_2",
            edge_target="dock_spur_1",
            start_time=self.base_time - timedelta(minutes=5),
            duration_seconds=3600.0,
            is_full_closure=True,
        )
        router = IncidentAwareRouter(self.network, self.bpr_model, [inc])

        with self.assertRaises(RouteNotFoundError):
            router.route_time_dependent(
                self.network.nodes["dock_spur_2"],
                self.network.nodes["market_1st"],
                self.base_time,
            )

    def test_constraint_preservation_after_recourse(self) -> None:
        """Online recourse maintains vehicle capacity, precedence constraints, and restores feasibility."""
        driver = Journey(
            journey_id="DRV-TEST",
            start=self.network.nodes["market_3rd"],
            destination=self.network.nodes["market_fremont"],
            departure=self.base_time,
            route=(self.network.nodes["market_3rd"], self.network.nodes["market_fremont"]),
            vehicle=Vehicle(capacity=2, verified=True),
            verification=VerificationContext(identity_verified=True, vehicle_verified=True, safety_flags=()),
        )
        rider = Journey(
            journey_id="RID-TEST",
            start=self.network.nodes["market_2nd"],
            destination=self.network.nodes["market_1st"],
            departure=self.base_time,
            route=(self.network.nodes["market_2nd"], self.network.nodes["market_1st"]),
            vehicle=Vehicle(capacity=2, verified=True),
            verification=VerificationContext(identity_verified=True, vehicle_verified=True, safety_flags=()),
        )

        plan = solve_multi_rider_greedy_insertion(
            driver, [rider], self.base_time, self.nominal_router, capacity=2, thresholds=self.thresholds
        )
        self.assertTrue(plan.is_feasible)

        incidents = [
            IncidentEvent(
                "inc_mod_1",
                "market_2nd",
                "market_1st",
                self.base_time - timedelta(minutes=2),
                1800.0,
                is_full_closure=True,
            )
        ]
        inc_router = IncidentAwareRouter(self.network, self.bpr_model, incidents)
        dwell_model = StochasticDwellModel(seed=42)
        rng = random.Random(42)

        ev = evaluate_trip_recourse(
            driver=driver,
            riders=[rider],
            nominal_route=plan,
            departure_time=self.base_time,
            nominal_router=self.nominal_router,
            incident_router=inc_router,
            dwell_model=dwell_model,
            enable_incidents=True,
            enable_dwell=True,
            thresholds=self.thresholds,
            rng=rng,
        )

        # Blind realized route must fail due to closure
        self.assertFalse(ev.realized_is_feasible)
        self.assertEqual(ev.realized_objective, 0.0)

        # Recourse must restore feasibility
        self.assertTrue(ev.recourse_is_feasible)
        self.assertGreater(ev.recourse_objective, 0.0)
        self.assertTrue(ev.recourse_triggered)
        self.assertGreater(ev.recourse_latency_ms, 0.0)

    def test_distinguish_static_execution_from_online_recourse(self) -> None:
        """Regression: Verify static unadapted conditions and recourse conditions are cleanly distinct."""
        report = run_experiment_012(network=self.network, primary_seed=42)

        c3 = report.scenario_metrics["3_static_incident"]
        c5 = report.scenario_metrics["5_recourse_incident"]

        self.assertEqual(c3.policy, "static")
        self.assertEqual(c5.policy, "recourse")
        self.assertEqual(c3.executed_feasible_rate_pct, 60.0)
        self.assertEqual(c5.executed_feasible_rate_pct, 100.0)
        self.assertNotEqual(c3.executed_mean_objective, c5.executed_mean_objective)
        self.assertEqual(c3.rerouting_frequency_pct, 0.0)
        self.assertEqual(c5.rerouting_frequency_pct, 50.0)
        self.assertIsNone(c3.mean_recourse_latency_ms)
        self.assertIsNotNone(c5.mean_recourse_latency_ms)
        self.assertIsNone(c3.mean_objective_recovery_pct)
        self.assertIsNotNone(c5.mean_objective_recovery_pct)

        c4 = report.scenario_metrics["4_static_dwell_incident"]
        c6 = report.scenario_metrics["6_recourse_dwell_incident"]
        self.assertEqual(c4.policy, "static")
        self.assertEqual(c6.policy, "recourse")
        self.assertEqual(c4.executed_feasible_rate_pct, 60.0)
        self.assertEqual(c6.executed_feasible_rate_pct, 100.0)
        self.assertNotEqual(c4.executed_mean_objective, c6.executed_mean_objective)

    def test_objective_metrics_change_with_operating_conditions(self) -> None:
        """Regression: Objectives change systematically as perturbations and policies vary."""
        report = run_experiment_012(network=self.network, primary_seed=42)

        obj_nom = report.scenario_metrics["1_static_nominal"].executed_mean_objective
        obj_dwell = report.scenario_metrics["2_static_dwell"].executed_mean_objective
        obj_inc_static = report.scenario_metrics["3_static_incident"].executed_mean_objective
        obj_inc_rec = report.scenario_metrics["5_recourse_incident"].executed_mean_objective

        # Dwell degrades travel times and slightly reduces score
        self.assertGreater(obj_nom, obj_dwell)
        # Incident link blockages cause massive objective drop under static unadapted execution
        self.assertGreater(obj_nom, obj_inc_static)
        # Online recourse restores objective score
        self.assertGreater(obj_inc_rec, obj_inc_static)

    def test_recovery_percentage_bounded_and_null_semantics(self) -> None:
        """Regression: Objective recovery is strictly in [0%, 100%]; null when undefined."""
        report = run_experiment_012(network=self.network, primary_seed=42)

        # Static scenarios must have null recovery
        for sc_name in ("1_static_nominal", "2_static_dwell", "3_static_incident", "4_static_dwell_incident"):
            self.assertIsNone(report.scenario_metrics[sc_name].mean_objective_recovery_pct)

        # Recourse scenarios must have recovery in [0.0%, 100.0%]
        for sc_name in ("5_recourse_incident", "6_recourse_dwell_incident"):
            recov = report.scenario_metrics[sc_name].mean_objective_recovery_pct
            self.assertIsNotNone(recov)
            self.assertGreaterEqual(recov, 0.0)
            self.assertLessEqual(recov, 100.0)

    def test_reproduce_aggregate_metrics_from_per_trip_records(self) -> None:
        """Regression: Verify all aggregate metrics mathematically match per-trip records."""
        report = run_experiment_012(network=self.network, primary_seed=42)
        sm6 = report.scenario_metrics["6_recourse_dwell_incident"]

        n_trips = len(report.evaluations)
        self.assertEqual(sm6.total_trips, n_trips)

        expected_feas = sum(1 for e in report.evaluations if e.recourse_is_feasible) / n_trips * 100.0
        self.assertAlmostEqual(sm6.executed_feasible_rate_pct, expected_feas, places=1)

        expected_obj = sum(e.recourse_objective for e in report.evaluations) / n_trips
        self.assertAlmostEqual(sm6.executed_mean_objective, expected_obj, places=2)

        expected_reroutes = sum(1 for e in report.evaluations if e.recourse_triggered) / n_trips * 100.0
        self.assertAlmostEqual(sm6.rerouting_frequency_pct, expected_reroutes, places=1)

        expected_lat = sum(e.recourse_latency_ms for e in report.evaluations) / n_trips
        self.assertAlmostEqual(sm6.mean_recourse_latency_ms, expected_lat, places=2)

    def test_timeout_and_null_semantics(self) -> None:
        """Never use 0.0 as a sentinel for unknown/infeasible or indeterminate optimum."""
        report = run_experiment_012(network=self.network, primary_seed=42)
        nom_metrics = report.scenario_metrics["1_static_nominal"]

        self.assertIsNone(nom_metrics.mean_regret_vs_oracle, "Nominal condition without incidents has null regret")
        self.assertIsNone(nom_metrics.mean_oracle_objective, "Nominal condition without incidents has null oracle")
        self.assertNotEqual(
            nom_metrics.mean_regret_vs_oracle, 0.0, "Sentinel 0.0 must never be used for missing values"
        )

    def test_save_experiment_012_outputs(self) -> None:
        """Output serialization creates valid results.json, metrics.csv, and manifest.json."""
        report = run_experiment_012(network=self.network, primary_seed=42)

        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = Path(tmpdir)
            r_path, m_path, man_path = save_experiment_012_outputs(report, out_dir)

            self.assertTrue(r_path.exists())
            self.assertTrue(m_path.exists())
            self.assertTrue(man_path.exists())

            with open(r_path, "r", encoding="utf-8") as f:
                res_data = json.load(f)
            self.assertIn("scenario_metrics", res_data)
            self.assertIn("severity_comparisons", res_data)

            with open(man_path, "r", encoding="utf-8") as f:
                man_data = json.load(f)
            self.assertEqual(man_data["experiment_id"], "012_dynamic_recourse")
            self.assertIn("summary", man_data)

    def test_seed_propagation_changes_stochastic_inputs(self) -> None:
        """Seed changes generate distinct commuter cohorts and dwell realizations."""
        drivers_42, riders_42 = generate_stress_instances(self.network, num_drivers=10, num_riders=25, seed=42)
        drivers_101, riders_101 = generate_stress_instances(self.network, num_drivers=10, num_riders=25, seed=101)
        drivers_2024, riders_2024 = generate_stress_instances(self.network, num_drivers=10, num_riders=25, seed=2024)

        # Coordinate sequences must differ across seeds
        d_coords_42 = [d.start for d in drivers_42]
        d_coords_101 = [d.start for d in drivers_101]
        self.assertNotEqual(d_coords_42, d_coords_101, "Driver cohort origins must differ across seeds")

        r_coords_42 = [r.start for r in riders_42]
        r_coords_2024 = [r.start for r in riders_2024]
        self.assertNotEqual(r_coords_42, r_coords_2024, "Rider cohort origins must differ across seeds")

        # Dwell distributions must draw distinct sequences
        dwell_m42 = StochasticDwellModel(seed=42)
        dwell_m101 = StochasticDwellModel(seed=101)
        rng42 = random.Random(42)
        rng101 = random.Random(101)
        samples_42 = [dwell_m42.sample_dwell_seconds("pickup", rng42) for _ in range(5)]
        samples_101 = [dwell_m101.sample_dwell_seconds("pickup", rng101) for _ in range(5)]
        self.assertNotEqual(samples_42, samples_101, "Dwell samples must differ across seeds")

    def test_seed_stability_metrics_independent_cohorts_and_per_trip_variation(self) -> None:
        """Seed stability sweep evaluates independent cohorts with distinct objectives and positive boost."""
        report = run_experiment_012(network=self.network, primary_seed=42)
        stab = report.seed_stability_results

        self.assertIn("seed_42", stab)
        self.assertIn("seed_101", stab)
        self.assertIn("seed_2024", stab)

        # Recourse feasibility should reach 100% across all evaluated cohorts
        for s_key, s_data in stab.items():
            self.assertEqual(s_data["recourse_feasible_rate_pct"], 100.0)
            self.assertGreater(s_data["feasibility_boost_pct"], 0.0)
            self.assertIn("cohort_drivers", s_data)
            self.assertIn("planned_trips", s_data)

        # Mean objectives must not be identical across independent cohorts
        objs = [s_data["realized_mean_objective"] for s_data in stab.values()]
        self.assertGreater(len(set(objs)), 1, "Independent cohorts must produce varying realized objectives")


if __name__ == "__main__":
    unittest.main()
