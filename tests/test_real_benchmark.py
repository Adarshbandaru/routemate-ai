"""Unit tests for the real-world San Francisco road network benchmark."""
import unittest

from routemate.geometry import Coordinate, haversine_km
from routemate.real_benchmark import (
    create_san_francisco_road_network,
    run_real_city_benchmark,
    SF_CANONICAL_TRIPS,
    SF_INTERSECTIONS,
    SF_STREET_SEGMENTS,
    RealBenchmarkResult,
)
from routemate.routing import NetworkGraphRouter, RouteQuery


class TestRealBenchmark(unittest.TestCase):
    def test_san_francisco_road_network_topology(self):
        net = create_san_francisco_road_network()
        self.assertGreaterEqual(len(net.nodes), len(SF_INTERSECTIONS))
        # Ensure key nodes exist
        self.assertIn("fidi_montgomery", net.nodes)
        self.assertIn("caltrain_4th_king", net.nodes)
        self.assertIn("civic_center", net.nodes)

    def test_point_to_point_routing_on_sf_network(self):
        net = create_san_francisco_road_network()
        router = NetworkGraphRouter(net)

        # Route from FiDi to Caltrain
        query = RouteQuery(
            SF_INTERSECTIONS["fidi_montgomery"],
            SF_INTERSECTIONS["caltrain_4th_king"],
        )
        res = router.route(query)
        self.assertIsNotNone(res)
        self.assertGreater(res.distance_km, 0.5)
        self.assertGreater(res.duration_seconds, 30.0)

        # Haversine distance must be <= road distance (triangle inequality / Euclidean bound)
        euclid = haversine_km(query.origin, query.destination)
        self.assertLessEqual(euclid, res.distance_km + 1e-4)

    def test_run_real_city_benchmark_metrics(self):
        result = run_real_city_benchmark()
        self.assertIsInstance(result, RealBenchmarkResult)
        self.assertGreater(result.total_trips_evaluated, 0)
        self.assertGreaterEqual(result.mean_circuity_factor, 1.0)
        self.assertGreater(result.mean_speed_kmh, 10.0)
        self.assertLess(result.mean_speed_kmh, 60.0)
        self.assertGreaterEqual(result.euclidean_false_positive_rate_pct, 0.0)
        self.assertGreaterEqual(result.detour_underestimation_mean_km, 0.0)

        dict_out = result.to_dict()
        self.assertIn("mean_circuity_factor", dict_out)
        self.assertIn("sample_evaluations", dict_out)
        self.assertGreater(len(dict_out["sample_evaluations"]), 0)


if __name__ == "__main__":
    unittest.main()
