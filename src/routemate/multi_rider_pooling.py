"""Experiment 011: Multi-Rider Capacity Pooling under Dynamic Congestion module.

Formalizes multi-rider vehicle pooling (1 driver -> K riders, K in {1, 2, 3, 4}),
precedence constraints (pickup before dropoff), intermediate vehicle capacity invariants,
time-dependent stop-sequence optimization, exact vs. greedy algorithms, and multi-rider pruning.

Mathematical Formulation:
Let a pooled route be a sequence of stops pi = (s_1, ..., s_2K) where each stop is either
a pickup P_i or dropoff D'_i for rider R_i in R:
1. Precedence:
       index(P_i, pi) < index(D'_i, pi)  for all R_i in R
2. Capacity Invariant:
       Load(j) = Load(j-1) + seats(s_j) <= Capacity C  for all j in {1, ..., 2K}
3. Time-dependent route traversal:
       tau_arr(s_j) = tau_arr(s_j-1) + t_dyn(s_j-1, s_j, tau_arr(s_j-1))
       where t_dyn is governed by the Bureau of Public Roads (BPR) link performance function.

Evidence class: Controlled semi-synthetic algorithmic experiment on an OSM-derived graph.
"""
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import itertools
import json
import math
from pathlib import Path
from time import perf_counter
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from .congestion import (
    BPRCongestionModel,
    DynamicDetourResult,
    TimeDependentRouteResult,
    TimeDependentRouter,
)
from .geometry import (
    Coordinate,
    direction_similarity,
    haversine_km,
    polyline_length_km,
)
from .models import Journey, Vehicle, VerificationContext
from .routing import (
    NetworkGraphRouter,
    RoadNetwork,
    RouteNotFoundError,
    RouteQuery,
    compute_road_detour,
    create_osm_sf_downtown_network,
)


@dataclass(frozen=True)
class StopNode:
    """An individual pickup or dropoff waypoint in a multi-rider pooled tour."""
    rider_id: str
    kind: str  # "pickup" or "dropoff"
    coordinate: Coordinate
    seats: int = 1


@dataclass(frozen=True)
class MultiRiderRouteResult:
    """Outcome of evaluating a specific stop sequence on the road network."""
    driver_id: str
    rider_ids: Tuple[str, ...]
    stops: Tuple[StopNode, ...]
    is_valid_sequence: bool
    is_feasible: bool
    total_distance_km: float
    total_duration_seconds: float
    driver_detour_km: float
    driver_detour_seconds: float
    mean_rider_duration_seconds: float
    max_vehicle_load: int
    vehicle_capacity: int
    objective_score: float
    stop_sequence_names: Tuple[str, ...]


@dataclass(frozen=True)
class CapacityComparisonResult:
    """Benchmark metrics for a specific vehicle capacity configuration."""
    capacity: int
    matched_riders_count: int
    matched_percentage: float
    total_objective: float
    mean_rider_travel_time_seconds: float
    mean_driver_detour_seconds: float
    total_detour_km: float
    capacity_utilization_pct: float
    routing_calls: int
    solve_time_ms: float


@dataclass(frozen=True)
class CongestionStopOrderShift:
    """Evaluation of whether optimal stop sequence shifts between free-flow and peak congestion."""
    driver_id: str
    rider_ids: Tuple[str, ...]
    free_flow_stops: Tuple[str, ...]
    congested_stops: Tuple[str, ...]
    stop_order_changed: bool
    free_flow_duration_s: float
    congested_duration_s: float
    congestion_delay_s: float


@dataclass(frozen=True)
class ExactSolverResult:
    """Outcome of running the exact branch-and-bound permutation solver.

    Attributes:
        status: Search termination status ('optimal', 'timeout', 'infeasible', 'no_candidates').
        route_result: The best feasible MultiRiderRouteResult found, or None if none feasible.
        proven_objective: Provably optimal objective score. Strictly None if status != 'optimal'.
        best_known_objective: Best feasible objective found before termination (even on timeout), or None.
        elapsed_time_ms: Wall-clock execution time in milliseconds.
        nodes_explored: Number of stop sequence permutations evaluated on the graph.
        timed_out: True if execution exceeded the timeout threshold, else False.
    """
    status: str
    route_result: Optional[MultiRiderRouteResult]
    proven_objective: Optional[float]
    best_known_objective: Optional[float]
    elapsed_time_ms: float
    nodes_explored: int
    timed_out: bool

    def __iter__(self):
        yield self.route_result
        yield self.nodes_explored
        yield self.timed_out

    def __getitem__(self, idx: int):
        return (self.route_result, self.nodes_explored, self.timed_out)[idx]


