"""Unit tests for the road network benchmark module."""
import unittest

from routemate.road_benchmark import (
    DetourComparisonPoint,
    RoadBenchmarkReport,
    RouteComparisonPoint,
    run_road_network_benchmark,
)
from routemate.routing import create_urban_grid_network


class TestRoadBenchmark(unittest.TestCase):
    def test_run_benchmark_default_network(self):
        report = run_road_network_benchmark(max_pairs=20)
        self.assertIsInstance(report, RoadBenchmarkReport)
        self.assertGreater(report.total_pairs_evaluated, 0)

        # On an orthogonal street grid, road distance >= Euclidean distance (circuity >= 1.0)
        self.assertGreaterEqual(report.mean_circuity_factor, 1.0)
        self.assertGreaterEqual(report.min_circuity_factor, 1.0)
        self.assertGreater(report.mean_road_distance_km, 0)
        self.assertGreater(report.mean_euclidean_distance_km, 0)

        # Detour underestimation >= 0 (road network detours cannot be shorter than Euclidean)
        self.assertGreaterEqual(report.mean_detour_underestimation_km, 0.0)

        # Verify point structures
        first_pt = report.route_points[0]
        self.assertIsInstance(first_pt, RouteComparisonPoint)
        self.assertGreater(first_pt.road_distance_km, 0)
        self.assertGreater(first_pt.road_duration_seconds, 0)

        if report.detour_points:
            first_detour = report.detour_points[0]
            self.assertIsInstance(first_detour, DetourComparisonPoint)
            self.assertGreaterEqual(first_detour.road_detour_km, 0)

    def test_benchmark_insufficient_nodes_raises(self):
        from routemate.routing import RoadNetwork
        net = RoadNetwork()
        with self.assertRaises(ValueError):
            run_road_network_benchmark(network=net)


if __name__ == "__main__":
    unittest.main()
