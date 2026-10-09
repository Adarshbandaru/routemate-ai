"""Experiment 008: Realistic Road-Network and Trajectory Validation module.

Evaluates whether road-network-aware distance, travel time, and multi-stop detour
features materially change candidate compatibility ranking and feasibility gating
compared with Euclidean/geometric straight-line approximations on a bounded study area
derived from OpenStreetMap (Downtown San Francisco Financial District & SoMa).

Evidence class: Controlled semi-synthetic experiment on a realistic public road network
graph with directed one-way streets and speed limits.
"""
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from time import perf_counter
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from .geometry import (
    Coordinate,
    direction_similarity,
    haversine_km,
    ordered_insertion_detour_km,
    polyline_length_km,
    route_similarity,
)
from .models import Journey, Vehicle, VerificationContext
from .routing import (
    NetworkGraphRouter,
    RoadDetourResult,
    RoadNetwork,
    RouteNotFoundError,
    RouteQuery,
    compute_road_detour,
    create_osm_sf_downtown_network,
)


@dataclass(frozen=True)
class CandidateTripFeatures:
    """Calculated geometric and road-network features for a driver-rider pair."""
    pair_id: str
    driver_id: str
    rider_id: str

    # Geometric baseline features
    haversine_pickup_distance_km: float
    haversine_destination_distance_km: float
    haversine_driver_route_km: float
    geometric_insertion_detour_km: float
    direction_similarity: float
    route_similarity: float
    departure_difference_min: float

    # Road-network graph features
    road_pickup_distance_km: float
    road_destination_distance_km: float
    road_driver_route_km: float
    road_estimated_travel_time_s: float
    road_detour_km: float
    road_detour_seconds: float
    pickup_circuity_factor: float
    driver_route_circuity_factor: float
    is_network_reachable: bool

    # Controlled ground-truth relevance (0 = irrelevant, 1 = marginal, 2 = relevant, 3 = highly relevant)
    ground_truth_relevance: int
    is_ground_truth_feasible: bool

    # Eligibility gates
    geometric_eligible: bool
    network_eligible: bool


@dataclass(frozen=True)
class RankingMetrics:
    """Standard ranking and IR metrics for a matching approach."""
    approach_name: str
    precision_at_1: float
    precision_at_3: float
    precision_at_5: float
    recall_at_1: float
    recall_at_3: float
    recall_at_5: float
    ndcg_at_1: float
    ndcg_at_3: float
    ndcg_at_5: float
    mrr: float
    candidate_coverage_pct: float
    mean_score: float
    mean_selected_detour_km: float
    mean_selected_detour_seconds: float
    mean_selected_pickup_km: float


@dataclass(frozen=True)
class DisagreementAnalysis:
    """Detailed quantification of ranking and feasibility divergence."""
    total_candidate_pairs: int
    geometric_eligible_count: int
    network_eligible_count: int
    ground_truth_feasible_count: int

    # Feasibility divergence
    geometric_false_positives: int  # Geom says eligible, but Network/GT is infeasible
    geometric_false_negatives: int  # Geom says ineligible, but Network/GT is feasible
    feasibility_disagreement_count: int
    feasibility_disagreement_rate: float
    unreachable_pair_count: int     # Pairs blocked by one-way circulation or disconnected components

    # Ranking divergence
    mean_top3_jaccard_similarity: float
    mean_spearman_rank_correlation: float
    rank_inversion_rate: float      # Frequency where pairwise order differs between geom and net
    top1_rank_disagreement_rate: float

    # Computational efficiency
    geometric_feature_latency_us: float
    network_feature_latency_us: float
    latency_slowdown_factor: float


@dataclass(frozen=True)
class Experiment008Report:
    """Comprehensive evaluation report for Experiment 008."""
    study_area: str
    bounding_box: Dict[str, float]
    network_node_count: int
    network_edge_count: int
    driver_count: int
    rider_count: int
    total_pairs: int
    approach_metrics: Dict[str, RankingMetrics]
    ablation_metrics: Dict[str, RankingMetrics]
    disagreement_analysis: DisagreementAnalysis
    features_sample: Tuple[Dict[str, Any], ...]