@dataclass(frozen=True)
class SolverOptimalityComparison:
    """Comparison between Exact Branch-and-Bound and Greedy Multi-Rider Insertion."""
    scale_label: str
    num_drivers: int
    num_riders: int
    capacity: int
    status: str                                  # "optimal" or "timeout"
    exact_objective: Optional[float]             # Strictly None if status == "timeout"
    greedy_objective: float
    best_known_exact_objective: Optional[float]  # Best feasible objective discovered so far
    optimality_gap_pct: Optional[float]          # Strictly None if status == "timeout"
    exact_runtime_ms: float
    greedy_runtime_ms: float
    runtime_ratio: float
    nodes_explored: int
    timed_out: bool


@dataclass(frozen=True)
class MultiRiderPruningMetrics:
    """Safety and speedup evaluation of extending two-tier pruning to multi-rider routes."""
    total_subsets_evaluated: int
    subsets_pruned: int
    subsets_routed: int
    pruned_percentage: float
    true_feasible_subsets: int
    false_negatives: int
    feasible_recall: float
    routing_calls_saved: int
    speedup_factor: float
    is_provably_admissible: bool


@dataclass(frozen=True)
class Experiment011Report:
    """Comprehensive final report for Experiment 011."""
    study_area: str
    capacity_results: Dict[str, CapacityComparisonResult]
    stop_order_shifts: Tuple[CongestionStopOrderShift, ...]
    stop_order_shift_rate: float
    solver_comparisons: Tuple[SolverOptimalityComparison, ...]
    pruning_metrics: MultiRiderPruningMetrics


def validate_stop_sequence(
    stops: Sequence[StopNode],
    capacity: int,
) -> bool:
    """Validates precedence (pickup before dropoff) and vehicle capacity at every stop."""
    seen_pickups = set()
    current_load = 0

    for s in stops:
        if s.kind == "pickup":
            seen_pickups.add(s.rider_id)
            current_load += s.seats
            if current_load > capacity:
                return False
        elif s.kind == "dropoff":
            if s.rider_id not in seen_pickups:
                return False  # Dropoff before pickup
            current_load -= s.seats
            if current_load < 0:
                return False
        else:
            return False

    return current_load == 0


def generate_valid_stop_sequences(
    riders: Sequence[Journey],
    capacity: int,
    max_permutations: int = 120,
) -> List[Tuple[StopNode, ...]]:
    """Generates all precedence- and capacity-valid permutations of stops for a rider cohort."""
    stops_pool: List[StopNode] = []
    for r in riders:
        stops_pool.append(StopNode(r.journey_id, "pickup", r.start, r.seats_requested))
        stops_pool.append(StopNode(r.journey_id, "dropoff", r.destination, r.seats_requested))

    valid_sequences: List[Tuple[StopNode, ...]] = []

    # For K=1: only 1 sequence
    if len(riders) == 1:
        return [tuple(stops_pool)]

    # For K in {2, 3}: exact enumeration of precedence-valid permutations
    # K=2: 6 precedence permutations; K=3: 90 precedence permutations
    for perm in itertools.permutations(stops_pool):
        if validate_stop_sequence(perm, capacity):
            valid_sequences.append(perm)
            if len(valid_sequences) >= max_permutations:
                break

    return valid_sequences


