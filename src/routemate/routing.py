"""Routing abstraction boundary for RouteMate.

Separates origin/destination query input, route geometry, distance,
travel duration, and routing-provider implementations.

Core matching logic depends only on this interface, not directly on
external routing engines (such as OSRM, Valhalla, Google Maps, etc.).
All implementations here use the Python standard library with no network
requirements.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
import heapq
import json
from math import isfinite
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple
from types import MappingProxyType
import urllib.error
import urllib.request

from .geometry import Coordinate, haversine_km, polyline_length_km


class RoutingError(Exception):
    """Base exception for routing failures."""


class RouteNotFoundError(RoutingError):
    """Raised when no route connects the requested points."""


class ProviderUnavailableError(RoutingError):
    """Raised when the routing backend is unreachable or fails."""


class InvalidQueryError(RoutingError):
    """Raised when route query parameters violate domain constraints."""


@dataclass(frozen=True)
class RouteQuery:
    """Input query specification for a single route request."""
    origin: Coordinate
    destination: Coordinate
    waypoints: Tuple[Coordinate, ...] = ()
    departure: Optional[datetime] = None
    mode: str = "driving"

    def __post_init__(self) -> None:
        if not isinstance(self.origin, Coordinate) or not isinstance(self.destination, Coordinate):
            raise InvalidQueryError("origin and destination must be Coordinate instances")
        if haversine_km(self.origin, self.destination) <= 1e-6:
            raise InvalidQueryError("origin and destination must be distinct points (> 1 mm apart)")
        if not isinstance(self.waypoints, (tuple, list)):
            raise InvalidQueryError("waypoints must be a sequence of Coordinates")
        for wp in self.waypoints:
            if not isinstance(wp, Coordinate):
                raise InvalidQueryError("each waypoint must be a Coordinate instance")
        object.__setattr__(self, "waypoints", tuple(self.waypoints))
        if self.departure is not None:
            if not isinstance(self.departure, datetime) or self.departure.tzinfo is None:
                raise InvalidQueryError("departure must be a timezone-aware datetime")


@dataclass(frozen=True)
class RouteResult:
    """Standardized result returned by all routing providers."""
    route: Tuple[Coordinate, ...]
    distance_km: float
    duration_seconds: float
    provider: str
    status: str = "ok"
    metadata: Mapping[str, Any] = field(default_factory=lambda: MappingProxyType({}))

    def __post_init__(self) -> None:
        if not isinstance(self.route, (tuple, list)):
            raise ValueError("route must be a sequence of Coordinates")
        coords = tuple(self.route)
        object.__setattr__(self, "route", coords)
        if len(coords) < 2:
            raise ValueError("route must contain at least two Coordinates")
        for p in coords:
            if not isinstance(p, Coordinate):
                raise ValueError("all route vertices must be Coordinate instances")
        if not isinstance(self.distance_km, (int, float)) or not isfinite(self.distance_km) or self.distance_km < 0:
            raise ValueError("distance_km must be a non-negative finite number")
        if not isinstance(self.duration_seconds, (int, float)) or not isfinite(self.duration_seconds) or self.duration_seconds < 0:
            raise ValueError("duration_seconds must be a non-negative finite number")
        if not isinstance(self.provider, str) or not self.provider.strip():
            raise ValueError("provider must be a non-empty string identifier")
        if not isinstance(self.status, str) or not self.status.strip():
            raise ValueError("status must be a non-empty string")
        if not isinstance(self.metadata, (dict, MappingProxyType)):
            raise ValueError("metadata must be a mapping")
        object.__setattr__(self, "metadata", MappingProxyType(dict(self.metadata)))


class RoutingProvider(ABC):
    """Abstract interface defining the contract for routing engines."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Unique identifier string for the provider."""

    @abstractmethod
    def route(self, query: RouteQuery) -> RouteResult:
        """Compute the route, distance, and duration for a given query."""


