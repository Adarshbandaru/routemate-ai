"""Unit tests for the routing abstraction boundary."""
import unittest
from datetime import datetime, timezone

from routemate.geometry import Coordinate
from routemate.routing import (
    DeterministicGeometricRouter,
    InvalidQueryError,
    MockRoutingProvider,
    NetworkGraphRouter,
    OSRMClientRouter,
    ProviderUnavailableError,
    RoadDetourResult,
    RoadNetwork,
    RouteNotFoundError,
    RouteQuery,
    RouteResult,
    RoutingError,
    RoutingProvider,
    compute_road_detour,
    create_urban_grid_network,
)


class TestRoutingAbstraction(unittest.TestCase):
    def setUp(self):
        self.p1 = Coordinate(0.0, 0.0)
        self.p2 = Coordinate(0.0, 0.02)
        self.p3 = Coordinate(0.01, 0.02)

    def test_valid_route_query(self):
        now = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)
        query = RouteQuery(self.p1, self.p2, waypoints=(self.p3,), departure=now)
        self.assertEqual(query.origin, self.p1)
        self.assertEqual(query.destination, self.p2)
        self.assertEqual(query.waypoints, (self.p3,))
        self.assertEqual(query.departure, now)
        self.assertEqual(query.mode, "driving")

    def test_invalid_query_same_endpoints(self):
        with self.assertRaises(InvalidQueryError):
            RouteQuery(self.p1, self.p1)

    def test_invalid_query_naive_datetime(self):
        naive = datetime(2026, 1, 1, 8, 0)
        with self.assertRaises(InvalidQueryError):
            RouteQuery(self.p1, self.p2, departure=naive)

    def test_invalid_query_non_coordinate_waypoints(self):
        with self.assertRaises(InvalidQueryError):
            RouteQuery(self.p1, self.p2, waypoints=("not_a_coord",))

    def test_valid_route_result(self):
        res = RouteResult(
            route=(self.p1, self.p2),
            distance_km=2.224,
            duration_seconds=200.0,
            provider="test-provider",
            status="ok",
            metadata={"source": "fixture"},
        )
        self.assertEqual(len(res.route), 2)
        self.assertEqual(res.distance_km, 2.224)
        self.assertEqual(res.duration_seconds, 200.0)
        self.assertEqual(res.provider, "test-provider")
        self.assertEqual(res.metadata["source"], "fixture")

    def test_invalid_route_result_constraints(self):
        with self.assertRaises(ValueError):
            RouteResult(route=(), distance_km=1.0, duration_seconds=10.0, provider="p")
        with self.assertRaises(ValueError):
            RouteResult(route=(self.p1,), distance_km=1.0, duration_seconds=10.0, provider="p")
        with self.assertRaises(ValueError):
            RouteResult(route=(self.p1, self.p2), distance_km=-0.5, duration_seconds=10.0, provider="p")
        with self.assertRaises(ValueError):
            RouteResult(route=(self.p1, self.p2), distance_km=1.0, duration_seconds=-5.0, provider="p")
        with self.assertRaises(ValueError):
            RouteResult(route=(self.p1, self.p2), distance_km=1.0, duration_seconds=10.0, provider="  ")

    def test_deterministic_geometric_router(self):
        router = DeterministicGeometricRouter(nominal_speed_kmh=40.0)
        self.assertEqual(router.provider_name, "geometric-synthetic")

        query = RouteQuery(self.p1, self.p2)
        result = router.route(query)

        self.assertIsInstance(result, RouteResult)
        self.assertEqual(result.provider, "geometric-synthetic")
        self.assertAlmostEqual(result.distance_km, 2.2239, delta=0.01)
        self.assertAlmostEqual(result.duration_seconds, 200.15, delta=1.0)
        self.assertEqual(result.route, (self.p1, self.p2))

    def test_deterministic_geometric_router_with_waypoints(self):
        router = DeterministicGeometricRouter(nominal_speed_kmh=60.0)
        query = RouteQuery(self.p1, self.p3, waypoints=(self.p2,))
        result = router.route(query)
        self.assertEqual(result.route, (self.p1, self.p2, self.p3))
        self.assertGreater(result.distance_km, 0)
        self.assertGreater(result.duration_seconds, 0)

    def test_mock_routing_provider_canned_response(self):
        canned = RouteResult(
            route=(self.p1, self.p2),
            distance_km=3.5,
            duration_seconds=300.0,
            provider="canned-router",
        )
        mock = MockRoutingProvider(provider_name="test-mock")
        mock.register_route(self.p1, self.p2, canned)

        query = RouteQuery(self.p1, self.p2)
        res = mock.route(query)
        self.assertEqual(res.distance_km, 3.5)
        self.assertEqual(res.duration_seconds, 300.0)
        self.assertEqual(mock.call_count, 1)

    def test_mock_routing_provider_route_not_found(self):
        mock = MockRoutingProvider()
        query = RouteQuery(self.p1, self.p2)
        with self.assertRaises(RouteNotFoundError):
            mock.route(query)

    def test_mock_routing_provider_injected_failure(self):
        mock = MockRoutingProvider()
        mock.set_error(ProviderUnavailableError("simulated backend timeout"))
        query = RouteQuery(self.p1, self.p2)
        with self.assertRaises(ProviderUnavailableError):
            mock.route(query)

    def test_routing_provider_interface_contract(self):
        class IncompleteRouter(RoutingProvider):
            pass

        with self.assertRaises(TypeError):
            IncompleteRouter()

    def test_road_network_dijkstra_and_oneway(self):
        net = RoadNetwork()
        a = Coordinate(51.50, -0.12)
        b = Coordinate(51.50, -0.11)
        c = Coordinate(51.51, -0.11)
        net.add_node("A", a)
        net.add_node("B", b)
        net.add_node("C", c)

        # A -> B is two-way, B -> C is one-way
        net.add_edge("A", "B", distance_km=1.0, speed_kmh=50.0, oneway=False)
        net.add_edge("B", "C", distance_km=1.2, speed_kmh=30.0, oneway=True)

        path, dist, dur = net.shortest_path("A", "C")
        self.assertEqual(path, ["A", "B", "C"])
        self.assertAlmostEqual(dist, 2.2, delta=0.01)
        # Duration: 1km @ 50km/h (72s) + 1.2km @ 30km/h (144s) = 216s
        self.assertAlmostEqual(dur, 216.0, delta=1.0)

        # C -> A should fail due to one-way restriction
        with self.assertRaises(RouteNotFoundError):
            net.shortest_path("C", "A")

    def test_network_graph_router_urban_grid(self):
        net = create_urban_grid_network()
        router = NetworkGraphRouter(net)

        # Query from bottom-left (n_0_0) to top-right (n_3_3)
        origin = net.nodes["n_0_0"]
        dest = net.nodes["n_3_3"]

        res = router.route(RouteQuery(origin, dest))
        self.assertIsInstance(res, RouteResult)
        self.assertEqual(res.provider, "local-road-network")
        self.assertGreater(len(res.route), 2)
        self.assertGreater(res.distance_km, 0)
        self.assertGreater(res.duration_seconds, 0)
        self.assertEqual(res.status, "ok")

    def test_compute_road_detour(self):
        router = DeterministicGeometricRouter(nominal_speed_kmh=50.0)
        d_start = Coordinate(0.0, 0.0)
        d_dest = Coordinate(0.0, 0.04)
        r_pickup = Coordinate(0.002, 0.01)
        r_dropoff = Coordinate(0.002, 0.03)

        detour = compute_road_detour(d_start, d_dest, r_pickup, r_dropoff, router)
        self.assertIsInstance(detour, RoadDetourResult)
        self.assertGreater(detour.detour_km, 0)
        self.assertGreater(detour.detour_seconds, 0)
        self.assertGreaterEqual(detour.duration_ratio, 1.0)
        self.assertGreater(detour.pooled_distance_km, detour.base_distance_km)

    def test_osrm_client_router_offline_failure(self):
        # Query non-existent local port to verify ProviderUnavailableError handling
        osrm = OSRMClientRouter(base_url="http://127.0.0.1:59999", timeout_seconds=0.5)
        query = RouteQuery(self.p1, self.p2)
        with self.assertRaises(ProviderUnavailableError):
            osrm.route(query)


if __name__ == "__main__":
    unittest.main()