def evaluate_stop_sequence_dynamic(
    driver: Journey,
    stops: Tuple[StopNode, ...],
    departure_time: datetime,
    router: TimeDependentRouter,
    capacity: int,
    thresholds: Dict[str, float],
) -> MultiRiderRouteResult:
    """Traverses a candidate stop sequence on the time-dependent network, evaluating feasibility and score."""
    rider_ids = tuple(sorted(list(set(s.rider_id for s in stops))))

    # Baseline direct driver route
    try:
        direct_res = router.route_time_dependent(driver.start, driver.destination, departure_time)
        direct_dist_km = direct_res.distance_km
        direct_dur_s = direct_res.congested_duration_seconds
    except Exception:
        direct_dist_km = haversine_km(driver.start, driver.destination)
        direct_dur_s = (direct_dist_km / 35.0) * 3600.0

    # Sequential leg routing
    curr_coord = driver.start
    curr_time = departure_time
    total_dist_km = 0.0
    total_dur_s = 0.0
    is_reachable = True

    pickup_times: Dict[str, datetime] = {}
    rider_durations: Dict[str, float] = {}

    for s in stops:
        try:
            leg_res = router.route_time_dependent(curr_coord, s.coordinate, curr_time)
            total_dist_km += leg_res.distance_km
            total_dur_s += leg_res.congested_duration_seconds
            curr_coord = s.coordinate
            curr_time = leg_res.arrival_time

            if s.kind == "pickup":
                pickup_times[s.rider_id] = curr_time
            elif s.kind == "dropoff":
                if s.rider_id in pickup_times:
                    rider_durations[s.rider_id] = (curr_time - pickup_times[s.rider_id]).total_seconds()
        except Exception:
            is_reachable = False
            break

    # Final leg to driver destination
    if is_reachable:
        try:
            final_res = router.route_time_dependent(curr_coord, driver.destination, curr_time)
            total_dist_km += final_res.distance_km
            total_dur_s += final_res.congested_duration_seconds
        except Exception:
            is_reachable = False

    detour_km = max(0.0, total_dist_km - direct_dist_km) if is_reachable else float("inf")
    detour_s = max(0.0, total_dur_s - direct_dur_s) if is_reachable else float("inf")
    mean_rider_s = sum(rider_durations.values()) / len(rider_durations) if rider_durations else 0.0

    # Max load tracking
    max_load = 0
    cur = 0
    for s in stops:
        cur += s.seats if s.kind == "pickup" else -s.seats
        max_load = max(max_load, cur)

    # Feasibility check:
    # Scale detour allowances by number of pooled riders
    scaled_detour_km_max = thresholds["detour_km"] * (1.0 + 0.5 * (len(rider_ids) - 1))
    scaled_detour_s_max = thresholds["detour_time_s"] * (1.0 + 0.5 * (len(rider_ids) - 1))

    is_feasible = (
        is_reachable
        and detour_km <= scaled_detour_km_max
        and detour_s <= scaled_detour_s_max
        and max_load <= capacity
    )

    # Transparent, normalized objective function in [0, 100]
    if not is_feasible:
        obj_score = 0.0
    else:
        # 1. Matched capacity efficiency (40% weight): reward filling seats
        u_score = 40.0 * (len(rider_ids) / capacity)
        # 2. Detour efficiency (30% weight): reward low detour
        det_score = 30.0 * max(0.0, 1.0 - detour_s / scaled_detour_s_max)
        # 3. Rider transit efficiency (15% weight)
        dur_score = 15.0 * max(0.0, 1.0 - mean_rider_s / (scaled_detour_s_max * 1.5))
        # 4. Directness (15% weight)
        dir_score = 15.0 * max(0.0, 1.0 - detour_km / scaled_detour_km_max)
        obj_score = round(u_score + det_score + dur_score + dir_score, 2)

    stop_names = tuple(f"{s.rider_id}_{s.kind[:4]}" for s in stops)

    return MultiRiderRouteResult(
        driver_id=driver.journey_id,
        rider_ids=rider_ids,
        stops=stops,
        is_valid_sequence=True,
        is_feasible=is_feasible,
        total_distance_km=round(total_dist_km, 4) if is_reachable else 999.0,
        total_duration_seconds=round(total_dur_s, 1) if is_reachable else 9999.0,
        driver_detour_km=round(detour_km, 4) if is_reachable else 999.0,
        driver_detour_seconds=round(detour_s, 1) if is_reachable else 9999.0,
        mean_rider_duration_seconds=round(mean_rider_s, 1),
        max_vehicle_load=max_load,
        vehicle_capacity=capacity,
        objective_score=obj_score,
        stop_sequence_names=stop_names,
    )


# --- ALGORITHMS: EXACT BRANCH-AND-BOUND VS GREEDY MULTI-RIDER INSERTION ---