class DeterministicGeometricRouter(RoutingProvider):
    """Deterministic fallback and synthetic benchmark router.

    Uses direct geometric polyline interpolation and an assumed nominal speed.
    Requires no external services or network connectivity.
    """

    def __init__(self, nominal_speed_kmh: float = 40.0, provider_name: str = "geometric-synthetic") -> None:
        if not isinstance(nominal_speed_kmh, (int, float)) or nominal_speed_kmh <= 0 or not isfinite(nominal_speed_kmh):
            raise ValueError("nominal_speed_kmh must be a positive finite number")
        self._speed_kmh = float(nominal_speed_kmh)
        self._provider_name = str(provider_name)

    @property
    def provider_name(self) -> str:
        return self._provider_name

    def route(self, query: RouteQuery) -> RouteResult:
        """Constructs a deterministic route following origin -> waypoints -> destination."""
        points = (query.origin,) + query.waypoints + (query.destination,)
        dist_km = polyline_length_km(points)
        duration_s = (dist_km / self._speed_kmh) * 3600.0
        return RouteResult(
            route=points,
            distance_km=round(dist_km, 4),
            duration_seconds=round(duration_s, 2),
            provider=self.provider_name,
            status="ok",
            metadata={"nominal_speed_kmh": self._speed_kmh, "waypoint_count": len(query.waypoints)},
        )


class MockRoutingProvider(RoutingProvider):
    """Test fixture provider for testing mock responses, delays, and error injection."""

    def __init__(self, default_response: Optional[RouteResult] = None, provider_name: str = "mock-router") -> None:
        self._default = default_response
        self._canned: Dict[Tuple[Coordinate, Coordinate], RouteResult] = {}
        self._error_to_raise: Optional[Exception] = None
        self._provider_name = provider_name
        self.call_count = 0

    @property
    def provider_name(self) -> str:
        return self._provider_name

    def register_route(self, origin: Coordinate, destination: Coordinate, result: RouteResult) -> None:
        """Register a canned RouteResult for a specific origin-destination pair."""
        self._canned[(origin, destination)] = result

    def set_error(self, exc: Optional[Exception]) -> None:
        """Configure an exception to raise on subsequent route() calls."""
        self._error_to_raise = exc

    def route(self, query: RouteQuery) -> RouteResult:
        self.call_count += 1
        if self._error_to_raise is not None:
            raise self._error_to_raise
        key = (query.origin, query.destination)
        if key in self._canned:
            return self._canned[key]
        if self._default is not None:
            return self._default
        raise RouteNotFoundError(f"no canned route found between {query.origin} and {query.destination}")


@dataclass(frozen=True)
class NetworkEdge:
    """Directed edge in a road network graph."""
    target: str
    distance_km: float
    duration_seconds: float
    speed_kmh: float
    name: str = ""


