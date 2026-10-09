"""Tests for multi-rider batch assignment with greedy, auction, and exact optimal algorithms."""
import unittest
from datetime import datetime, timezone
from routemate.assignment import (
    ASSIGNMENT_VERSION,
    AssignmentGroup,
    AssignmentResult,
    MatchEdge,
    assign_auction,
    assign_greedy,
    assign_optimal,
    build_feasibility_graph,
    compute_optimality_gap,
    run_assignment,
)
from routemate.geometry import Coordinate
from routemate.models import Journey, Vehicle, VerificationContext
from routemate.routing import DeterministicGeometricRouter


def _journey(jid, x_start=0.0, x_dest=0.01, capacity=2, seats=1, verified=True):
    route = (Coordinate(0.0, x_start), Coordinate(0.0, x_dest))
    return Journey(
        journey_id=jid,
        start=route[0],
        destination=route[1],
        departure=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        route=route,
        vehicle=Vehicle("car", capacity, verified),
        verification=VerificationContext(verified, verified, ()),
        seats_requested=seats,
    )


class TestAssignment(unittest.TestCase):
    def test_empty_inputs(self):
        res = run_assignment((), ())
        self.assertEqual(res.matched_rider_count, 0)
        self.assertEqual(res.matched_driver_count, 0)
        self.assertEqual(res.groups, ())

    def test_validation_disjoint_ids(self):
        r = _journey("same_id")
        d = _journey("same_id")
        with self.assertRaises(ValueError):
            build_feasibility_graph([r], [d])

    def test_validation_unique_ids(self):
        r1 = _journey("r1")
        r2 = _journey("r1")
        d = _journey("d1")
        with self.assertRaises(ValueError):
            build_feasibility_graph([r1, r2], [d])

    def test_single_match_greedy_auction_and_optimal(self):
        r = _journey("r1", 0.0, 0.01)
        d = _journey("d1", 0.0, 0.01, capacity=2)
        edges, total, _ = build_feasibility_graph([r], [d])
        self.assertEqual(total, 1)
        self.assertEqual(len(edges), 1)

        res_g = assign_greedy(edges, [r], [d])
        self.assertEqual(res_g.matched_rider_count, 1)
        self.assertEqual(res_g.matched_driver_count, 1)
        self.assertEqual(len(res_g.groups), 1)
        self.assertEqual(res_g.groups[0].rider_ids, ("r1",))
        self.assertEqual(res_g.groups[0].remaining_capacity, 1)

        res_a = assign_auction(edges, [r], [d])
        self.assertEqual(res_a.matched_rider_count, 1)
        self.assertEqual(res_a.groups[0].rider_ids, ("r1",))

        res_opt = assign_optimal(edges, [r], [d])
        self.assertEqual(res_opt.matched_rider_count, 1)
        self.assertEqual(res_opt.groups[0].rider_ids, ("r1",))
        self.assertAlmostEqual(res_opt.objective_value, res_g.objective_value)

    def test_capacity_constraint_respected(self):
        r1 = _journey("r1", 0.0, 0.01)
        r2 = _journey("r2", 0.0, 0.01)
        r3 = _journey("r3", 0.0, 0.01)
        d = _journey("d1", 0.0, 0.01, capacity=2)

        res = run_assignment([r1, r2, r3], [d], method="greedy")
        self.assertEqual(res.matched_rider_count, 2)
        self.assertEqual(len(res.unmatched_rider_ids), 1)
        self.assertEqual(res.groups[0].seats_used, 2)
        self.assertEqual(res.groups[0].remaining_capacity, 0)

    def test_unverified_driver_produces_no_edges(self):
        r = _journey("r1", 0.0, 0.01)
        d_unverified = _journey("d1", 0.0, 0.01, verified=False)
        edges, total, _ = build_feasibility_graph([r], [d_unverified])
        self.assertEqual(total, 1)
        self.assertEqual(len(edges), 0)

        res = run_assignment([r], [d_unverified])
        self.assertEqual(res.matched_rider_count, 0)
        self.assertEqual(res.unmatched_rider_ids, ("r1",))
        self.assertEqual(res.unmatched_driver_ids, ("d1",))

    def test_auction_and_optimal_benchmark_comparison(self):
        r1 = _journey("r1", 0.0, 0.01)
        r2 = _journey("r2", 0.001, 0.011)
        d1 = _journey("d1", 0.0, 0.01, capacity=1)
        d2 = _journey("d2", 0.001, 0.011, capacity=1)

        res_g = run_assignment([r1, r2], [d1, d2], method="greedy")
        res_a = run_assignment([r1, r2], [d1, d2], method="auction")
        res_opt = run_assignment([r1, r2], [d1, d2], method="optimal")

        self.assertGreaterEqual(res_a.objective_value, res_g.objective_value - 1e-4)
        self.assertGreaterEqual(res_opt.objective_value, res_a.objective_value - 1e-4)
        self.assertEqual(res_opt.matched_rider_count, 2)

        gap = compute_optimality_gap(res_opt, res_a)
        self.assertGreaterEqual(gap, 0.0)

    def test_build_feasibility_graph_with_router(self):
        router = DeterministicGeometricRouter(nominal_speed_kmh=50.0)
        r = _journey("r1", 0.0, 0.01)
        d = _journey("d1", 0.0, 0.01, capacity=2)
        edges, total, _ = build_feasibility_graph([r], [d], router=router)
        self.assertEqual(total, 1)
        self.assertEqual(len(edges), 1)
        self.assertIn("detour_seconds", edges[0].decision.features)

    def test_invalid_method(self):
        r = _journey("r1")
        d = _journey("d1")
        with self.assertRaises(ValueError):
            run_assignment([r], [d], method="unsupported_solver")


if __name__ == "__main__":
    unittest.main()