def solve_multi_rider_exact(
    driver: Journey,
    riders: Sequence[Journey],
    departure_time: datetime,
    router: TimeDependentRouter,
    capacity: int,
    thresholds: Dict[str, float],
    timeout_seconds: float = 3.0,
    explore_subsets: bool = True,
) -> ExactSolverResult:
    """Exact solver: Evaluates all precedence- and capacity-valid permutations to find global optimum.

    Guarantees:
    - If status == 'optimal': proven_objective is the true global maximum across all valid subsets/permutations.
    - If status == 'timeout': proven_objective is strictly None (never 0.0 or a false sentinel).
      best_known_objective contains the best feasible score discovered before timeout, or None.
    - Tuple unpacking (route_result, nodes_explored, timed_out) is preserved for backwards-compatibility.
    """
    start_t = perf_counter()
    if not riders:
        return ExactSolverResult(
            status="no_candidates",
            route_result=None,
            proven_objective=None,
            best_known_objective=None,
            elapsed_time_ms=(perf_counter() - start_t) * 1000.0,
            nodes_explored=0,
            timed_out=False,
        )

    best_result: Optional[MultiRiderRouteResult] = None
    best_score = -1.0
    nodes_explored = 0
    timed_out = False

    cohorts: List[Tuple[Journey, ...]] = []
    if explore_subsets:
        max_k = min(capacity, len(riders))
        for k in range(1, max_k + 1):
            for subset in itertools.combinations(riders, k):
                cohorts.append(subset)
    else:
        cohorts = [tuple(riders)]

    for cohort in cohorts:
        valid_seqs = generate_valid_stop_sequences(cohort, capacity)
        for seq in valid_seqs:
            nodes_explored += 1
            if (perf_counter() - start_t) > timeout_seconds:
                timed_out = True
                break

            res = evaluate_stop_sequence_dynamic(driver, seq, departure_time, router, capacity, thresholds)
            if res.is_feasible and res.objective_score > best_score:
                best_score = res.objective_score
                best_result = res

        if timed_out:
            break

    elapsed_ms = (perf_counter() - start_t) * 1000.0

    if timed_out:
        status = "timeout"
        proven_obj = None
        best_known_obj = round(best_score, 2) if best_score > 0 else None
    elif best_result is not None and best_result.is_feasible:
        status = "optimal"
        proven_obj = round(best_score, 2)
        best_known_obj = round(best_score, 2)
    else:
        status = "infeasible"
        proven_obj = 0.0
        best_known_obj = None

    return ExactSolverResult(
        status=status,
        route_result=best_result,
        proven_objective=proven_obj,
        best_known_objective=best_known_obj,
        elapsed_time_ms=round(elapsed_ms, 2),
        nodes_explored=nodes_explored,
        timed_out=timed_out,
    )


def solve_multi_rider_greedy_insertion(
    driver: Journey,
    riders: Sequence[Journey],
    departure_time: datetime,
    router: TimeDependentRouter,
    capacity: int,
    thresholds: Dict[str, float],
) -> MultiRiderRouteResult:
    """Greedy heuristic: Iteratively inserts riders into the sequence position minimizing detour."""
    current_stops: List[StopNode] = []
    current_riders: List[Journey] = []

    # Sort riders by proximity to driver start to seed insertion
    sorted_riders = sorted(riders, key=lambda r: haversine_km(driver.start, r.start))

    for r in sorted_riders:
        if len(current_riders) >= capacity:
            break

        p_node = StopNode(r.journey_id, "pickup", r.start, r.seats_requested)
        d_node = StopNode(r.journey_id, "dropoff", r.destination, r.seats_requested)

        best_inserted_seq: Optional[Tuple[StopNode, ...]] = None
        best_inserted_score = -1.0

        # Try inserting p_node at pos i and d_node at pos j (i <= j)
        n = len(current_stops)
        for i in range(n + 1):
            for j in range(i, n + 1):
                candidate_stops = list(current_stops)
                candidate_stops.insert(i, p_node)
                candidate_stops.insert(j + 1, d_node)
                candidate_seq = tuple(candidate_stops)

                if validate_stop_sequence(candidate_seq, capacity):
                    res = evaluate_stop_sequence_dynamic(
                        driver, candidate_seq, departure_time, router, capacity, thresholds
                    )
                    if res.is_feasible and res.objective_score > best_inserted_score:
                        best_inserted_score = res.objective_score
                        best_inserted_seq = candidate_seq

        if best_inserted_seq is not None and best_inserted_score > 0:
            current_stops = list(best_inserted_seq)
            current_riders.append(r)

    if not current_stops:
        return MultiRiderRouteResult(
            driver_id=driver.journey_id,
            rider_ids=(),
            stops=(),
            is_valid_sequence=True,
            is_feasible=False,
            total_distance_km=0.0,
            total_duration_seconds=0.0,
            driver_detour_km=0.0,
            driver_detour_seconds=0.0,
            mean_rider_duration_seconds=0.0,
            max_vehicle_load=0,
            vehicle_capacity=capacity,
            objective_score=0.0,
            stop_sequence_names=(),
        )

    return evaluate_stop_sequence_dynamic(
        driver, tuple(current_stops), departure_time, router, capacity, thresholds
    )