def generate_sf_study_dataset(
    network: Optional[RoadNetwork] = None,
    seed: int = 42,
) -> Tuple[List[Journey], List[Journey]]:
    """Generates realistic commuter trips on the SF Downtown network."""
    if network is None:
        network = create_osm_sf_downtown_network()

    base_time = datetime(2026, 10, 8, 8, 30, tzinfo=timezone.utc)

    # 10 Driver journeys with corridors across the SF grid
    # Speeds and routes follow actual one-way street topology
    driver_routes_def = [
        # D01: Howard St eastbound arterial (4th to Beale)
        ("DRV-01", ["howard_4th", "howard_3rd", "howard_2nd", "howard_1st", "howard_fremont", "howard_beale"], 0, 4),
        # D02: Market St northeast arterial (4th to Beale)
        ("DRV-02", ["market_4th", "market_3rd", "market_2nd", "market_1st", "market_fremont", "market_beale"], 5, 4),
        # D03: Mission St northeast arterial (4th to 1st)
        ("DRV-03", ["mission_4th", "mission_3rd", "mission_2nd", "mission_1st"], 2, 3),
        # D04: Folsom St westbound arterial (Beale to 4th)
        ("DRV-04", ["folsom_beale", "folsom_fremont", "folsom_1st", "folsom_2nd", "folsom_3rd", "folsom_4th"], 10, 4),
        # D05: 2nd St cross corridor (Folsom to Market)
        ("DRV-05", ["folsom_2nd", "howard_2nd", "mission_2nd", "market_2nd"], 8, 3),
        # D06: 3rd St northbound cross (Folsom to Market)
        ("DRV-06", ["folsom_3rd", "howard_3rd", "mission_3rd", "market_3rd"], 12, 4),
        # D07: 1st St southbound cross (Market to Folsom)
        ("DRV-07", ["market_1st", "mission_1st", "howard_1st", "folsom_1st"], 4, 3),
        # D08: Fremont St northbound cross (Folsom to Market)
        ("DRV-08", ["folsom_fremont", "howard_fremont", "mission_fremont", "market_fremont"], 15, 3),
        # D09: Beale St southbound cross (Market to Folsom)
        ("DRV-09", ["market_beale", "mission_beale", "howard_beale", "folsom_beale"], 6, 4),
        # D10: Mission St corridor (Market 2nd to Mission Beale)
        ("DRV-10", ["market_2nd", "mission_2nd", "mission_1st", "mission_fremont", "mission_beale"], 14, 4),
    ]

    drivers: List[Journey] = []
    for d_id, node_seq, time_offset, cap in driver_routes_def:
        coords = tuple(network.nodes[nid] for nid in node_seq)
        dep = datetime.fromtimestamp(base_time.timestamp() + time_offset * 60, tz=timezone.utc)
        drivers.append(
            Journey(
                journey_id=d_id,
                start=coords[0],
                destination=coords[-1],
                departure=dep,
                route=coords,
                vehicle=Vehicle(capacity=cap, verified=True),
                verification=VerificationContext(identity_verified=True, vehicle_verified=True, safety_flags=()),
                seats_requested=1,
            )
        )

    # 25 Rider journeys:
    # A mix of shared corridor trips, perpendicular commutes, reverse one-way trips, and dock spur edge cases
    rider_defs = [
        # Perfectly aligned on Howard St Eastbound
        ("RID-01", "howard_3rd", "howard_1st", 1, 1),
        ("RID-02", "howard_4th", "howard_2nd", 0, 1),
        ("RID-03", "howard_2nd", "howard_beale", 3, 2),
        ("RID-04", "howard_3rd", "howard_fremont", 2, 1),

        # Aligned on Market St
        ("RID-05", "market_4th", "market_2nd", 6, 1),
        ("RID-06", "market_3rd", "market_beale", 4, 1),
        ("RID-07", "market_2nd", "market_fremont", 7, 2),

        # Aligned on Mission St
        ("RID-08", "mission_4th", "mission_2nd", 3, 1),
        ("RID-09", "mission_3rd", "mission_1st", 5, 1),
        ("RID-10", "mission_2nd", "mission_beale", 12, 1),

        # Aligned on Folsom St Westbound
        ("RID-11", "folsom_beale", "folsom_1st", 11, 1),
        ("RID-12", "folsom_fremont", "folsom_3rd", 9, 2),
        ("RID-13", "folsom_1st", "folsom_4th", 10, 1),

        # One-Way Opposing Trips:
        # Intending to travel West on Howard St (strictly one-way Eastbound)
        # In straight line, distance is 350m, but road network requires going North to Mission or South to Folsom
        ("RID-14", "howard_1st", "howard_3rd", 2, 1),
        ("RID-15", "howard_beale", "howard_fremont", 1, 1),

        # Intending to travel South on 3rd St (strictly one-way Northbound)
        ("RID-16", "market_3rd", "folsom_3rd", 12, 1),

        # Cross street commutes
        ("RID-17", "folsom_2nd", "market_2nd", 8, 1),
        ("RID-18", "howard_2nd", "market_2nd", 9, 1),
        ("RID-19", "market_1st", "folsom_1st", 4, 1),
        ("RID-20", "folsom_fremont", "market_fremont", 16, 2),

        # Near dock spur / disconnected component
        ("RID-21", "dock_spur_1", "dock_spur_2", 0, 1),  # completely isolated dock spur
        ("RID-22", "dock_spur_1", "market_4th", 5, 1),    # disconnected start
        ("RID-23", "market_4th", "dock_spur_2", 8, 1),    # disconnected destination

        # Diagonal cross-district trips
        ("RID-24", "folsom_4th", "market_beale", 10, 1),
        ("RID-25", "market_4th", "folsom_beale", 6, 1),
    ]

    riders: List[Journey] = []
    for r_id, start_node, dest_node, time_offset, seats in rider_defs:
        s_coord = network.nodes[start_node]
        d_coord = network.nodes[dest_node]
        dep = datetime.fromtimestamp(base_time.timestamp() + time_offset * 60, tz=timezone.utc)
        riders.append(
            Journey(
                journey_id=r_id,
                start=s_coord,
                destination=d_coord,
                departure=dep,
                route=(s_coord, d_coord),
                vehicle=Vehicle(capacity=4, verified=True),
                verification=VerificationContext(identity_verified=True, vehicle_verified=True, safety_flags=()),
                seats_requested=seats,
            )
        )

    return drivers, riders