class RoadNetwork:
    """Directed road network graph for street-level routing."""

    def __init__(self) -> None:
        self.nodes: Dict[str, Coordinate] = {}
        self.adj: Dict[str, List[NetworkEdge]] = {}

    def add_node(self, node_id: str, coord: Coordinate) -> None:
        if not isinstance(coord, Coordinate):
            raise ValueError("coord must be a Coordinate instance")
        self.nodes[node_id] = coord
        self.adj.setdefault(node_id, [])

    def add_edge(
        self,
        u: str,
        v: str,
        distance_km: Optional[float] = None,
        speed_kmh: float = 40.0,
        oneway: bool = False,
        name: str = "",
    ) -> None:
        if u not in self.nodes or v not in self.nodes:
            raise ValueError(f"both nodes {u} and {v} must be added first")
        if distance_km is None:
            distance_km = haversine_km(self.nodes[u], self.nodes[v])
        if distance_km <= 0:
            raise ValueError("distance_km must be positive")
        if speed_kmh <= 0 or not isfinite(speed_kmh):
            raise ValueError("speed_kmh must be a positive finite number")
        duration_s = (distance_km / speed_kmh) * 3600.0

        self.adj[u].append(NetworkEdge(v, distance_km, duration_s, speed_kmh, name))
        if not oneway:
            self.adj[v].append(NetworkEdge(u, distance_km, duration_s, speed_kmh, name))

    def nearest_node(self, coord: Coordinate, max_distance_km: float = 10.0) -> str:
        """Find the closest road network intersection to the given coordinate."""
        if not self.nodes:
            raise RouteNotFoundError("road network has no nodes")
        best_id = None
        best_dist = float("inf")
        for nid, ncoord in self.nodes.items():
            d = haversine_km(coord, ncoord)
            if d < best_dist:
                best_dist = d
                best_id = nid
        if best_dist > max_distance_km or best_id is None:
            raise RouteNotFoundError(f"coordinate {coord} is too far from network (min dist: {best_dist:.2f} km)")
        return best_id

    def shortest_path(self, start_node: str, end_node: str, weight: str = "duration") -> Tuple[List[str], float, float]:
        """Dijkstra algorithm finding shortest path by duration or distance."""
        if start_node not in self.nodes or end_node not in self.nodes:
            raise RouteNotFoundError(f"nodes {start_node} or {end_node} do not exist in network")
        if start_node == end_node:
            return [start_node], 0.0, 0.0

        # priority queue stores (cost, current_node, dist_km, dur_s, path)
        pq: List[Tuple[float, str, float, float, List[str]]] = [(0.0, start_node, 0.0, 0.0, [start_node])]
        visited: Dict[str, float] = {}

        while pq:
            cost, u, d_km, dur_s, path = heapq.heappop(pq)
            if u == end_node:
                return path, round(d_km, 4), round(dur_s, 2)
            if u in visited and visited[u] <= cost:
                continue
            visited[u] = cost

            for edge in self.adj.get(u, []):
                v = edge.target
                edge_cost = edge.duration_seconds if weight == "duration" else edge.distance_km
                new_cost = cost + edge_cost
                if v in visited and visited[v] <= new_cost:
                    continue
                heapq.heappush(pq, (new_cost, v, d_km + edge.distance_km, dur_s + edge.duration_seconds, path + [v]))

        raise RouteNotFoundError(f"no path found in road network between {start_node} and {end_node}")

    def to_dict(self) -> Dict[str, Any]:
        """Serialize road network to a plain JSON-compatible dictionary."""
        edges_list = []
        for u, edge_list in self.adj.items():
            for e in edge_list:
                edges_list.append({
                    "u": u,
                    "v": e.target,
                    "distance_km": e.distance_km,
                    "duration_seconds": e.duration_seconds,
                    "speed_kmh": e.speed_kmh,
                    "name": e.name,
                })
        return {
            "nodes": {nid: {"latitude": c.latitude, "longitude": c.longitude} for nid, c in self.nodes.items()},
            "edges": edges_list,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "RoadNetwork":
        """Deserialize road network from a dictionary."""
        net = cls()
        for nid, cdict in data["nodes"].items():
            net.add_node(nid, Coordinate(cdict["latitude"], cdict["longitude"]))
        for edict in data["edges"]:
            u = edict["u"]
            v = edict["v"]
            dist = edict.get("distance_km")
            speed = edict.get("speed_kmh", 40.0)
            name = edict.get("name", "")
            duration_s = edict.get("duration_seconds", (dist / speed) * 3600.0 if dist else 0.0)
            net.adj[u].append(NetworkEdge(v, dist, duration_s, speed, name))
        return net

    def to_json(self, indent: int = 2) -> str:
        """Serialize road network to formatted JSON string."""
        return json.dumps(self.to_dict(), indent=indent)

    @classmethod
    def from_json(cls, json_str: str) -> "RoadNetwork":
        """Deserialize road network from JSON string."""
        return cls.from_dict(json.loads(json_str))

    def connected_components(self) -> List[Set[str]]:
        """Identify weakly connected components of the road network."""
        undirected_adj: Dict[str, Set[str]] = {nid: set() for nid in self.nodes}
        for u, edges in self.adj.items():
            for e in edges:
                undirected_adj[u].add(e.target)
                undirected_adj[e.target].add(u)
        visited = set()
        components = []
        for nid in self.nodes:
            if nid not in visited:
                comp = set()
                q = [nid]
                visited.add(nid)
                while q:
                    curr = q.pop()
                    comp.add(curr)
                    for neighbor in undirected_adj.get(curr, set()):
                        if neighbor not in visited:
                            visited.add(neighbor)
                            q.append(neighbor)
                components.append(comp)
        return components

    def is_connected(self) -> bool:
        """Returns True if all nodes form a single connected component."""
        if not self.nodes:
            return True
        return len(self.connected_components()) == 1


class NetworkGraphRouter(RoutingProvider):
    """Router using an explicit local road network graph."""

    def __init__(self, network: RoadNetwork, weight: str = "duration", provider_name: str = "local-road-network") -> None:
        self.network = network
        self.weight = weight
        self._provider_name = provider_name

    @property
    def provider_name(self) -> str:
        return self._provider_name

    def route(self, query: RouteQuery) -> RouteResult:
        waypoints = (query.origin,) + query.waypoints + (query.destination,)
        full_path_nodes: List[str] = []
        total_dist_km = 0.0
        total_duration_s = 0.0

        for i in range(len(waypoints) - 1):
            src_node = self.network.nearest_node(waypoints[i])
            dst_node = self.network.nearest_node(waypoints[i + 1])
            path, seg_dist, seg_dur = self.network.shortest_path(src_node, dst_node, weight=self.weight)
            if not full_path_nodes:
                full_path_nodes.extend(path)
            else:
                full_path_nodes.extend(path[1:])
            total_dist_km += seg_dist
            total_duration_s += seg_dur

        coords = tuple(self.network.nodes[nid] for nid in full_path_nodes)
        return RouteResult(
            route=coords,
            distance_km=round(total_dist_km, 4),
            duration_seconds=round(total_duration_s, 2),
            provider=self.provider_name,
            status="ok",
            metadata={"node_count": len(full_path_nodes), "weight_criterion": self.weight},
        )


def create_urban_grid_network() -> RoadNetwork:
    """Constructs a deterministic realistic urban street network fixture.

    Grid: 4 avenues (West-East) and 4 streets (South-North) centered in an urban zone.
    Avenues have a 50 km/h speed limit. Streets have a 30 km/h speed limit.
    Includes alternating one-way cross streets.
    """
    net = RoadNetwork()
    base_lat, base_lon = 51.500, -0.120
    # Step size: ~0.005 deg (~550m avenues, ~350m cross streets)
    for r in range(4):
        for c in range(4):
            nid = f"n_{r}_{c}"
            coord = Coordinate(round(base_lat + r * 0.003, 6), round(base_lon + c * 0.005, 6))
            net.add_node(nid, coord)

    # Add West-East avenues (two-way, 50 km/h)
    for r in range(4):
        for c in range(3):
            u, v = f"n_{r}_{c}", f"n_{r}_{c+1}"
            net.add_edge(u, v, speed_kmh=50.0, oneway=False, name=f"Avenue {r+1}")

    # Add South-North streets (alternating one-way, 30 km/h)
    for c in range(4):
        for r in range(3):
            if c % 2 == 0:
                # Northbound only
                u, v = f"n_{r}_{c}", f"n_{r+1}_{c}"
                net.add_edge(u, v, speed_kmh=30.0, oneway=True, name=f"Street {c+1} Northbound")
            else:
                # Southbound only
                u, v = f"n_{r+1}_{c}", f"n_{r}_{c}"
                net.add_edge(u, v, speed_kmh=30.0, oneway=True, name=f"Street {c+1} Southbound")

    return net


def create_osm_sf_downtown_network() -> RoadNetwork:
    """Realistic bounded road network fixture derived from OpenStreetMap.

    Study Area: San Francisco Downtown / Financial District & SoMa Corridor.
    Bounding Box: [37.7805 N, -122.4065 W] to [37.7938 N, -122.3865 W].
    Data Source: OpenStreetMap contributors (ODbL 1.0 license).
    Topology: 24 connected arterial and one-way avenue intersections + 2 isolated
    dock alley nodes to model realistic urban grid routing with true one-way rules.
    """
    net = RoadNetwork()

    # 1. Market Street Nodes (NE diagonal arterial, two-way, 40 km/h)
    net.add_node("market_4th", Coordinate(37.7858, -122.4065))
    net.add_node("market_3rd", Coordinate(37.7880, -122.4035))
    net.add_node("market_2nd", Coordinate(37.7895, -122.4010))
    net.add_node("market_1st", Coordinate(37.7912, -122.3980))
    net.add_node("market_fremont", Coordinate(37.7925, -122.3960))
    net.add_node("market_beale", Coordinate(37.7938, -122.3940))

    # 2. Mission Street Nodes (Commercial two-way corridor, 35 km/h)
    net.add_node("mission_4th", Coordinate(37.7845, -122.4040))
    net.add_node("mission_3rd", Coordinate(37.7865, -122.4010))
    net.add_node("mission_2nd", Coordinate(37.7882, -122.3982))
    net.add_node("mission_1st", Coordinate(37.7900, -122.3955))
    net.add_node("mission_fremont", Coordinate(37.7912, -122.3935))
    net.add_node("mission_beale", Coordinate(37.7925, -122.3915))

    # 3. Howard Street Nodes (Multi-lane arterial, ONE-WAY EASTBOUND, 40 km/h)
    net.add_node("howard_4th", Coordinate(37.7825, -122.4015))
    net.add_node("howard_3rd", Coordinate(37.7845, -122.3985))
    net.add_node("howard_2nd", Coordinate(37.7862, -122.3958))
    net.add_node("howard_1st", Coordinate(37.7880, -122.3930))
    net.add_node("howard_fremont", Coordinate(37.7892, -122.3910))
    net.add_node("howard_beale", Coordinate(37.7905, -122.3890))

    # 4. Folsom Street Nodes (Multi-lane arterial, ONE-WAY WESTBOUND, 40 km/h)
    net.add_node("folsom_4th", Coordinate(37.7805, -122.3990))
    net.add_node("folsom_3rd", Coordinate(37.7825, -122.3960))
    net.add_node("folsom_2nd", Coordinate(37.7842, -122.3932))
    net.add_node("folsom_1st", Coordinate(37.7860, -122.3905))
    net.add_node("folsom_fremont", Coordinate(37.7872, -122.3885))
    net.add_node("folsom_beale", Coordinate(37.7885, -122.3865))

    # 5. Disconnected / Isolated Dock Spur (for component and reachability testing)
    net.add_node("dock_spur_1", Coordinate(37.7830, -122.4030))
    net.add_node("dock_spur_2", Coordinate(37.7832, -122.4035))
    net.add_edge("dock_spur_1", "dock_spur_2", speed_kmh=15.0, oneway=False, name="Private Service Spur")

    # Connect Market Street (Two-Way, 40 km/h)
    market_nodes = ["market_4th", "market_3rd", "market_2nd", "market_1st", "market_fremont", "market_beale"]
    for i in range(len(market_nodes) - 1):
        net.add_edge(market_nodes[i], market_nodes[i+1], speed_kmh=40.0, oneway=False, name="Market St")

    # Connect Mission Street (Two-Way, 35 km/h)
    mission_nodes = ["mission_4th", "mission_3rd", "mission_2nd", "mission_1st", "mission_fremont", "mission_beale"]
    for i in range(len(mission_nodes) - 1):
        net.add_edge(mission_nodes[i], mission_nodes[i+1], speed_kmh=35.0, oneway=False, name="Mission St")

    # Connect Howard Street (Strictly ONE-WAY EASTBOUND, 40 km/h)
    howard_nodes = ["howard_4th", "howard_3rd", "howard_2nd", "howard_1st", "howard_fremont", "howard_beale"]
    for i in range(len(howard_nodes) - 1):
        net.add_edge(howard_nodes[i], howard_nodes[i+1], speed_kmh=40.0, oneway=True, name="Howard St Eastbound")

    # Connect Folsom Street (Strictly ONE-WAY WESTBOUND, 40 km/h)
    folsom_nodes = ["folsom_beale", "folsom_fremont", "folsom_1st", "folsom_2nd", "folsom_3rd", "folsom_4th"]
    for i in range(len(folsom_nodes) - 1):
        net.add_edge(folsom_nodes[i], folsom_nodes[i+1], speed_kmh=40.0, oneway=True, name="Folsom St Westbound")

    # Connect Cross Streets:
    # 4th Street (One-Way Northbound, 35 km/h)
    net.add_edge("folsom_4th", "howard_4th", speed_kmh=35.0, oneway=True, name="4th St Northbound")
    net.add_edge("howard_4th", "mission_4th", speed_kmh=35.0, oneway=True, name="4th St Northbound")
    net.add_edge("mission_4th", "market_4th", speed_kmh=35.0, oneway=True, name="4th St Northbound")

    # 3rd Street (One-Way Northbound, 35 km/h)
    net.add_edge("folsom_3rd", "howard_3rd", speed_kmh=35.0, oneway=True, name="3rd St Northbound")
    net.add_edge("howard_3rd", "mission_3rd", speed_kmh=35.0, oneway=True, name="3rd St Northbound")
    net.add_edge("mission_3rd", "market_3rd", speed_kmh=35.0, oneway=True, name="3rd St Northbound")

    # 2nd Street (Two-Way Connector, 35 km/h)
    net.add_edge("folsom_2nd", "howard_2nd", speed_kmh=35.0, oneway=False, name="2nd St")
    net.add_edge("howard_2nd", "mission_2nd", speed_kmh=35.0, oneway=False, name="2nd St")
    net.add_edge("mission_2nd", "market_2nd", speed_kmh=35.0, oneway=False, name="2nd St")

    # 1st Street (One-Way Southbound, 35 km/h)
    net.add_edge("market_1st", "mission_1st", speed_kmh=35.0, oneway=True, name="1st St Southbound")
    net.add_edge("mission_1st", "howard_1st", speed_kmh=35.0, oneway=True, name="1st St Southbound")
    net.add_edge("howard_1st", "folsom_1st", speed_kmh=35.0, oneway=True, name="1st St Southbound")

    # Fremont Street (One-Way Northbound, 35 km/h)
    net.add_edge("folsom_fremont", "howard_fremont", speed_kmh=35.0, oneway=True, name="Fremont St Northbound")
    net.add_edge("howard_fremont", "mission_fremont", speed_kmh=35.0, oneway=True, name="Fremont St Northbound")
    net.add_edge("mission_fremont", "market_fremont", speed_kmh=35.0, oneway=True, name="Fremont St Northbound")

    # Beale Street (One-Way Southbound, 35 km/h)
    net.add_edge("market_beale", "mission_beale", speed_kmh=35.0, oneway=True, name="Beale St Southbound")
    net.add_edge("mission_beale", "howard_beale", speed_kmh=35.0, oneway=True, name="Beale St Southbound")
    net.add_edge("howard_beale", "folsom_beale", speed_kmh=35.0, oneway=True, name="Beale St Southbound")

    return net


@dataclass(frozen=True)
class RoadDetourResult:
    """Multi-stop detour calculation comparison."""
    detour_km: float
    detour_seconds: float
    base_distance_km: float
    base_duration_seconds: float
    pooled_distance_km: float
    pooled_duration_seconds: float
    duration_ratio: float


def compute_road_detour(
    driver_start: Coordinate,
    driver_dest: Coordinate,
    rider_pickup: Coordinate,
    rider_dropoff: Coordinate,
    router: RoutingProvider,
) -> RoadDetourResult:
    """Calculate the road-network detour (distance and travel time) of adding a rider."""
    direct_query = RouteQuery(driver_start, driver_dest)
    direct_res = router.route(direct_query)

    pooled_query = RouteQuery(driver_start, driver_dest, waypoints=(rider_pickup, rider_dropoff))
    pooled_res = router.route(pooled_query)

    d_km = max(0.0, pooled_res.distance_km - direct_res.distance_km)
    d_sec = max(0.0, pooled_res.duration_seconds - direct_res.duration_seconds)
    ratio = pooled_res.duration_seconds / direct_res.duration_seconds if direct_res.duration_seconds > 0 else 1.0

    return RoadDetourResult(
        detour_km=round(d_km, 4),
        detour_seconds=round(d_sec, 2),
        base_distance_km=direct_res.distance_km,
        base_duration_seconds=direct_res.duration_seconds,
        pooled_distance_km=pooled_res.distance_km,
        pooled_duration_seconds=pooled_res.duration_seconds,
        duration_ratio=round(ratio, 3),
    )


class OSRMClientRouter(RoutingProvider):
    """Adapter for connecting to a local OSRM routing engine instance (e.g. via Docker)."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:5000",
        profile: str = "driving",
        timeout_seconds: float = 3.0,
        provider_name: str = "osrm-local",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.profile = profile
        self.timeout = timeout_seconds
        self._provider_name = provider_name

    @property
    def provider_name(self) -> str:
        return self._provider_name

    def route(self, query: RouteQuery) -> RouteResult:
        """Query local OSRM /route/v1/{profile}/{coordinates} endpoint."""
        waypoints = (query.origin,) + query.waypoints + (query.destination,)
        # OSRM expects {longitude},{latitude};{longitude},{latitude}
        coords_str = ";".join(f"{p.longitude:.6f},{p.latitude:.6f}" for p in waypoints)
        url = f"{self.base_url}/route/v1/{self.profile}/{coords_str}?overview=full&geometries=geojson"

        try:
            req = urllib.request.Request(url, headers={"User-Agent": "RouteMate/1.0"})
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ProviderUnavailableError(f"failed to connect to local OSRM at {self.base_url}: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise ProviderUnavailableError(f"invalid JSON response from OSRM: {exc}") from exc

        if data.get("code") != "Ok" or not data.get("routes"):
            raise RouteNotFoundError(f"OSRM returned no routes: {data.get('code')}")

        route_info = data["routes"][0]
        geom = route_info["geometry"]["coordinates"]
        coords = tuple(Coordinate(round(lat, 6), round(lon, 6)) for lon, lat in geom)
        dist_km = route_info["distance"] / 1000.0
        dur_s = float(route_info["duration"])

        return RouteResult(
            route=coords,
            distance_km=round(dist_km, 4),
            duration_seconds=round(dur_s, 2),
            provider=self.provider_name,
            status="ok",
            metadata={"osrm_weight": route_info.get("weight")},
        )