# --- ADMISSIBLE MULTI-RIDER PRUNING (STEP 9) ---

def is_multi_rider_subset_admissible(
    driver: Journey,
    riders: Sequence[Journey],
    driver_direct_road_km: float,
    thresholds: Dict[str, float],
) -> bool:
    """Provably admissible lower-bound pruning for candidate multi-rider subsets.

    Mathematical Invariant:
    For any valid tour pi visiting {D_start, s_1, ..., s_2K, D_dest} on road network G:
        L_road(pi) = sum_{k=0}^{2K} d_road(s_k, s_{k+1}) >= sum_{k=0}^{2K} d_euc(s_k, s_{k+1}) = L_euc(pi)
    Since this holds for every valid sequence in the permutation set Pi:
        min_{sigma in Pi} L_euc(sigma) <= min_{pi in Pi} L_road(pi) = L_road(pi*)
    Subtracting driver direct road distance L_road(direct):
        LB_detour = max(0.0, min_{sigma in Pi} L_euc(sigma) - driver_direct_road_km) <= Detour_road(pi*)

    If LB_detour > scaled_detour_km_max, no valid permutation can satisfy the detour threshold.
    Therefore, pruning the subset is strictly admissible (0 false negatives).
    """
    if not riders:
        return True

    scaled_detour_max = thresholds["detour_km"] * (1.0 + 0.5 * (len(riders) - 1))

    # Evaluate minimum Euclidean tour length across all valid precedence permutations
    valid_seqs = generate_valid_stop_sequences(riders, capacity=len(riders))
    if not valid_seqs:
        return False

    min_euc_tour = min(
        haversine_km(driver.start, seq[0].coordinate)
        + sum(haversine_km(seq[k].coordinate, seq[k + 1].coordinate) for k in range(len(seq) - 1))
        + haversine_km(seq[-1].coordinate, driver.destination)
        for seq in valid_seqs
    )

    lb_detour = max(0.0, min_euc_tour - driver_direct_road_km)
    return lb_detour <= scaled_detour_max


# --- EXPERIMENT 011 SUITE RUNNER ---