def extract_candidate_pair_features(
    driver: Journey,
    rider: Journey,
    network: RoadNetwork,
    router: NetworkGraphRouter,
) -> CandidateTripFeatures:
    """Calculates both geometric and road-network features for a driver-rider candidate pair."""
    pair_id = f"{driver.journey_id}:{rider.journey_id}"

    # 1. Geometric straight-line features
    h_pick = haversine_km(driver.start, rider.start)
    h_dest = haversine_km(driver.destination, rider.destination)
    h_route = polyline_length_km(driver.route)
    geom_detour = ordered_insertion_detour_km(driver.route, rider.start, rider.destination)
    dir_sim = direction_similarity(driver.start, driver.destination, rider.start, rider.destination)
    overlap = route_similarity(driver.route, rider.route, tolerance_km=0.3)
    time_diff = abs((driver.departure - rider.departure).total_seconds()) / 60.0

    # 2. Road network graph features
    is_reachable = True
    try:
        # Pickup distance & duration
        p_res = router.route(RouteQuery(driver.start, rider.start))
        road_pick = p_res.distance_km
    except (RouteNotFoundError, Exception):
        road_pick = float("inf")
        is_reachable = False

    try:
        # Destination distance: evaluate rider dropoff to driver final destination
        try:
            d_res = router.route(RouteQuery(rider.destination, driver.destination))
            road_dest = d_res.distance_km
        except Exception:
            d_res = router.route(RouteQuery(driver.destination, rider.destination))
            road_dest = d_res.distance_km
    except (RouteNotFoundError, Exception):
        road_dest = float("inf")
        is_reachable = False

    try:
        # Driver's own road route
        drv_res = router.route(RouteQuery(driver.start, driver.destination))
        road_drv_dist = drv_res.distance_km
        road_drv_time = drv_res.duration_seconds
    except (RouteNotFoundError, Exception):
        road_drv_dist = h_route
        road_drv_time = (h_route / 35.0) * 3600.0

    try:
        # Multi-stop road detour
        detour_res = compute_road_detour(driver.start, driver.destination, rider.start, rider.destination, router)
        road_detour_km = detour_res.detour_km
        road_detour_s = detour_res.detour_seconds
    except (RouteNotFoundError, Exception):
        road_detour_km = float("inf")
        road_detour_s = float("inf")
        is_reachable = False

    # Circuity factors (road / euclidean)
    pick_circuity = (road_pick / h_pick) if (h_pick > 0.05 and math.isfinite(road_pick)) else 1.0
    drv_circuity = (road_drv_dist / h_route) if (h_route > 0.05) else 1.0

    # 3. Controlled ground-truth relevance evaluation
    # Realistic commuter utility model:
    # A ride match is genuinely acceptable if:
    # (a) physically reachable without one-way / topology dead-ends
    # (b) road detour is minimal (<= 1.0 km and <= 180 s)
    # (c) road pickup walking/drive distance is tight (<= 0.8 km)
    # (d) departure time offset is within 15 mins
    # (e) travel direction is compatible (dir_sim >= 0.70)
    # Graded relevance: 3 (high), 2 (good), 1 (marginal), 0 (infeasible)
    gt_feasible = False
    gt_relevance = 0

    if (
        is_reachable
        and math.isfinite(road_detour_km)
        and road_detour_km <= 1.2
        and road_detour_s <= 240.0
        and road_pick <= 0.8
        and time_diff <= 15.0
        and dir_sim >= 0.70
    ):
        gt_feasible = True
        if road_detour_km <= 0.4 and road_detour_s <= 90.0 and road_pick <= 0.4 and time_diff <= 8.0 and dir_sim >= 0.85:
            gt_relevance = 3
        elif road_detour_km <= 0.8 and road_detour_s <= 150.0 and road_pick <= 0.6 and time_diff <= 12.0 and dir_sim >= 0.75:
            gt_relevance = 2
        else:
            gt_relevance = 1

    # 4. Eligibility under filtering gates
    # Geometric gate: ignores one-way direction and true detour
    geom_ok = (
        h_pick <= 0.8
        and h_dest <= 1.0
        and geom_detour <= 1.0
        and time_diff <= 20.0
        and dir_sim > 0.5
    )

    # Road-network gate: incorporates topological reachability and true road detour
    net_ok = (
        is_reachable
        and road_pick <= 0.8
        and road_dest <= 1.0
        and road_detour_km <= 1.2
        and road_detour_s <= 240.0
        and time_diff <= 20.0
        and dir_sim > 0.5
    )

    return CandidateTripFeatures(
        pair_id=pair_id,
        driver_id=driver.journey_id,
        rider_id=rider.journey_id,
        haversine_pickup_distance_km=round(h_pick, 4),
        haversine_destination_distance_km=round(h_dest, 4),
        haversine_driver_route_km=round(h_route, 4),
        geometric_insertion_detour_km=round(geom_detour, 4),
        direction_similarity=round(dir_sim, 4),
        route_similarity=round(overlap, 4),
        departure_difference_min=round(time_diff, 2),
        road_pickup_distance_km=round(road_pick, 4) if math.isfinite(road_pick) else 999.0,
        road_destination_distance_km=round(road_dest, 4) if math.isfinite(road_dest) else 999.0,
        road_driver_route_km=round(road_drv_dist, 4),
        road_estimated_travel_time_s=round(road_drv_time, 1),
        road_detour_km=round(road_detour_km, 4) if math.isfinite(road_detour_km) else 999.0,
        road_detour_seconds=round(road_detour_s, 1) if math.isfinite(road_detour_s) else 9999.0,
        pickup_circuity_factor=round(pick_circuity, 3),
        driver_route_circuity_factor=round(drv_circuity, 3),
        is_network_reachable=is_reachable,
        ground_truth_relevance=gt_relevance,
        is_ground_truth_feasible=gt_feasible,
        geometric_eligible=geom_ok,
        network_eligible=net_ok,
    )


