"""Road network benchmark evaluating Euclidean vs. Street-Network routing gaps.

Compares geometric approximations (Haversine distance, geometric edge insertion)
against true street-network routing over a road network graph with speed limits,
intersections, and one-way streets.

All benchmarks use the Python standard library with no external network calls.
"""
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple
import math

from .geometry import Coordinate, haversine_km, ordered_insertion_detour_km
from .routing import (
    NetworkGraphRouter,
    RoadDetourResult,
    RoadNetwork,
    RouteQuery,
    compute_road_detour,
    create_urban_grid_network,
)


@dataclass(frozen=True)
class RouteComparisonPoint:
    """Detailed point-by-point comparison between geometric and road network routing."""
    pair_id: str
    origin: Coordinate
    destination: Coordinate
    euclidean_distance_km: float
    road_distance_km: float
    circuity_factor: float
    road_duration_seconds: float
    road_speed_kmh: float


@dataclass(frozen=True)
class DetourComparisonPoint:
    """Comparison between geometric insertion detour and true multi-stop road detour."""
    pair_id: str
    driver_start: Coordinate
    driver_dest: Coordinate
    rider_pickup: Coordinate
    rider_dropoff: Coordinate
    geometric_detour_km: float
    road_detour_km: float
    road_detour_seconds: float
    detour_underestimation_km: float
    geometric_detour_eligible: bool  # detour <= 5.0 km
    road_detour_eligible: bool       # road detour <= 5.0 km
    feasibility_disagreement: bool


@dataclass(frozen=True)
class RoadBenchmarkReport:
    """Aggregate benchmark results quantifying the geometric approximation gap."""
    total_pairs_evaluated: int
    mean_circuity_factor: float
    max_circuity_factor: float
    min_circuity_factor: float
    mean_road_distance_km: float
    mean_euclidean_distance_km: float
    mean_geometric_detour_km: float
    mean_road_detour_km: float
    mean_detour_underestimation_km: float
    feasibility_disagreement_count: int
    feasibility_disagreement_rate: float
    route_points: Tuple[RouteComparisonPoint, ...]
    detour_points: Tuple[DetourComparisonPoint, ...]


def run_road_network_benchmark(
    network: Optional[RoadNetwork] = None,
    max_pairs: int = 50,
) -> RoadBenchmarkReport:
    """Runs a systematic benchmark over nodes of a road network.

    Evaluates both point-to-point circuity and 4-point pooling detours.
    """
    if network is None:
        network = create_urban_grid_network()

    router = NetworkGraphRouter(network, weight="duration")
    nodes = list(network.nodes.items())
    if len(nodes) < 4:
        raise ValueError("road network must have at least 4 nodes for benchmark")

    route_points: List[RouteComparisonPoint] = []
    detour_points: List[DetourComparisonPoint] = []

    # 1. Point-to-point circuity evaluation
    pair_idx = 0
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            if pair_idx >= max_pairs:
                break
            id_a, coord_a = nodes[i]
            id_b, coord_b = nodes[j]

            euc_dist = haversine_km(coord_a, coord_b)
            if euc_dist < 0.1:
                continue

            try:
                res = router.route(RouteQuery(coord_a, coord_b))
                circuity = res.distance_km / euc_dist if euc_dist > 0 else 1.0
                speed = (res.distance_km / (res.duration_seconds / 3600.0)) if res.duration_seconds > 0 else 0.0

                route_points.append(
                    RouteComparisonPoint(
                        pair_id=f"{id_a}->{id_b}",
                        origin=coord_a,
                        destination=coord_b,
                        euclidean_distance_km=round(euc_dist, 4),
                        road_distance_km=round(res.distance_km, 4),
                        circuity_factor=round(circuity, 3),
                        road_duration_seconds=round(res.duration_seconds, 1),
                        road_speed_kmh=round(speed, 1),
                    )
                )
                pair_idx += 1
            except Exception:
                continue

    # 2. 4-point pooling detour evaluation (Driver start/dest + Rider pickup/dropoff)
    detour_idx = 0
    step = max(1, len(nodes) // 8)
    for i in range(0, len(nodes) - 3, step):
        if detour_idx >= max_pairs:
            break
        d_start = nodes[i][1]
        d_dest = nodes[i + 3][1]
        r_pick = nodes[i + 1][1]
        r_drop = nodes[i + 2][1]

        # Geometric detour using straight-line insertion
        dummy_driver_route = (d_start, d_dest)
        geom_detour = ordered_insertion_detour_km(dummy_driver_route, r_pick, r_drop)

        # True road-network detour
        try:
            road_detour_res = compute_road_detour(d_start, d_dest, r_pick, r_drop, router)
            road_detour = road_detour_res.detour_km

            underestimation = max(0.0, road_detour - geom_detour)
            geom_ok = geom_detour <= 5.0
            road_ok = road_detour <= 5.0
            disagreement = geom_ok != road_ok

            detour_points.append(
                DetourComparisonPoint(
                    pair_id=f"pool_{detour_idx}",
                    driver_start=d_start,
                    driver_dest=d_dest,
                    rider_pickup=r_pick,
                    rider_dropoff=r_drop,
                    geometric_detour_km=round(geom_detour, 4),
                    road_detour_km=round(road_detour, 4),
                    road_detour_seconds=round(road_detour_res.detour_seconds, 1),
                    detour_underestimation_km=round(underestimation, 4),
                    geometric_detour_eligible=geom_ok,
                    road_detour_eligible=road_ok,
                    feasibility_disagreement=disagreement,
                )
            )
            detour_idx += 1
        except Exception:
            continue

    # Summary statistics
    circuities = [p.circuity_factor for p in route_points] or [1.0]
    eucs = [p.euclidean_distance_km for p in route_points] or [0.0]
    roads = [p.road_distance_km for p in route_points] or [0.0]
    geom_dets = [p.geometric_detour_km for p in detour_points] or [0.0]
    road_dets = [p.road_detour_km for p in detour_points] or [0.0]
    underests = [p.detour_underestimation_km for p in detour_points] or [0.0]
    disagreements = sum(1 for p in detour_points if p.feasibility_disagreement)

    return RoadBenchmarkReport(
        total_pairs_evaluated=len(route_points),
        mean_circuity_factor=round(sum(circuities) / len(circuities), 3),
        max_circuity_factor=round(max(circuities), 3),
        min_circuity_factor=round(min(circuities), 3),
        mean_road_distance_km=round(sum(roads) / len(roads), 3),
        mean_euclidean_distance_km=round(sum(eucs) / len(eucs), 3),
        mean_geometric_detour_km=round(sum(geom_dets) / len(geom_dets), 3),
        mean_road_detour_km=round(sum(road_dets) / len(road_dets), 3),
        mean_detour_underestimation_km=round(sum(underests) / len(underests), 3),
        feasibility_disagreement_count=disagreements,
        feasibility_disagreement_rate=round(disagreements / len(detour_points), 3) if detour_points else 0.0,
        route_points=tuple(route_points),
        detour_points=tuple(detour_points),
    )