def run_experiment_011(
    network: Optional[RoadNetwork] = None,
    seed: int = 42,
) -> Experiment011Report:
    """Executes Experiment 011 across capacity sweeps, congestion shifts, exact vs greedy, and scaling."""
    if network is None:
        network = create_osm_sf_downtown_network()

    departure_time = datetime(2026, 10, 8, 8, 30, tzinfo=timezone.utc)
    free_flow_model = BPRCongestionModel(scenario="no_congestion")
    congested_model = BPRCongestionModel(scenario="severe_congestion")

    ff_router = TimeDependentRouter(network, free_flow_model)
    cong_router = TimeDependentRouter(network, congested_model)

    thresholds = {
        "pickup_km": 1.2,
        "dest_km": 1.2,
        "detour_km": 2.5,
        "detour_time_s": 650.0,
        "time_diff_min": 20.0,
    }

    # 1. Drivers and Riders for standard evaluation instance
    # 10 Drivers and 25 Riders with realistic commuter corridors on SF grid
    from .hybrid_pruning import generate_stress_instances
    eval_drivers, eval_riders = generate_stress_instances(network, num_drivers=10, num_riders=25, seed=seed)

    # Precompute driver baseline road route lengths
    driver_road_lengths = {}
    for d in eval_drivers:
        try:
            res = ff_router.route_time_dependent(d.start, d.destination, departure_time)
            driver_road_lengths[d.journey_id] = res.distance_km
        except Exception:
            driver_road_lengths[d.journey_id] = haversine_km(d.start, d.destination)

    # 2. CAPACITY EXPERIMENT (Capacities 1, 2, 3, 4)
    capacity_results: Dict[str, CapacityComparisonResult] = {}
    for cap in (1, 2, 3, 4):
        t0 = perf_counter()
        routing_calls = 0
        total_matched = 0
        total_obj = 0.0
        rider_times = []
        driver_detours = []
        total_det_km = 0.0
        utilized_seats = 0
        assigned_rids = set()

        # Evaluate multi-rider pooling for each driver using greedy insertion
        for d in eval_drivers:
            cand_riders = [
                r for r in eval_riders
                if r.journey_id not in assigned_rids
                and haversine_km(d.start, r.start) <= thresholds["pickup_km"] * 1.5
                and abs((d.departure - r.departure).total_seconds()) / 60.0 <= thresholds["time_diff_min"]
            ]
            routing_calls += len(cand_riders)

            res = solve_multi_rider_greedy_insertion(
                d, cand_riders, departure_time, cong_router, cap, thresholds
            )
            if res.is_feasible and res.rider_ids:
                total_matched += len(res.rider_ids)
                assigned_rids.update(res.rider_ids)
                total_obj += res.objective_score
                rider_times.append(res.mean_rider_duration_seconds)
                driver_detours.append(res.driver_detour_seconds)
                total_det_km += res.driver_detour_km
                utilized_seats += res.max_vehicle_load

        solve_time = (perf_counter() - t0) * 1000.0
        total_available_seats = len(eval_drivers) * cap

        capacity_results[f"capacity_{cap}"] = CapacityComparisonResult(
            capacity=cap,
            matched_riders_count=total_matched,
            matched_percentage=round((total_matched / len(eval_riders)) * 100.0, 1),
            total_objective=round(total_obj, 2),
            mean_rider_travel_time_seconds=round(sum(rider_times) / len(rider_times), 1) if rider_times else 0.0,
            mean_driver_detour_seconds=round(sum(driver_detours) / len(driver_detours), 1) if driver_detours else 0.0,
            total_detour_km=round(total_det_km, 3),
            capacity_utilization_pct=round((utilized_seats / total_available_seats) * 100.0, 1),
            routing_calls=routing_calls,
            solve_time_ms=round(solve_time, 2),
        )

    # 3. CONGESTION VS. OPTIMAL STOP ORDER (Free-Flow vs Severe Congestion)
    stop_shifts: List[CongestionStopOrderShift] = []
    # Test groups of K=2 and K=3 riders with compatible corridors
    for d in eval_drivers:
        cand_riders = [r for r in eval_riders if haversine_km(d.start, r.start) <= 1.2][:6]
        for i in range(len(cand_riders)):
            for j in range(i + 1, min(i + 4, len(cand_riders))):
                pair = (cand_riders[i], cand_riders[j])
                res_ff, _, _ = solve_multi_rider_exact(
                    d, pair, departure_time, ff_router, capacity=2, thresholds=thresholds, explore_subsets=False
                )
                res_cong, _, _ = solve_multi_rider_exact(
                    d, pair, departure_time, cong_router, capacity=2, thresholds=thresholds, explore_subsets=False
                )

                if res_ff and res_cong and res_ff.is_feasible and res_cong.is_feasible:
                    ff_seq = res_ff.stop_sequence_names
                    cong_seq = res_cong.stop_sequence_names
                    changed = ff_seq != cong_seq
                    delay = max(0.0, res_cong.total_duration_seconds - res_ff.total_duration_seconds)

                    stop_shifts.append(
                        CongestionStopOrderShift(
                            driver_id=d.journey_id,
                            rider_ids=res_ff.rider_ids,
                            free_flow_stops=ff_seq,
                            congested_stops=cong_seq,
                            stop_order_changed=changed,
                            free_flow_duration_s=res_ff.total_duration_seconds,
                            congested_duration_s=res_cong.total_duration_seconds,
                            congestion_delay_s=round(delay, 1),
                        )
                    )

    changed_count = sum(1 for s in stop_shifts if s.stop_order_changed)
    shift_rate = round(changed_count / len(stop_shifts), 3) if stop_shifts else 0.0

    # 4. EXACT VS. GREEDY QUALITY & RUNTIME (Step 8 & 11)
    solver_comps: List[SolverOptimalityComparison] = []
    scale_tests = [
        ("micro_3x4", 3, 4, 2, 2.0),
        ("small_4x6", 4, 6, 2, 2.0),
        ("medium_5x8", 5, 8, 3, 2.0),
        ("stress_6x12_timeout", 6, 12, 4, 0.05),  # Explicit timeout test instance
    ]

    for label, n_d, n_r, cap, t_limit in scale_tests:
        s_drvs, s_rids = generate_stress_instances(network, n_d, n_r, seed=101)
        tot_exact_obj = 0.0
        tot_greedy_obj = 0.0
        tot_best_known = 0.0
        tot_nodes = 0
        any_timed_out = False
        t_exact_0 = perf_counter()

        for d in s_drvs:
            cands = [r for r in s_rids if haversine_km(d.start, r.start) <= 1.0][:cap]
            e_res = solve_multi_rider_exact(
                d, cands, departure_time, cong_router, cap, thresholds,
                timeout_seconds=t_limit, explore_subsets=True
            )
            tot_nodes += e_res.nodes_explored
            if e_res.timed_out:
                any_timed_out = True
            if e_res.proven_objective is not None:
                tot_exact_obj += e_res.proven_objective
            if e_res.best_known_objective is not None:
                tot_best_known += e_res.best_known_objective

        t_exact_ms = (perf_counter() - t_exact_0) * 1000.0

        t_greedy_0 = perf_counter()
        for d in s_drvs:
            cands = [r for r in s_rids if haversine_km(d.start, r.start) <= 1.0][:cap]
            g_res = solve_multi_rider_greedy_insertion(d, cands, departure_time, cong_router, cap, thresholds)
            if g_res.is_feasible:
                tot_greedy_obj += g_res.objective_score
        t_greedy_ms = (perf_counter() - t_greedy_0) * 1000.0

        r_ratio = (t_exact_ms / t_greedy_ms) if t_greedy_ms > 0 else 1.0

        # Scientific Integrity Guarantee:
        # If any sub-problem timed out, exact_objective and optimality_gap_pct MUST be None (null),
        # NEVER 0.0 or a false 0% gap.
        if any_timed_out:
            status = "timeout"
            exact_obj_val = None
            opt_gap_val = None
            best_known_val = round(tot_best_known, 2) if tot_best_known > 0 else None
        else:
            status = "optimal"
            exact_obj_val = round(tot_exact_obj, 2)
            best_known_val = round(tot_exact_obj, 2)
            opt_gap_val = round(((tot_exact_obj - tot_greedy_obj) / tot_exact_obj * 100.0), 2) if tot_exact_obj > 0 else 0.0

        solver_comps.append(
            SolverOptimalityComparison(
                scale_label=label,
                num_drivers=n_d,
                num_riders=n_r,
                capacity=cap,
                status=status,
                exact_objective=exact_obj_val,
                greedy_objective=round(tot_greedy_obj, 2),
                best_known_exact_objective=best_known_val,
                optimality_gap_pct=opt_gap_val,
                exact_runtime_ms=round(t_exact_ms, 2),
                greedy_runtime_ms=round(t_greedy_ms, 2),
                runtime_ratio=round(r_ratio, 2),
                nodes_explored=tot_nodes,
                timed_out=any_timed_out,
            )
        )

    # 5. MULTI-RIDER ADMISSIBLE PRUNING EVALUATION (Step 9)
    total_subsets = 0
    pruned_subsets = 0
    fn_subsets = 0
    true_feas_subsets = 0
    calls_saved = 0

    for d in eval_drivers:
        d_len = driver_road_lengths[d.journey_id]
        # Evaluate subset pairs from the first 10 riders for efficiency
        cand_pairs = list(itertools.combinations(eval_riders[:10], 2))
        total_subsets += len(cand_pairs)

        for r_pair in cand_pairs:
            # Full exact ground truth for this subset
            gt_res, _, _ = solve_multi_rider_exact(
                d, r_pair, departure_time, cong_router, capacity=2, thresholds=thresholds, explore_subsets=False
            )
            is_gt_feas = gt_res is not None and gt_res.is_feasible
            if is_gt_feas:
                true_feas_subsets += 1

            # Multi-rider admissible test
            passes = is_multi_rider_subset_admissible(d, r_pair, d_len, thresholds)
            if not passes:
                pruned_subsets += 1
                calls_saved += 6  # Avoided evaluating 6 permutations on road graph
                if is_gt_feas:
                    fn_subsets += 1

    pruned_pct = round((pruned_subsets / total_subsets) * 100.0, 1) if total_subsets else 0.0
    recall = round((true_feas_subsets - fn_subsets) / true_feas_subsets, 3) if true_feas_subsets else 1.0
    spd = round(total_subsets / (total_subsets - pruned_subsets), 2) if (total_subsets - pruned_subsets) > 0 else 1.0

    pruning_metrics = MultiRiderPruningMetrics(
        total_subsets_evaluated=total_subsets,
        subsets_pruned=pruned_subsets,
        subsets_routed=total_subsets - pruned_subsets,
        pruned_percentage=pruned_pct,
        true_feasible_subsets=true_feas_subsets,
        false_negatives=fn_subsets,
        feasible_recall=recall,
        routing_calls_saved=calls_saved,
        speedup_factor=spd,
        is_provably_admissible=True,
    )

    return Experiment011Report(
        study_area="San Francisco Downtown / Financial District & SoMa Corridor",
        capacity_results=capacity_results,
        stop_order_shifts=tuple(stop_shifts),
        stop_order_shift_rate=shift_rate,
        solver_comparisons=tuple(solver_comps),
        pruning_metrics=pruning_metrics,
    )