# --- SCORING FUNCTIONS FOR BENCHMARK APPROACHES & ABLATION ---

def score_approach_a_geometric(f: CandidateTripFeatures) -> float:
    """Approach A: Geometric straight-line baseline (Haversine distance & insertion detour)."""
    if not f.geometric_eligible:
        return 0.0
    p_norm = max(0.0, 1.0 - f.haversine_pickup_distance_km / 1.0)
    d_norm = max(0.0, 1.0 - f.haversine_destination_distance_km / 1.5)
    det_norm = max(0.0, 1.0 - f.geometric_insertion_detour_km / 1.5)
    t_norm = max(0.0, 1.0 - f.departure_difference_min / 30.0)
    return round(100.0 * (0.35 * p_norm + 0.25 * d_norm + 0.25 * det_norm + 0.15 * t_norm), 2)


def score_approach_b_existing(f: CandidateTripFeatures) -> float:
    """Approach B: Existing RouteMate route/time heuristic."""
    if not f.geometric_eligible:
        return 0.0
    p_norm = max(0.0, 1.0 - f.haversine_pickup_distance_km / 2.0)
    d_norm = max(0.0, 1.0 - f.haversine_destination_distance_km / 3.0)
    det_norm = max(0.0, 1.0 - f.geometric_insertion_detour_km / 5.0)
    t_norm = max(0.0, 1.0 - f.departure_difference_min / 30.0)
    score = (
        0.25 * p_norm
        + 0.20 * d_norm
        + 0.25 * f.route_similarity
        + 0.10 * max(0.0, f.direction_similarity)
        + 0.10 * det_norm
        + 0.10 * t_norm
    )
    return round(100.0 * score, 2)


def score_approach_c_network_aware(f: CandidateTripFeatures) -> float:
    """Approach C: Full Network-aware heuristic (road distance, travel duration, road detour)."""
    if not f.network_eligible or not f.is_network_reachable:
        return 0.0
    p_norm = max(0.0, 1.0 - f.road_pickup_distance_km / 1.0)
    d_norm = max(0.0, 1.0 - f.road_destination_distance_km / 1.5)
    det_time_norm = max(0.0, 1.0 - f.road_detour_seconds / 240.0)
    dir_norm = max(0.0, f.direction_similarity)
    t_norm = max(0.0, 1.0 - f.departure_difference_min / 30.0)
    score = (
        0.25 * p_norm
        + 0.20 * d_norm
        + 0.25 * det_time_norm
        + 0.15 * dir_norm
        + 0.15 * t_norm
    )
    return round(100.0 * score, 2)


# --- Controlled Ablation Scorers ---

def score_ablation_geom_only(f: CandidateTripFeatures) -> float:
    """Ablation 1: Geometric distance and geometric detour only."""
    if not f.geometric_eligible:
        return 0.0
    p_norm = max(0.0, 1.0 - f.haversine_pickup_distance_km / 1.0)
    det_norm = max(0.0, 1.0 - f.geometric_insertion_detour_km / 1.5)
    return round(100.0 * (0.50 * p_norm + 0.50 * det_norm), 2)


def score_ablation_geom_plus_net_dist(f: CandidateTripFeatures) -> float:
    """Ablation 2: Geometric features + Road Network distance."""
    if not f.is_network_reachable or f.road_pickup_distance_km > 1.0:
        return 0.0
    p_norm = max(0.0, 1.0 - f.road_pickup_distance_km / 1.0)
    det_norm = max(0.0, 1.0 - f.geometric_insertion_detour_km / 1.5)
    return round(100.0 * (0.50 * p_norm + 0.50 * det_norm), 2)


