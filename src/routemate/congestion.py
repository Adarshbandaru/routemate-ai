"""Time-dependent congestion modeling using the Bureau of Public Roads (BPR) formulation.

Provides time-dependent edge traversal costs, directional peak-hour traffic multipliers,
FIFO-consistent shortest-path routing, and dynamic multi-stop detour evaluations.

Mathematical Formulation:
Standard Bureau of Public Roads (BPR) link performance function:
    t(e, tau) = t_0(e) * (1 + alpha * (v(e, tau) / c(e))^beta)
where:
    t_0(e)   : free-flow traversal duration (seconds) = (d(e) / s_0(e)) * 3600
    v(e, tau): traffic volume / demand proxy at entry timestamp tau
    c(e)     : nominal practical link capacity (vehicles / hour)
    alpha    : delay parameter (default 0.15)
    beta     : congestion curve exponent (default 4.0)

Evidence class: Controlled synthetic congestion simulation on an OSM-derived street graph.
This model does not represent live empirical traffic sensor observations.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
import heapq
import math
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from .geometry import Coordinate, haversine_km
from .routing import NetworkEdge, RoadNetwork, RouteNotFoundError, RouteQuery


@dataclass(frozen=True)
class BPRParameters:
    """Bureau of Public Roads link performance parameters."""
    alpha: float = 0.15
    beta: float = 4.0
    nominal_capacity: float = 1000.0  # vehicles / hour / arterial lane


@dataclass(frozen=True)
class TimeDependentRouteResult:
    """Standardized route result produced by time-dependent network routing."""
    route: Tuple[Coordinate, ...]
    node_path: Tuple[str, ...]
    distance_km: float
    free_flow_duration_seconds: float
    congested_duration_seconds: float
    congestion_delay_seconds: float
    departure_time: datetime
    arrival_time: datetime
    bottleneck_edge: Optional[str] = None
    mean_speed_kmh: float = 0.0


@dataclass(frozen=True)
class DynamicDetourResult:
    """Multi-stop detour comparison under dynamic time-dependent traffic."""
    detour_km: float
    detour_seconds: float
    base_distance_km: float
    base_duration_seconds: float
    pooled_distance_km: float
    pooled_duration_seconds: float
    duration_ratio: float
    congestion_penalty_seconds: float


class BPRCongestionModel:
    """Calculates time-of-day demand and BPR congestion delay on road network links."""

    def __init__(
        self,
        params: Optional[BPRParameters] = None,
        scenario: str = "moderate_congestion",
    ) -> None:
        self.params = params or BPRParameters()
        self.scenario = scenario
        self._scenario_scale = self._get_scenario_scale(scenario)

    def _get_scenario_scale(self, scenario: str) -> float:
        scales = {
            "no_congestion": 0.0,
            "mild_congestion": 0.5,
            "moderate_congestion": 1.0,
            "severe_congestion": 2.0,
            "asymmetric_directional": 1.0,
        }
        return scales.get(scenario, 1.0)

    def get_time_of_day_vc_ratio(
        self,
        departure_time: datetime,
        direction: str = "neutral",
    ) -> float:
        """Determines the volume-to-capacity (v/c) ratio for a given timestamp and corridor direction."""
        # Normalize to hour of day (0.0 to 24.0)
        hour = departure_time.hour + departure_time.minute / 60.0 + departure_time.second / 3600.0

        if self.scenario == "no_congestion":
            return 0.0

        # Base diurnal demand curve
        # Off-peak night (21:00 - 06:00): v/c ~ 0.15 - 0.25
        # Morning peak (07:30 - 09:30): v/c ~ 0.9 - 1.3
        # Midday plateau (11:00 - 14:00): v/c ~ 0.65
        # Evening peak (16:30 - 19:00): v/c ~ 0.9 - 1.35
        if 7.5 <= hour <= 9.5:
            # Morning peak
            t_frac = (hour - 7.5) / 2.0
            peak_shape = math.sin(t_frac * math.pi)
            if direction == "inbound":
                base_vc = 0.70 + 0.55 * peak_shape  # Up to 1.25 (oversaturated)
            elif direction == "outbound":
                base_vc = 0.40 + 0.20 * peak_shape  # Counter-peak
            else:
                base_vc = 0.60 + 0.35 * peak_shape
        elif 16.5 <= hour <= 19.0:
            # Evening peak
            t_frac = (hour - 16.5) / 2.5
            peak_shape = math.sin(t_frac * math.pi)
            if direction == "outbound":
                base_vc = 0.75 + 0.60 * peak_shape  # Up to 1.35 (oversaturated)
            elif direction == "inbound":
                base_vc = 0.45 + 0.20 * peak_shape  # Counter-peak
            else:
                base_vc = 0.65 + 0.40 * peak_shape
        elif 11.0 <= hour <= 14.0:
            # Midday
            base_vc = 0.65
        elif 6.0 <= hour < 7.5 or 9.5 < hour < 11.0 or 14.0 < hour < 16.5 or 19.0 < hour <= 21.0:
            # Shoulder hours
            base_vc = 0.45
        else:
            # Night off-peak
            base_vc = 0.20

        # Apply scenario scaling
        return base_vc * self._scenario_scale

    def calculate_link_travel_time(
        self,
        edge: NetworkEdge,
        u_name: str,
        departure_time: datetime,
    ) -> Tuple[float, float]:
        """Calculates dynamic travel duration (seconds) and congestion delay (seconds).

        Returns:
            (dynamic_duration_seconds, congestion_delay_seconds)
        """
        t0 = edge.duration_seconds
        if self.scenario == "no_congestion" or self.params.alpha == 0.0:
            return t0, 0.0

        # Determine corridor direction from edge endpoints
        # In SF Downtown grid:
        # Inbound = Eastbound / Northbound towards Financial District/Market/Embarcadero
        # Outbound = Westbound / Southbound towards SoMa / Freeways
        direction = self._classify_edge_direction(u_name, edge.target)
        vc = self.get_time_of_day_vc_ratio(departure_time, direction)

        multiplier = 1.0 + self.params.alpha * (vc ** self.params.beta)
        # Cap max congestion delay to 5.0x free-flow to prevent unphysical numerical blowups
        multiplier = min(5.0, max(1.0, multiplier))

        t_dyn = t0 * multiplier
        delay = t_dyn - t0
        return t_dyn, delay

    def _classify_edge_direction(self, u: str, v: str) -> str:
        """Heuristic directional classification for SF Downtown corridor grid."""
        # Eastbound avenues (Howard, Market towards Beale) = Inbound
        # Westbound avenues (Folsom towards 4th) = Outbound
        inbound_nodes = {"beale", "fremont", "1st", "2nd"}
        outbound_nodes = {"4th", "3rd"}

        if "howard" in u and "howard" in v:
            return "inbound"  # Howard is one-way Eastbound
        if "folsom" in u and "folsom" in v:
            return "outbound"  # Folsom is one-way Westbound
        if any(n in v for n in inbound_nodes) and not any(n in u for n in inbound_nodes):
            return "inbound"
        if any(n in v for n in outbound_nodes) and not any(n in u for n in outbound_nodes):
            return "outbound"
        if "market" in u or "mission" in v:
            return "inbound"
        return "neutral"


class TimeDependentRouter:
    """Dijkstra router computing time-dependent shortest paths respecting FIFO entry times."""

    def __init__(
        self,
        network: RoadNetwork,
        congestion_model: Optional[BPRCongestionModel] = None,
    ) -> None:
        self.network = network
        self.congestion_model = congestion_model or BPRCongestionModel()

    def route_time_dependent(
        self,
        origin: Coordinate,
        destination: Coordinate,
        departure_time: datetime,
    ) -> TimeDependentRouteResult:
        """Finds time-dependent shortest-duration path from origin to destination."""
        if departure_time.tzinfo is None:
            raise ValueError("departure_time must be timezone-aware")

        start_node = self.network.nearest_node(origin)
        end_node = self.network.nearest_node(destination)

        if start_node == end_node:
            coord = self.network.nodes[start_node]
            return TimeDependentRouteResult(
                route=(coord, coord),
                node_path=(start_node,),
                distance_km=0.0,
                free_flow_duration_seconds=0.0,
                congested_duration_seconds=0.0,
                congestion_delay_seconds=0.0,
                departure_time=departure_time,
                arrival_time=departure_time,
                mean_speed_kmh=40.0,
            )

        # Priority queue stores: (current_arrival_epoch, u, cum_dist_km, cum_ff_sec, cum_dyn_sec, path)
        base_epoch = departure_time.timestamp()
        pq: List[Tuple[float, str, float, float, float, List[str]]] = [
            (base_epoch, start_node, 0.0, 0.0, 0.0, [start_node])
        ]
        visited: Dict[str, float] = {}
        worst_delay_edge: Optional[str] = None
        max_edge_delay = 0.0

        while pq:
            curr_epoch, u, d_km, ff_sec, dyn_sec, path = heapq.heappop(pq)
            if u == end_node:
                arr_time = datetime.fromtimestamp(curr_epoch, tz=timezone.utc)
                coords = tuple(self.network.nodes[nid] for nid in path)
                mean_spd = (d_km / (dyn_sec / 3600.0)) if dyn_sec > 0 else 40.0
                return TimeDependentRouteResult(
                    route=coords,
                    node_path=tuple(path),
                    distance_km=round(d_km, 4),
                    free_flow_duration_seconds=round(ff_sec, 2),
                    congested_duration_seconds=round(dyn_sec, 2),
                    congestion_delay_seconds=round(dyn_sec - ff_sec, 2),
                    departure_time=departure_time,
                    arrival_time=arr_time,
                    bottleneck_edge=worst_delay_edge,
                    mean_speed_kmh=round(mean_spd, 1),
                )

            if u in visited and visited[u] <= curr_epoch:
                continue
            visited[u] = curr_epoch

            current_time = datetime.fromtimestamp(curr_epoch, tz=timezone.utc)
            for edge in self.network.adj.get(u, []):
                v = edge.target
                edge_dyn_sec, edge_delay = self.congestion_model.calculate_link_travel_time(edge, u, current_time)
                new_epoch = curr_epoch + edge_dyn_sec

                if edge_delay > max_edge_delay:
                    max_edge_delay = edge_delay
                    worst_delay_edge = f"{u}->{v}"

                if v in visited and visited[v] <= new_epoch:
                    continue

                heapq.heappush(
                    pq,
                    (
                        new_epoch,
                        v,
                        d_km + edge.distance_km,
                        ff_sec + edge.duration_seconds,
                        dyn_sec + edge_dyn_sec,
                        path + [v],
                    ),
                )

        raise RouteNotFoundError(f"no path found in time-dependent network between {start_node} and {end_node}")

    def compute_dynamic_detour(
        self,
        driver_start: Coordinate,
        driver_dest: Coordinate,
        rider_pickup: Coordinate,
        rider_dropoff: Coordinate,
        departure_time: datetime,
    ) -> DynamicDetourResult:
        """Calculates multi-stop road network detour under time-dependent traffic conditions."""
        # Direct driver path
        direct_res = self.route_time_dependent(driver_start, driver_dest, departure_time)

        # Pooled driver path visiting rider pickup and dropoff sequentially
        seg1 = self.route_time_dependent(driver_start, rider_pickup, departure_time)
        seg2 = self.route_time_dependent(rider_pickup, rider_dropoff, seg1.arrival_time)
        seg3 = self.route_time_dependent(rider_dropoff, driver_dest, seg2.arrival_time)

        pooled_dist_km = seg1.distance_km + seg2.distance_km + seg3.distance_km
        pooled_dyn_sec = seg1.congested_duration_seconds + seg2.congested_duration_seconds + seg3.congested_duration_seconds
        pooled_ff_sec = seg1.free_flow_duration_seconds + seg2.free_flow_duration_seconds + seg3.free_flow_duration_seconds

        detour_km = max(0.0, pooled_dist_km - direct_res.distance_km)
        detour_sec = max(0.0, pooled_dyn_sec - direct_res.congested_duration_seconds)
        ratio = (pooled_dyn_sec / direct_res.congested_duration_seconds) if direct_res.congested_duration_seconds > 0 else 1.0
        cong_penalty = max(0.0, (pooled_dyn_sec - direct_res.congested_duration_seconds) - (pooled_ff_sec - direct_res.free_flow_duration_seconds))

        return DynamicDetourResult(
            detour_km=round(detour_km, 4),
            detour_seconds=round(detour_sec, 2),
            base_distance_km=direct_res.distance_km,
            base_duration_seconds=direct_res.congested_duration_seconds,
            pooled_distance_km=round(pooled_dist_km, 4),
            pooled_duration_seconds=round(pooled_dyn_sec, 2),
            duration_ratio=round(ratio, 3),
            congestion_penalty_seconds=round(cong_penalty, 2),
        )