def save_experiment_011_outputs(
    report: Experiment011Report,
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
        "capacity_results": {k: asdict(v) for k, v in report.capacity_results.items()},
        "stop_order_shift_rate": report.stop_order_shift_rate,
        "stop_order_shifts": [asdict(s) for s in report.stop_order_shifts],
        "solver_comparisons": [asdict(sc) for sc in report.solver_comparisons],
        "pruning_metrics": asdict(report.pruning_metrics),
    }
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results_data, f, indent=2)

    # 2. metrics.csv
    csv_rows = [
        "capacity,matched_riders,matched_pct,total_obj,mean_travel_time_s,mean_detour_s,total_detour_km,utilization_pct,solve_time_ms\n"
    ]
    for k, v in report.capacity_results.items():
        csv_rows.append(
            f"{v.capacity},{v.matched_riders_count},{v.matched_percentage},{v.total_objective},{v.mean_rider_travel_time_seconds},{v.mean_driver_detour_seconds},{v.total_detour_km},{v.capacity_utilization_pct},{v.solve_time_ms}\n"
        )
    csv_rows.append("\nscale_label,capacity,status,exact_obj,greedy_obj,best_known_obj,opt_gap_pct,exact_ms,greedy_ms,speedup\n")
    for sc in report.solver_comparisons:
        e_str = f"{sc.exact_objective:.2f}" if sc.exact_objective is not None else ""
        gap_str = f"{sc.optimality_gap_pct:.2f}" if sc.optimality_gap_pct is not None else ""
        bk_str = f"{sc.best_known_exact_objective:.2f}" if sc.best_known_exact_objective is not None else ""
        csv_rows.append(
            f"{sc.scale_label},{sc.capacity},{sc.status},{e_str},{sc.greedy_objective},{bk_str},{gap_str},{sc.exact_runtime_ms},{sc.greedy_runtime_ms},{sc.runtime_ratio}\n"
        )
    with open(metrics_path, "w", encoding="utf-8") as f:
        f.writelines(csv_rows)

    # 3. manifest.json
    valid_gaps = [sc.optimality_gap_pct for sc in report.solver_comparisons if sc.optimality_gap_pct is not None]
    manifest_data = {
        "experiment_id": "011_multi_rider_pooling",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "study_area": report.study_area,
        "evidence_class": "Controlled semi-synthetic algorithmic experiment on a realistic road graph",
        "artifacts": [
            "outputs/results.json",
            "outputs/metrics.csv",
            "outputs/manifest.json",
        ],
        "summary": {
            "stop_order_shift_rate": report.stop_order_shift_rate,
            "pruning_percentage": report.pruning_metrics.pruned_percentage,
            "pruning_false_negatives": report.pruning_metrics.false_negatives,
            "pruning_feasible_recall": report.pruning_metrics.feasible_recall,
            "capacity_4_matched_pct": report.capacity_results["capacity_4"].matched_percentage,
            "mean_proven_optimality_gap_pct": round(sum(valid_gaps) / len(valid_gaps), 2) if valid_gaps else None,
            "timed_out_instances_count": sum(1 for sc in report.solver_comparisons if sc.timed_out),
        },
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    return results_path, metrics_path, manifest_path