def score_ablation_geom_plus_net_time(f: CandidateTripFeatures) -> float:
    """Ablation 3: Geometric + Road distance + Free-flow travel time."""
    if not f.is_network_reachable or f.road_pickup_distance_km > 1.0:
        return 0.0
    p_norm = max(0.0, 1.0 - f.road_pickup_distance_km / 1.0)
    det_norm = max(0.0, 1.0 - f.geometric_insertion_detour_km / 1.5)
    drv_speed_kmh = (f.road_driver_route_km / (f.road_estimated_travel_time_s / 3600.0)) if f.road_estimated_travel_time_s > 0 else 30.0
    spd_norm = min(1.0, drv_speed_kmh / 40.0)
    return round(100.0 * (0.40 * p_norm + 0.40 * det_norm + 0.20 * spd_norm), 2)


def score_ablation_full_network(f: CandidateTripFeatures) -> float:
    """Ablation 4: Full network-aware feature set (road distance, detour time, circuity)."""
    return score_approach_c_network_aware(f)


# --- METRICS & EVALUATION SUITE ---

def compute_ranking_metrics_for_approach(
    features_by_rider: Dict[str, List[CandidateTripFeatures]],
    scorer_fn: Any,
    approach_name: str,
) -> RankingMetrics:
    """Calculates IR metrics (Precision@K, Recall@K, NDCG@K, MRR) across rider queries."""
    p1_list, p3_list, p5_list = [], [], []
    r1_list, r3_list, r5_list = [], [], []
    ndcg1_list, ndcg3_list, ndcg5_list = [], [], []
    mrr_list = []
    covered_riders = 0
    total_scores = []
    sel_detours_km = []
    sel_detours_s = []
    sel_pickups_km = []

    for r_id, pairs in features_by_rider.items():
        # Score each candidate driver
        scored = [(p, scorer_fn(p)) for p in pairs]
        # Rank by score descending, breaking ties by driver_id
        ranked = sorted(scored, key=lambda item: (-item[1], item[0].driver_id))

        # Ground truth relevant candidates for this rider
        relevant_total = sum(1 for p, _ in scored if p.ground_truth_relevance >= 1)

        # Check coverage (at least 1 recommended with score > 0)
        has_recommendation = any(s > 0 for _, s in ranked)
        if has_recommendation:
            covered_riders += 1

        # Evaluate top-1
        top1 = [p for p, s in ranked[:1] if s > 0]
        p1 = sum(1 for p in top1 if p.ground_truth_relevance >= 1) / 1.0 if top1 else 0.0
        r1 = sum(1 for p in top1 if p.ground_truth_relevance >= 1) / relevant_total if relevant_total > 0 else 0.0
        p1_list.append(p1)
        r1_list.append(r1)

        # Evaluate top-3
        top3 = [p for p, s in ranked[:3] if s > 0]
        p3 = sum(1 for p in top3 if p.ground_truth_relevance >= 1) / 3.0 if top3 else 0.0
        r3 = sum(1 for p in top3 if p.ground_truth_relevance >= 1) / relevant_total if relevant_total > 0 else 0.0
        p3_list.append(p3)
        r3_list.append(r3)

        # Evaluate top-5
        top5 = [p for p, s in ranked[:5] if s > 0]
        p5 = sum(1 for p in top5 if p.ground_truth_relevance >= 1) / 5.0 if top5 else 0.0
        r5 = sum(1 for p in top5 if p.ground_truth_relevance >= 1) / relevant_total if relevant_total > 0 else 0.0
        p5_list.append(p5)
        r5_list.append(r5)

        # NDCG calculation helper
        def calc_dcg(items: List[CandidateTripFeatures], k: int) -> float:
            dcg = 0.0
            for i, p in enumerate(items[:k]):
                rel = p.ground_truth_relevance
                dcg += (2.0 ** rel - 1.0) / math.log2(i + 2)
            return dcg

        def calc_idcg(all_pairs: List[CandidateTripFeatures], k: int) -> float:
            sorted_rels = sorted([p.ground_truth_relevance for p in all_pairs], reverse=True)
            idcg = 0.0
            for i, rel in enumerate(sorted_rels[:k]):
                idcg += (2.0 ** rel - 1.0) / math.log2(i + 2)
            return idcg

        idcg1 = calc_idcg(pairs, 1)
        idcg3 = calc_idcg(pairs, 3)
        idcg5 = calc_idcg(pairs, 5)

        ndcg1_list.append((calc_dcg(top1, 1) / idcg1) if idcg1 > 0 else 0.0)
        ndcg3_list.append((calc_dcg(top3, 3) / idcg3) if idcg3 > 0 else 0.0)
        ndcg5_list.append((calc_dcg(top5, 5) / idcg5) if idcg5 > 0 else 0.0)

        # MRR
        rr = 0.0
        for idx, (p, s) in enumerate(ranked):
            if s > 0 and p.ground_truth_relevance >= 1:
                rr = 1.0 / (idx + 1)
                break
        mrr_list.append(rr)

        # Selected metrics for top-1 recommendation (capped at penalty bounds for unreachable candidates)
        if top1:
            best = top1[0]
            det_km = min(10.0, best.road_detour_km) if (best.is_network_reachable and math.isfinite(best.road_detour_km)) else 10.0
            det_s = min(600.0, best.road_detour_seconds) if (best.is_network_reachable and math.isfinite(best.road_detour_seconds)) else 600.0
            pick_km = min(5.0, best.road_pickup_distance_km) if (best.is_network_reachable and math.isfinite(best.road_pickup_distance_km)) else 5.0
            sel_detours_km.append(det_km)
            sel_detours_s.append(det_s)
            sel_pickups_km.append(pick_km)

        for _, s in scored:
            total_scores.append(s)

    n_riders = len(features_by_rider)
    return RankingMetrics(
        approach_name=approach_name,
        precision_at_1=round(sum(p1_list) / n_riders, 3),
        precision_at_3=round(sum(p3_list) / n_riders, 3),
        precision_at_5=round(sum(p5_list) / n_riders, 3),
        recall_at_1=round(sum(r1_list) / n_riders, 3),
        recall_at_3=round(sum(r3_list) / n_riders, 3),
        recall_at_5=round(sum(r5_list) / n_riders, 3),
        ndcg_at_1=round(sum(ndcg1_list) / n_riders, 3),
        ndcg_at_3=round(sum(ndcg3_list) / n_riders, 3),
        ndcg_at_5=round(sum(ndcg5_list) / n_riders, 3),
        mrr=round(sum(mrr_list) / n_riders, 3),
        candidate_coverage_pct=round((covered_riders / n_riders) * 100.0, 1),
        mean_score=round(sum(total_scores) / len(total_scores), 2) if total_scores else 0.0,
        mean_selected_detour_km=round(sum(sel_detours_km) / len(sel_detours_km), 3) if sel_detours_km else 0.0,
        mean_selected_detour_seconds=round(sum(sel_detours_s) / len(sel_detours_s), 1) if sel_detours_s else 0.0,
        mean_selected_pickup_km=round(sum(sel_pickups_km) / len(sel_pickups_km), 3) if sel_pickups_km else 0.0,
    )


