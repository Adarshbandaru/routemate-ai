"""Unit and integration tests for Experiment 013: Fleet-Wide Rolling-Horizon Dispatch."""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest

from routemate.congestion import BPRCongestionModel
from routemate.hybrid_pruning import generate_stress_instances
from routemate.rolling_dispatch import (
    DispatchRiderRequest,
    Experiment013Report,
    FleetDispatchSimulator,
    PolicyRunMetrics,
    RequestStatus,
    generate_synthetic_dispatch_requests,
    run_experiment_013,
    save_experiment_013_outputs,
)
from routemate.routing import create_osm_sf_downtown_network


class TestExperiment013RollingDispatch(unittest.TestCase):
    """Validation suite for Experiment 013 fleet-wide rolling-horizon dispatch."""

    def setUp(self) -> None:
        self.network = create_osm_sf_downtown_network()
        self.start_time = datetime(2026, 10, 8, 8, 0, tzinfo=timezone.utc)
        self.drivers, _ = generate_stress_instances(self.network, num_drivers=8, num_riders=10, seed=42)

    def test_dynamic_request_state_transitions(self) -> None:
        """Requests follow monotonic state transitions: waiting -> assigned -> picked_up -> completed."""
        requests = generate_synthetic_dispatch_requests(
            network=self.network,
            start_time=self.start_time,
            duration_minutes=20.0,
            arrival_rate_per_min=0.8,
            seed=42,
        )
        sim = FleetDispatchSimulator(
            network=self.network,
            drivers=self.drivers,
            requests=requests,
            start_time=self.start_time,
            duration_minutes=20.0,
            policy="event_driven_rolling",
            seed=42,
        )
        metrics = sim.run()

        self.assertGreater(metrics.total_completed, 0, "Some requests must complete")
        for r in sim.requests:
            if r.status == RequestStatus.COMPLETED:
                self.assertIsNotNone(r.assigned_at)
                self.assertIsNotNone(r.pickup_at)
                self.assertIsNotNone(r.dropoff_at)
                self.assertLessEqual(r.created_at, r.assigned_at)
                self.assertLessEqual(r.assigned_at, r.pickup_at)
                self.assertLessEqual(r.pickup_at, r.dropoff_at)

    def test_capacity_and_stop_precedence_invariants(self) -> None:
        """Vehicle passenger load never exceeds capacity and pickups always precede dropoffs."""
        requests = generate_synthetic_dispatch_requests(
            network=self.network,
            start_time=self.start_time,
            duration_minutes=25.0,
            arrival_rate_per_min=1.2,
            seed=42,
        )
        sim = FleetDispatchSimulator(
            network=self.network,
            drivers=self.drivers,
            requests=requests,
            start_time=self.start_time,
            duration_minutes=25.0,
            policy="event_driven_rolling",
            seed=42,
        )
        sim.run()

        for v in sim.vehicles:
            # Capacity invariant
            self.assertLessEqual(len(v.onboard_rider_ids), v.capacity)

            # Precedence invariant on itinerary
            seen_pickups = set()
            for s in v.itinerary:
                if s.kind == "pickup":
                    seen_pickups.add(s.rider_id)
                elif s.kind == "dropoff":
                    self.assertIn(s.rider_id, seen_pickups, "Dropoff must not occur before pickup")

    def test_active_trip_insertion_capability(self) -> None:
        """Rolling policies execute active-trip insertions while static batch does not."""
        requests = generate_synthetic_dispatch_requests(
            network=self.network,
            start_time=self.start_time,
            duration_minutes=25.0,
            arrival_rate_per_min=1.5,
            seed=42,
        )

        sim_static = FleetDispatchSimulator(
            network=self.network,
            drivers=self.drivers,
            requests=requests,
            start_time=self.start_time,
            duration_minutes=25.0,
            policy="static_batch",
            enable_active_trip_insertions=False,
            seed=42,
        )
        m_static = sim_static.run()

        sim_rolling = FleetDispatchSimulator(
            network=self.network,
            drivers=self.drivers,
            requests=requests,
            start_time=self.start_time,
            duration_minutes=25.0,
            policy="event_driven_rolling",
            enable_active_trip_insertions=True,
            seed=42,
        )
        m_rolling = sim_rolling.run()

        self.assertEqual(m_static.active_trip_insertions, 0, "Static batch must not perform active-trip insertions")
        self.assertGreaterEqual(m_rolling.active_trip_insertions, 1, "Rolling policy must perform active insertions")

    def test_cancellation_and_patience_expiration(self) -> None:
        """Unserviced requests whose wait time exceeds patience transition to cancelled."""
        requests = generate_synthetic_dispatch_requests(
            network=self.network,
            start_time=self.start_time,
            duration_minutes=15.0,
            arrival_rate_per_min=1.0,
            mean_patience_minutes=1.5,
            seed=42,
        )
        # Empty fleet forces 100% cancellation
        sim = FleetDispatchSimulator(
            network=self.network,
            drivers=[],
            requests=requests,
            start_time=self.start_time,
            duration_minutes=15.0,
            policy="static_batch",
            seed=42,
        )
        m = sim.run()
        self.assertEqual(m.total_completed, 0)
        self.assertEqual(m.cancellation_rate_pct, 100.0)
        self.assertTrue(all(r.status == RequestStatus.CANCELLED for r in sim.requests))

    def test_policy_differentiation_wait_and_fulfillment(self) -> None:
        """Event-driven rolling reduces waiting time compared with static batching."""
        requests = generate_synthetic_dispatch_requests(
            network=self.network,
            start_time=self.start_time,
            duration_minutes=30.0,
            arrival_rate_per_min=1.0,
            seed=42,
        )

        sim_static = FleetDispatchSimulator(
            network=self.network,
            drivers=self.drivers,
            requests=requests,
            start_time=self.start_time,
            duration_minutes=30.0,
            policy="static_batch",
            batch_interval_seconds=60,
            seed=42,
        )
        m_static = sim_static.run()

        sim_event = FleetDispatchSimulator(
            network=self.network,
            drivers=self.drivers,
            requests=requests,
            start_time=self.start_time,
            duration_minutes=30.0,
            policy="event_driven_rolling",
            seed=42,
        )
        m_event = sim_event.run()

        # Event-driven dispatch should have lower wait time by reacting immediately to arrivals
        self.assertLess(m_event.mean_wait_time_seconds, m_static.mean_wait_time_seconds)

    def test_deterministic_replay_and_seed_stability(self) -> None:
        """Identical seeds produce identical simulation replays; distinct seeds produce distinct demand."""
        reqs_a = generate_synthetic_dispatch_requests(self.network, self.start_time, 20.0, 1.0, 8.0, seed=42)
        reqs_b = generate_synthetic_dispatch_requests(self.network, self.start_time, 20.0, 1.0, 8.0, seed=42)
        reqs_c = generate_synthetic_dispatch_requests(self.network, self.start_time, 20.0, 1.0, 8.0, seed=999)

        # Replay equality
        self.assertEqual([r.created_at for r in reqs_a], [r.created_at for r in reqs_b])
        # Distinct seed differentiation
        self.assertNotEqual([r.created_at for r in reqs_a], [r.created_at for r in reqs_c])

    def test_save_experiment_013_outputs(self) -> None:
        """Output serialization writes valid results.json, metrics.csv, and manifest.json."""
        report = run_experiment_013(network=self.network, primary_seed=42, horizon_minutes=15.0)

        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = Path(tmpdir)
            r_path, m_path, man_path = save_experiment_013_outputs(report, out_dir)

            self.assertTrue(r_path.exists())
            self.assertTrue(m_path.exists())
            self.assertTrue(man_path.exists())

            with open(r_path, "r", encoding="utf-8") as f:
                r_data = json.load(f)
            self.assertIn("regime_comparisons", r_data)
            self.assertIn("disruption_comparisons", r_data)
            self.assertIn("seed_stability_results", r_data)

            with open(man_path, "r", encoding="utf-8") as f:
                man_data = json.load(f)
            self.assertEqual(man_data["experiment_id"], "013_rolling_dispatch")
            self.assertIn("summary", man_data)


if __name__ == "__main__":
    unittest.main()