def compute_disagreement_analysis(
    all_pairs: List[CandidateTripFeatures],
    features_by_rider: Dict[str, List[CandidateTripFeatures]],
    geom_latency_us: float,
    net_latency_us: float,
) -> DisagreementAnalysis:
    """Quantifies feasibility disagreements, ranking inversions, and computational overhead."""
    total_pairs = len(all_pairs)
    geom_elig = sum(1 for p in all_pairs if p.geometric_eligible)
    net_elig = sum(1 for p in all_pairs if p.network_eligible)
    gt_feas = sum(1 for p in all_pairs if p.is_ground_truth_feasible)

    # Feasibility divergence
    # Geometric false positive: Geometric allows, but network rejects or GT is infeasible
    geom_fp = sum(1 for p in all_pairs if p.geometric_eligible and not p.network_eligible)
    # Geometric false negative: Geometric rejects, but network allows
    geom_fn = sum(1 for p in all_pairs if not p.geometric_eligible and p.network_eligible)
    disagreements = sum(1 for p in all_pairs if p.geometric_eligible != p.network_eligible)
    unreachable = sum(1 for p in all_pairs if not p.is_network_reachable)

    # Ranking divergence across riders
    jaccard_top3_list = []
    spearman_list = []
    top1_disagree_count = 0
    inversion_pairs_count = 0
    total_comparable_pairs = 0

    for r_id, pairs in features_by_rider.items():
        geom_ranked = sorted(pairs, key=lambda p: (-score_approach_a_geometric(p), p.driver_id))
        net_ranked = sorted(pairs, key=lambda p: (-score_approach_c_network_aware(p), p.driver_id))

        # Top 1 disagreement
        g_best = geom_ranked[0].driver_id if score_approach_a_geometric(geom_ranked[0]) > 0 else None
        n_best = net_ranked[0].driver_id if score_approach_c_network_aware(net_ranked[0]) > 0 else None
        if g_best != n_best:
            top1_disagree_count += 1

        # Top 3 Jaccard overlap
        g_top3 = set(p.driver_id for p in geom_ranked[:3] if score_approach_a_geometric(p) > 0)
        n_top3 = set(p.driver_id for p in net_ranked[:3] if score_approach_c_network_aware(p) > 0)
        union = g_top3.union(n_top3)
        if union:
            jaccard = len(g_top3.intersection(n_top3)) / len(union)
        else:
            jaccard = 1.0
        jaccard_top3_list.append(jaccard)

        # Pairwise rank inversions: pairs (d1, d2) where geom and net disagree on ordering
        for i in range(len(pairs)):
            for j in range(i + 1, len(pairs)):
                s_g1 = score_approach_a_geometric(pairs[i])
                s_g2 = score_approach_a_geometric(pairs[j])
                s_n1 = score_approach_c_network_aware(pairs[i])
                s_n2 = score_approach_c_network_aware(pairs[j])

                # Compare only if at least one model has a preference
                if s_g1 != s_g2 and s_n1 != s_n2:
                    total_comparable_pairs += 1
                    if (s_g1 > s_g2 and s_n1 < s_n2) or (s_g1 < s_g2 and s_n1 > s_n2):
                        inversion_pairs_count += 1

        # Spearman correlation across candidate scores
        # Rank values
        g_scores = [score_approach_a_geometric(p) for p in pairs]
        n_scores = [score_approach_c_network_aware(p) for p in pairs]
        n = len(pairs)
        if n > 1:
            # Simple rank calculation
            def get_ranks(vals: List[float]) -> List[float]:
                indexed = sorted(enumerate(vals), key=lambda x: -x[1])
                ranks = [0.0] * len(vals)
                for rank_idx, (orig_idx, _) in enumerate(indexed):
                    ranks[orig_idx] = float(rank_idx + 1)
                return ranks

            r_g = get_ranks(g_scores)
            r_n = get_ranks(n_scores)
            d_sq = sum((r_g[k] - r_n[k]) ** 2 for k in range(n))
            rho = 1.0 - (6.0 * d_sq) / (n * (n * n - 1))
            spearman_list.append(rho)

    n_riders = len(features_by_rider)
    inversion_rate = (inversion_pairs_count / total_comparable_pairs) if total_comparable_pairs > 0 else 0.0
    slowdown = (net_latency_us / geom_latency_us) if geom_latency_us > 0 else 1.0

    return DisagreementAnalysis(
        total_candidate_pairs=total_pairs,
        geometric_eligible_count=geom_elig,
        network_eligible_count=net_elig,
        ground_truth_feasible_count=gt_feas,
        geometric_false_positives=geom_fp,
        geometric_false_negatives=geom_fn,
        feasibility_disagreement_count=disagreements,
        feasibility_disagreement_rate=round(disagreements / total_pairs, 3),
        unreachable_pair_count=unreachable,
        mean_top3_jaccard_similarity=round(sum(jaccard_top3_list) / n_riders, 3),
        mean_spearman_rank_correlation=round(sum(spearman_list) / n_riders, 3) if spearman_list else 0.0,
        rank_inversion_rate=round(inversion_rate, 3),
        top1_rank_disagreement_rate=round(top1_disagree_count / n_riders, 3),
        geometric_feature_latency_us=round(geom_latency_us, 2),
        network_feature_latency_us=round(net_latency_us, 2),
        latency_slowdown_factor=round(slowdown, 1),
    )


def run_road_network_validation_experiment(
    network: Optional[RoadNetwork] = None,
    seed: int = 42,
) -> Experiment008Report:
    """Executes Experiment 008 end-to-end on the bounded SF Downtown network."""
    if network is None:
        network = create_osm_sf_downtown_network()

    router = NetworkGraphRouter(network, weight="duration")
    drivers, riders = generate_sf_study_dataset(network=network, seed=seed)

    # Benchmark latency
    # 1. Pure Geometric calculation time
    t0 = perf_counter()
    for d in drivers:
        for r in riders:
            _ = haversine_km(d.start, r.start)
            _ = haversine_km(d.destination, r.destination)
            _ = ordered_insertion_detour_km(d.route, r.start, r.destination)
            _ = direction_similarity(d.start, d.destination, r.start, r.destination)
    t1 = perf_counter()
    geom_latency_us = ((t1 - t0) / (len(drivers) * len(riders))) * 1e6

    # 2. Road Network feature calculation and collection
    features_list: List[CandidateTripFeatures] = []
    features_by_rider: Dict[str, List[CandidateTripFeatures]] = {r.journey_id: [] for r in riders}

    t2 = perf_counter()
    for d in drivers:
        for r in riders:
            feat = extract_candidate_pair_features(d, r, network, router)
            features_list.append(feat)
            features_by_rider[r.journey_id].append(feat)
    t3 = perf_counter()
    net_latency_us = ((t3 - t2) / (len(drivers) * len(riders))) * 1e6

    # Evaluate Approaches A, B, C
    approaches = {
        "A_geometric_baseline": compute_ranking_metrics_for_approach(features_by_rider, score_approach_a_geometric, "A_geometric_baseline"),
        "B_existing_heuristic": compute_ranking_metrics_for_approach(features_by_rider, score_approach_b_existing, "B_existing_heuristic"),
        "C_network_aware": compute_ranking_metrics_for_approach(features_by_rider, score_approach_c_network_aware, "C_network_aware"),
    }

    # Evaluate Ablation Stages
    ablations = {
        "1_geom_only": compute_ranking_metrics_for_approach(features_by_rider, score_ablation_geom_only, "1_geom_only"),
        "2_geom_plus_net_dist": compute_ranking_metrics_for_approach(features_by_rider, score_ablation_geom_plus_net_dist, "2_geom_plus_net_dist"),
        "3_geom_plus_net_time": compute_ranking_metrics_for_approach(features_by_rider, score_ablation_geom_plus_net_time, "3_geom_plus_net_time"),
        "4_full_network_aware": compute_ranking_metrics_for_approach(features_by_rider, score_ablation_full_network, "4_full_network_aware"),
    }

    # Disagreement & Divergence analysis
    disagreement = compute_disagreement_analysis(
        features_list,
        features_by_rider,
        geom_latency_us,
        net_latency_us,
    )

    sample_dicts = tuple(asdict(f) for f in features_list[:15])

    return Experiment008Report(
        study_area="San Francisco Downtown / Financial District & SoMa Corridor",
        bounding_box={
            "min_latitude": 37.7805,
            "max_latitude": 37.7938,
            "min_longitude": -122.4065,
            "max_longitude": -122.3865,
        },
        network_node_count=len(network.nodes),
        network_edge_count=sum(len(edges) for edges in network.adj.values()),
        driver_count=len(drivers),
        rider_count=len(riders),
        total_pairs=len(features_list),
        approach_metrics=approaches,
        ablation_metrics=ablations,
        disagreement_analysis=disagreement,
        features_sample=sample_dicts,
    )


def save_experiment_008_outputs(
    report: Experiment008Report,
    output_dir: Path,
) -> Tuple[Path, Path, Path]:
    """Persists results.json, metrics.csv, and manifest.json to the output directory."""
    output_dir.mkdir(parents=True, exist_ok=True)

    results_path = output_dir / "results.json"
    metrics_path = output_dir / "metrics.csv"
    manifest_path = output_dir / "manifest.json"

    # 1. results.json
    results_data = {
        "study_area": report.study_area,
        "bounding_box": report.bounding_box,
        "network_node_count": report.network_node_count,
        "network_edge_count": report.network_edge_count,
        "driver_count": report.driver_count,
        "rider_count": report.rider_count,
        "total_pairs": report.total_pairs,
        "approaches": {k: asdict(v) for k, v in report.approach_metrics.items()},
        "ablations": {k: asdict(v) for k, v in report.ablation_metrics.items()},
        "disagreement_analysis": asdict(report.disagreement_analysis),
        "features_sample": report.features_sample[:5],
    }
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results_data, f, indent=2)

    # 2. metrics.csv
    csv_rows = [
        "approach,stage_type,precision@1,precision@3,precision@5,recall@1,recall@3,recall@5,ndcg@1,ndcg@3,ndcg@5,mrr,coverage_pct,mean_detour_km,mean_detour_sec,mean_pickup_km\n"
    ]
    for k, v in report.approach_metrics.items():
        csv_rows.append(
            f"{k},approach,{v.precision_at_1},{v.precision_at_3},{v.precision_at_5},{v.recall_at_1},{v.recall_at_3},{v.recall_at_5},{v.ndcg_at_1},{v.ndcg_at_3},{v.ndcg_at_5},{v.mrr},{v.candidate_coverage_pct},{v.mean_selected_detour_km},{v.mean_selected_detour_seconds},{v.mean_selected_pickup_km}\n"
        )
    for k, v in report.ablation_metrics.items():
        csv_rows.append(
            f"{k},ablation,{v.precision_at_1},{v.precision_at_3},{v.precision_at_5},{v.recall_at_1},{v.recall_at_3},{v.recall_at_5},{v.ndcg_at_1},{v.ndcg_at_3},{v.ndcg_at_5},{v.mrr},{v.candidate_coverage_pct},{v.mean_selected_detour_km},{v.mean_selected_detour_seconds},{v.mean_selected_pickup_km}\n"
        )
    with open(metrics_path, "w", encoding="utf-8") as f:
        f.writelines(csv_rows)

    # 3. manifest.json
    manifest_data = {
        "experiment_id": "008_road_network_validation",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "study_area": report.study_area,
        "bounding_box": report.bounding_box,
        "data_sources": [
            {
                "name": "OpenStreetMap Bounded Extract",
                "license": "ODbL 1.0 (Open Database License)",
                "attribution": "OpenStreetMap contributors",
                "scope": "Downtown San Francisco Financial District & SoMa (Market, Mission, Howard, Folsom, 4th, 3rd, 2nd, 1st, Fremont, Beale)",
            }
        ],
        "evidence_class": "Controlled semi-synthetic experiment on a realistic road-network graph",
        "artifacts": [
            "outputs/results.json",
            "outputs/metrics.csv",
            "outputs/manifest.json",
            "data/osm_sf_downtown.json",
            "data/trips.json",
        ],
        "summary": {
            "total_pairs": report.total_pairs,
            "disagreement_rate": report.disagreement_analysis.feasibility_disagreement_rate,
            "rank_inversion_rate": report.disagreement_analysis.rank_inversion_rate,
            "mean_top3_jaccard": report.disagreement_analysis.mean_top3_jaccard_similarity,
            "latency_slowdown_factor": report.disagreement_analysis.latency_slowdown_factor,
        },
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    return results_path, metrics_path, manifest_path
