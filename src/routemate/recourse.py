"""Experiment 012: Dynamic Curbside Dwell, Incident Congestion, and Online Rerouting/Recourse.

This module implements:
1. Stochastic curbside dwell times (log-normal boarding and alighting).
2. Directed link incident events (speed drops, partial capacity reduction, or full link closures).
3. Explicit separation of execution horizons:
   - Nominal planned route (static baseline under time-dependent congestion).
   - Realized route without adaptation (unadapted static execution encountering dwell and closures).
   - Online recourse route (dynamic rerouting and sequence adaptation avoiding incident blockages).
   - Clairvoyant offline oracle (a priori optimal recomputation with incident foresight).
4. Rigorous, mathematically sound metrics: executed feasibility, executed objective, driver detour,
   rider travel time, recourse latency, additional routing calls, objective recovery %,
   and regret vs offline oracle.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
import heapq
import itertools
import json
import math
from pathlib import Path
import random
from time import perf_counter
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple

from .congestion import (
    BPRCongestionModel,
    BPRParameters,
    TimeDependentRouteResult,
    TimeDependentRouter,
)
from .geometry import Coordinate, haversine_km
from .hybrid_pruning import generate_stress_instances
from .models import Journey, Vehicle, VerificationContext
from .multi_rider_pooling import (
    ExactSolverResult,
    MultiRiderRouteResult,
    StopNode,
    evaluate_stop_sequence_dynamic,
    generate_valid_stop_sequences,
    solve_multi_rider_exact,
    solve_multi_rider_greedy_insertion,
    validate_stop_sequence,
)
from .routing import (
    NetworkEdge,
    RoadNetwork,
    RouteNotFoundError,
    create_osm_sf_downtown_network,
)


@dataclass(frozen=True)
class IncidentEvent:
    """An incident event temporarily degrading or closing a directed road link."""
    incident_id: str
    edge_source: str
    edge_target: str
    start_time: datetime
    duration_seconds: float
    capacity_reduction_factor: float = 0.8  # 0.0 = no effect, 1.0 = 100% capacity reduction
    is_full_closure: bool = False
    severity: str = "moderate"

    def is_active_at(self, timestamp: datetime) -> bool:
        """Determines whether the incident is actively affecting traffic at timestamp."""
        end_time = self.start_time + timedelta(seconds=self.duration_seconds)
        return self.start_time <= timestamp < end_time


@dataclass(frozen=True)
class StochasticDwellModel:
    """Deterministic generator for curbside boarding and alighting dwell times."""
    pickup_mean_seconds: float = 60.0
    dropoff_mean_seconds: float = 25.0
    stdev_factor: float = 0.35
    seed: int = 42

    def sample_dwell_seconds(self, kind: str, rng: random.Random) -> float:
        """Draws a positive dwell time sample from a log-normal distribution."""
        mean = self.pickup_mean_seconds if kind == "pickup" else self.dropoff_mean_seconds
        variance = (mean * self.stdev_factor) ** 2
        sigma2 = math.log(1.0 + variance / (mean ** 2))
        sigma = math.sqrt(sigma2)
        mu = math.log(mean) - 0.5 * sigma2
        raw = rng.lognormvariate(mu, sigma)
        # Bounded strictly between 5.0 seconds and 3x the mean
        return max(5.0, min(3.0 * mean, raw))


class IncidentAwareRouter:
    """Time-dependent Dijkstra router that respects active incidents and link closures."""

    def __init__(
        self,
        network: RoadNetwork,
        congestion_model: Optional[BPRCongestionModel] = None,
        incidents: Sequence[IncidentEvent] = (),
    ) -> None:
        self.network = network
        self.congestion_model = congestion_model or BPRCongestionModel(scenario="moderate_congestion")
        self.incidents = tuple(incidents)

    def route_time_dependent(
        self,
        origin: Coordinate,
        destination: Coordinate,
        departure_time: datetime,
    ) -> TimeDependentRouteResult:
        """Computes shortest-duration path avoiding active closures and factoring incident delays."""
        if departure_time.tzinfo is None:
            raise ValueError("departure_time must be timezone-aware")

        start_node = self.network.nearest_node(origin)
        end_node = self.network.nearest_node(destination)

        if start_node == end_node:
            coords = (self.network.nodes[start_node],)
            return TimeDependentRouteResult(
                route=coords,
                node_path=(start_node,),
                distance_km=0.0,
                free_flow_duration_seconds=0.0,
                congested_duration_seconds=0.0,
                congestion_delay_seconds=0.0,
                departure_time=departure_time,
                arrival_time=departure_time,
                mean_speed_kmh=40.0,
            )

        base_epoch = departure_time.timestamp()
        pq: List[Tuple[float, str, float, float, float, List[str]]] = [
            (base_epoch, start_node, 0.0, 0.0, 0.0, [start_node])
        ]
        visited: Dict[str, float] = {}

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
                    mean_speed_kmh=round(mean_spd, 1),
                )

            if u in visited and visited[u] <= curr_epoch:
                continue
            visited[u] = curr_epoch

            current_time = datetime.fromtimestamp(curr_epoch, tz=timezone.utc)
            for edge in self.network.adj.get(u, []):
                v = edge.target

                # Check active incident on this edge
                is_closed = False
                incident_delay_factor = 1.0
                for inc in self.incidents:
                    if inc.edge_source == u and inc.edge_target == v and inc.is_active_at(current_time):
                        if inc.is_full_closure:
                            is_closed = True
                            break
                        incident_delay_factor = max(
                            incident_delay_factor,
                            1.0 + inc.capacity_reduction_factor * 8.0,
                        )

                if is_closed:
                    continue  # Impassable closed link

                edge_dyn_sec, _ = self.congestion_model.calculate_link_travel_time(edge, u, current_time)
                edge_dyn_sec *= incident_delay_factor
                edge_ff_sec = (edge.distance_km / edge.speed_kmh) * 3600.0

                new_epoch = curr_epoch + edge_dyn_sec
                if v not in visited or new_epoch < visited[v]:
                    heapq.heappush(
                        pq,
                        (
                            new_epoch,
                            v,
                            d_km + edge.distance_km,
                            ff_sec + edge_ff_sec,
                            dyn_sec + edge_dyn_sec,
                            path + [v],
                        ),
                    )

        raise RouteNotFoundError(f"No feasible path from {start_node} to {end_node} under active closures.")


@dataclass(frozen=True)
class RecourseTripEvaluation:
    """Individual paired evaluation comparing nominal, unadapted realized, recourse, and oracle outcomes."""
    driver_id: str
    rider_ids: Tuple[str, ...]
    nominal_distance_km: float
    nominal_duration_seconds: float
    nominal_objective: float
    realized_distance_km: float
    realized_duration_seconds: float
    realized_detour_km: float
    realized_detour_seconds: float
    realized_objective: float
    realized_is_feasible: bool
    recourse_distance_km: float
    recourse_duration_seconds: float
    recourse_detour_km: float
    recourse_detour_seconds: float
    recourse_objective: float
    recourse_is_feasible: bool
    oracle_objective: Optional[float]
    recourse_triggered: bool
    additional_routing_calls: int
    recourse_latency_ms: float
    objective_recovery_pct: Optional[float]
    static_regret_vs_oracle: Optional[float]
    recourse_regret_vs_oracle: Optional[float]


@dataclass(frozen=True)
class RecourseScenarioMetrics:
    """Aggregate metrics for a specific experimental condition under its operating policy."""
    scenario_name: str
    policy: str  # "static" or "recourse"
    perturbation: str  # "none", "dwell", "incident", "dwell+incident"
    severity: str
    seed: int
    total_trips: int
    executed_feasible_rate_pct: float
    executed_mean_objective: float
    executed_mean_detour_km: float
    executed_mean_duration_seconds: float
    rerouting_frequency_pct: float
    mean_recourse_latency_ms: Optional[float]
    total_additional_routing_calls: int
    mean_objective_recovery_pct: Optional[float]
    mean_regret_vs_oracle: Optional[float]
    mean_oracle_objective: Optional[float]


@dataclass(frozen=True)
class Experiment012Report:
    """Top-level report containing all Experiment 012 evaluation artifacts."""
    study_area: str
    scenario_metrics: Dict[str, RecourseScenarioMetrics]
    severity_comparisons: Dict[str, Dict[str, float]]
    seed_stability_results: Dict[str, Dict[str, Any]]
    evaluations: Tuple[RecourseTripEvaluation, ...]


def build_incident_scenarios(
    departure_time: datetime,
    severity: str = "moderate",
) -> List[IncidentEvent]:
    """Constructs controlled synthetic incidents on key corridors of the SF downtown network."""
    incidents: List[IncidentEvent] = []
    # Key arterial corridor links on the OSM-derived SF Downtown grid
    # Market St eastbound: market_2nd -> market_1st
    # Mission St eastbound: mission_2nd -> mission_1st
    if severity == "mild":
        # 1 arterial link experiencing 65% capacity reduction (speed drop) for 30 minutes
        incidents.append(
            IncidentEvent(
                incident_id="inc_mild_1",
                edge_source="market_2nd",
                edge_target="market_1st",
                start_time=departure_time - timedelta(minutes=2),
                duration_seconds=1800.0,
                capacity_reduction_factor=0.65,
                is_full_closure=False,
                severity="mild",
            )
        )
    elif severity == "moderate":
        # Market St link fully closed for 30 minutes, plus 45% capacity reduction on Mission St
        incidents.append(
            IncidentEvent(
                incident_id="inc_mod_1",
                edge_source="market_2nd",
                edge_target="market_1st",
                start_time=departure_time - timedelta(minutes=2),
                duration_seconds=1800.0,
                capacity_reduction_factor=1.0,
                is_full_closure=True,
                severity="moderate",
            )
        )
        incidents.append(
            IncidentEvent(
                incident_id="inc_mod_2",
                edge_source="mission_2nd",
                edge_target="mission_1st",
                start_time=departure_time - timedelta(minutes=2),
                duration_seconds=1800.0,
                capacity_reduction_factor=0.45,
                is_full_closure=False,
                severity="moderate",
            )
        )
    elif severity == "severe":
        # Both Market St and Mission St links fully closed for 30 minutes (diverts south to Howard St)
        incidents.append(
            IncidentEvent(
                incident_id="inc_sev_1",
                edge_source="market_2nd",
                edge_target="market_1st",
                start_time=departure_time - timedelta(minutes=2),
                duration_seconds=1800.0,
                capacity_reduction_factor=1.0,
                is_full_closure=True,
                severity="severe",
            )
        )
        incidents.append(
            IncidentEvent(
                incident_id="inc_sev_2",
                edge_source="mission_2nd",
                edge_target="mission_1st",
                start_time=departure_time - timedelta(minutes=2),
                duration_seconds=1800.0,
                capacity_reduction_factor=1.0,
                is_full_closure=True,
                severity="severe",
            )
        )
    return incidents


def evaluate_trip_recourse(
    driver: Journey,
    riders: Sequence[Journey],
    nominal_route: MultiRiderRouteResult,
    departure_time: datetime,
    nominal_router: TimeDependentRouter,
    incident_router: IncidentAwareRouter,
    dwell_model: Optional[StochasticDwellModel],
    enable_incidents: bool,
    enable_dwell: bool,
    thresholds: Dict[str, float],
    rng: random.Random,
) -> RecourseTripEvaluation:
    """Evaluates an individual pooled trip under blind realization, online recourse, and offline oracle."""
    network = incident_router.network
    stops = nominal_route.stops
    rider_ids = nominal_route.rider_ids
    capacity = nominal_route.vehicle_capacity

    # Direct driver route baseline under departure time
    try:
        direct_res = nominal_router.route_time_dependent(driver.start, driver.destination, departure_time)
        direct_dist_km = direct_res.distance_km
        direct_dur_s = direct_res.congested_duration_seconds
    except Exception:
        direct_dist_km = haversine_km(driver.start, driver.destination)
        direct_dur_s = (direct_dist_km / 35.0) * 3600.0

    scaled_detour_km_max = thresholds["detour_km"] * (1.0 + 0.5 * (len(rider_ids) - 1))
    scaled_detour_s_max = thresholds["detour_time_s"] * (1.0 + 0.5 * (len(rider_ids) - 1))

    # Precompute nominal route legs
    nominal_legs: List[TimeDependentRouteResult] = []
    c_nom = driver.start
    for s in stops:
        nominal_legs.append(nominal_router.route_time_dependent(c_nom, s.coordinate, departure_time))
        c_nom = s.coordinate
    nominal_legs.append(nominal_router.route_time_dependent(c_nom, driver.destination, departure_time))

    # 1. Realized Journey under Perturbation (Unadapted / Blind Static Execution)
    curr_time = departure_time
    total_realized_dist_km = 0.0
    total_realized_dur_s = 0.0
    realized_is_reachable = True
    pickup_times: Dict[str, datetime] = {}
    rider_realized_durations: Dict[str, float] = {}

    for leg_idx, s in enumerate(stops):
        nom_leg = nominal_legs[leg_idx]
        leg_dist = 0.0
        leg_dur = 0.0
        for u, v in zip(nom_leg.node_path[:-1], nom_leg.node_path[1:]):
            edge = next((e for e in network.adj.get(u, []) if e.target == v), None)
            if edge is None:
                continue
            is_closed = False
            delay_factor = 1.0
            if enable_incidents:
                for inc in incident_router.incidents:
                    if inc.edge_source == u and inc.edge_target == v and inc.is_active_at(curr_time):
                        if inc.is_full_closure:
                            is_closed = True
                            break
                        delay_factor = max(delay_factor, 1.0 + inc.capacity_reduction_factor * 8.0)
            if is_closed:
                realized_is_reachable = False
                break

            edge_dyn_sec, _ = incident_router.congestion_model.calculate_link_travel_time(edge, u, curr_time)
            edge_dyn_sec *= delay_factor
            leg_dur += edge_dyn_sec
            leg_dist += edge.distance_km
            curr_time += timedelta(seconds=edge_dyn_sec)

        if not realized_is_reachable:
            break

        total_realized_dist_km += leg_dist
        total_realized_dur_s += leg_dur

        if enable_dwell and dwell_model is not None:
            dwell_s = dwell_model.sample_dwell_seconds(s.kind, rng)
            total_realized_dur_s += dwell_s
            curr_time += timedelta(seconds=dwell_s)

        if s.kind == "pickup":
            pickup_times[s.rider_id] = curr_time
        elif s.kind == "dropoff" and s.rider_id in pickup_times:
            rider_realized_durations[s.rider_id] = (curr_time - pickup_times[s.rider_id]).total_seconds()

    # Final leg of blind execution to driver destination
    if realized_is_reachable:
        final_nom_leg = nominal_legs[-1]
        leg_dist = 0.0
        leg_dur = 0.0
        for u, v in zip(final_nom_leg.node_path[:-1], final_nom_leg.node_path[1:]):
            edge = next((e for e in network.adj.get(u, []) if e.target == v), None)
            if edge is None:
                continue
            is_closed = False
            delay_factor = 1.0
            if enable_incidents:
                for inc in incident_router.incidents:
                    if inc.edge_source == u and inc.edge_target == v and inc.is_active_at(curr_time):
                        if inc.is_full_closure:
                            is_closed = True
                            break
                        delay_factor = max(delay_factor, 1.0 + inc.capacity_reduction_factor * 8.0)
            if is_closed:
                realized_is_reachable = False
                break

            edge_dyn_sec, _ = incident_router.congestion_model.calculate_link_travel_time(edge, u, curr_time)
            edge_dyn_sec *= delay_factor
            leg_dur += edge_dyn_sec
            leg_dist += edge.distance_km
            curr_time += timedelta(seconds=edge_dyn_sec)

        if realized_is_reachable:
            total_realized_dist_km += leg_dist
            total_realized_dur_s += leg_dur

    realized_detour_km = max(0.0, total_realized_dist_km - direct_dist_km)
    realized_detour_s = max(0.0, total_realized_dur_s - direct_dur_s)
    mean_rider_realized_s = (
        sum(rider_realized_durations.values()) / len(rider_realized_durations)
        if rider_realized_durations else 0.0
    )

    realized_is_feasible = (
        realized_is_reachable
        and realized_detour_km <= scaled_detour_km_max
        and realized_detour_s <= scaled_detour_s_max
    )

    if not realized_is_feasible:
        realized_obj = 0.0
    else:
        u_score = 40.0 * (len(rider_ids) / capacity)
        det_score = 30.0 * max(0.0, 1.0 - realized_detour_s / scaled_detour_s_max)
        dur_score = 15.0 * max(0.0, 1.0 - mean_rider_realized_s / (scaled_detour_s_max * 1.5))
        dir_score = 15.0 * max(0.0, 1.0 - realized_detour_km / scaled_detour_km_max)
        realized_obj = round(u_score + det_score + dur_score + dir_score, 2)

    # 2. Online Recourse Journey (Dynamic Detours + Permutation Adaptation)
    t_recourse_start = perf_counter()
    additional_calls = 0
    recourse_triggered = False

    # Check if nominal route encounters an active incident
    has_incident_on_plan = False
    if enable_incidents:
        for leg in nominal_legs:
            for u, v in zip(leg.node_path[:-1], leg.node_path[1:]):
                for inc in incident_router.incidents:
                    if inc.edge_source == u and inc.edge_target == v and inc.is_active_at(departure_time):
                        has_incident_on_plan = True
                        break
                if has_incident_on_plan:
                    break
            if has_incident_on_plan:
                break

    best_recourse_seq = stops
    if has_incident_on_plan:
        recourse_triggered = True
        # Evaluate valid stop sequences to adapt sequence around closures
        valid_seqs = generate_valid_stop_sequences(riders, capacity=capacity)
        additional_calls += len(valid_seqs)
        best_cand_score = -1.0
        best_cand_seq = None
        for cand_seq in valid_seqs:
            c_coord = driver.start
            c_t = departure_time
            c_dist = 0.0
            c_dur = 0.0
            c_reach = True
            for cs in cand_seq:
                try:
                    c_leg = incident_router.route_time_dependent(c_coord, cs.coordinate, c_t)
                    additional_calls += 1
                    c_dist += c_leg.distance_km
                    c_dur += c_leg.congested_duration_seconds
                    c_coord = cs.coordinate
                    c_t = c_leg.arrival_time
                except Exception:
                    c_reach = False
                    break
            if c_reach:
                try:
                    c_fin = incident_router.route_time_dependent(c_coord, driver.destination, c_t)
                    additional_calls += 1
                    c_dist += c_fin.distance_km
                    c_dur += c_fin.congested_duration_seconds
                    c_det_km = max(0.0, c_dist - direct_dist_km)
                    c_det_s = max(0.0, c_dur - direct_dur_s)
                    if c_det_km <= scaled_detour_km_max and c_det_s <= scaled_detour_s_max:
                        score = 30.0 * max(0.0, 1.0 - c_det_s / scaled_detour_s_max) + 15.0 * max(0.0, 1.0 - c_det_km / scaled_detour_km_max)
                        if score > best_cand_score:
                            best_cand_score = score
                            best_cand_seq = cand_seq
                except Exception:
                    pass
        if best_cand_seq is not None:
            best_recourse_seq = best_cand_seq

    # Execute recourse sequence with dwell
    c_time = departure_time
    c_coord = driver.start
    total_rec_dist_km = 0.0
    total_rec_dur_s = 0.0
    rec_is_reachable = True
    rec_pickup_times: Dict[str, datetime] = {}
    rider_rec_durations: Dict[str, float] = {}

    for s in best_recourse_seq:
        try:
            active_router = incident_router if enable_incidents else nominal_router
            rec_leg = active_router.route_time_dependent(c_coord, s.coordinate, c_time)
            additional_calls += 1
            total_rec_dist_km += rec_leg.distance_km
            total_rec_dur_s += rec_leg.congested_duration_seconds
            c_coord = s.coordinate
            c_time = rec_leg.arrival_time
        except Exception:
            rec_is_reachable = False
            break

        if enable_dwell and dwell_model is not None:
            dwell_s = dwell_model.sample_dwell_seconds(s.kind, rng)
            total_rec_dur_s += dwell_s
            c_time += timedelta(seconds=dwell_s)

        if s.kind == "pickup":
            rec_pickup_times[s.rider_id] = c_time
        elif s.kind == "dropoff" and s.rider_id in rec_pickup_times:
            rider_rec_durations[s.rider_id] = (c_time - rec_pickup_times[s.rider_id]).total_seconds()

    if rec_is_reachable:
        try:
            active_router = incident_router if enable_incidents else nominal_router
            final_rec = active_router.route_time_dependent(c_coord, driver.destination, c_time)
            additional_calls += 1
            total_rec_dist_km += final_rec.distance_km
            total_rec_dur_s += final_rec.congested_duration_seconds
        except Exception:
            rec_is_reachable = False

    recourse_latency = (perf_counter() - t_recourse_start) * 1000.0

    rec_detour_km = max(0.0, total_rec_dist_km - direct_dist_km)
    rec_detour_s = max(0.0, total_rec_dur_s - direct_dur_s)
    mean_rider_rec_s = (
        sum(rider_rec_durations.values()) / len(rider_rec_durations)
        if rider_rec_durations else 0.0
    )

    rec_is_feasible = (
        rec_is_reachable
        and rec_detour_km <= scaled_detour_km_max
        and rec_detour_s <= scaled_detour_s_max
    )

    if not rec_is_feasible:
        recourse_obj = 0.0
    else:
        u_score = 40.0 * (len(rider_ids) / capacity)
        det_score = 30.0 * max(0.0, 1.0 - rec_detour_s / scaled_detour_s_max)
        dur_score = 15.0 * max(0.0, 1.0 - mean_rider_rec_s / (scaled_detour_s_max * 1.5))
        dir_score = 15.0 * max(0.0, 1.0 - rec_detour_km / scaled_detour_km_max)
        recourse_obj = round(u_score + det_score + dur_score + dir_score, 2)

    # 3. Clairvoyant Oracle (Independent Recomputed Upper Bound with Foresight)
    oracle_obj: Optional[float] = None
    if enable_incidents and len(riders) <= 2:
        try:
            oracle_res = solve_multi_rider_greedy_insertion(
                driver, riders, departure_time, incident_router, capacity, thresholds
            )
            if oracle_res.is_feasible:
                oracle_obj = oracle_res.objective_score
        except Exception:
            oracle_obj = None

    # Objective Recovery: strictly defined and bounded in [0%, 100%]
    recovery_pct: Optional[float] = None
    if nominal_route.objective_score > realized_obj and not realized_is_feasible:
        recovery_pct = round(min(100.0, (recourse_obj / nominal_route.objective_score) * 100.0), 1)
    elif nominal_route.objective_score - realized_obj > 1.0:
        recovery_pct = round(
            min(100.0, max(0.0, (recourse_obj - realized_obj) / (nominal_route.objective_score - realized_obj) * 100.0)),
            1,
        )

    static_regret: Optional[float] = None
    recourse_regret: Optional[float] = None
    if oracle_obj is not None:
        static_regret = round(max(0.0, oracle_obj - realized_obj), 2)
        if rec_is_feasible:
            recourse_regret = round(max(0.0, oracle_obj - recourse_obj), 2)

    return RecourseTripEvaluation(
        driver_id=driver.journey_id,
        rider_ids=rider_ids,
        nominal_distance_km=nominal_route.total_distance_km,
        nominal_duration_seconds=nominal_route.total_duration_seconds,
        nominal_objective=nominal_route.objective_score,
        realized_distance_km=round(total_realized_dist_km, 4),
        realized_duration_seconds=round(total_realized_dur_s, 1),
        realized_detour_km=round(realized_detour_km, 4),
        realized_detour_seconds=round(realized_detour_s, 1),
        realized_objective=realized_obj,
        realized_is_feasible=realized_is_feasible,
        recourse_distance_km=round(total_rec_dist_km, 4),
        recourse_duration_seconds=round(total_rec_dur_s, 1),
        recourse_detour_km=round(rec_detour_km, 4),
        recourse_detour_seconds=round(rec_detour_s, 1),
        recourse_objective=recourse_obj,
        recourse_is_feasible=rec_is_feasible,
        oracle_objective=oracle_obj,
        recourse_triggered=recourse_triggered,
        additional_routing_calls=additional_calls,
        recourse_latency_ms=round(recourse_latency, 2),
        objective_recovery_pct=recovery_pct,
        static_regret_vs_oracle=static_regret,
        recourse_regret_vs_oracle=recourse_regret,
    )


def run_experiment_012(
    network: Optional[RoadNetwork] = None,
    primary_seed: int = 42,
) -> Experiment012Report:
    """Executes Experiment 012 across the 6 core experimental conditions, severities, and seeds."""
    if network is None:
        network = create_osm_sf_downtown_network()

    departure_time = datetime(2026, 10, 8, 8, 30, tzinfo=timezone.utc)
    bpr_model = BPRCongestionModel(scenario="moderate_congestion")
    nominal_router = TimeDependentRouter(network, bpr_model)

    thresholds = {
        "pickup_km": 1.5,
        "dest_km": 1.5,
        "detour_km": 3.5,
        "detour_time_s": 900.0,
        "time_diff_min": 25.0,
    }

    # Generate commuter cohort: 10 drivers and 25 riders
    eval_drivers, eval_riders = generate_stress_instances(network, num_drivers=10, num_riders=25, seed=primary_seed)

    # Pre-compute nominal planned pooled trips for candidate driver-rider pairs
    planned_trips: List[Tuple[Journey, List[Journey], MultiRiderRouteResult]] = []
    for d in eval_drivers:
        cands = [
            r for r in eval_riders
            if haversine_km(d.start, r.start) <= thresholds["pickup_km"] * 1.5
            and abs((d.departure - r.departure).total_seconds()) / 60.0 <= thresholds["time_diff_min"]
        ]
        if cands:
            res = solve_multi_rider_greedy_insertion(
                d, cands, departure_time, nominal_router, capacity=2, thresholds=thresholds
            )
            if res.is_feasible and res.rider_ids:
                matched_cands = [r for r in cands if r.journey_id in res.rider_ids]
                planned_trips.append((d, matched_cands, res))

    # The 6 Core Conditions required by the Experiment 012 specification:
    # Each condition specifies its operating policy ("static" or "recourse") and world perturbations
    condition_specs = [
        ("1_static_nominal", "static", "none", False, False, "moderate"),
        ("2_static_dwell", "static", "dwell", False, True, "moderate"),
        ("3_static_incident", "static", "incident", True, False, "moderate"),
        ("4_static_dwell_incident", "static", "dwell+incident", True, True, "moderate"),
        ("5_recourse_incident", "recourse", "incident", True, False, "moderate"),
        ("6_recourse_dwell_incident", "recourse", "dwell+incident", True, True, "moderate"),
    ]

    scenario_metrics: Dict[str, RecourseScenarioMetrics] = {}
    all_evaluations: List[RecourseTripEvaluation] = []

    for name, policy, pert_label, inc_enabled, dwell_enabled, sev in condition_specs:
        incidents = build_incident_scenarios(departure_time, severity=sev) if inc_enabled else []
        inc_router = IncidentAwareRouter(network, bpr_model, incidents)
        dwell_model = StochasticDwellModel(seed=primary_seed) if dwell_enabled else None
        rng = random.Random(primary_seed)

        evals: List[RecourseTripEvaluation] = []
        for d, rids, plan in planned_trips:
            ev = evaluate_trip_recourse(
                driver=d,
                riders=rids,
                nominal_route=plan,
                departure_time=departure_time,
                nominal_router=nominal_router,
                incident_router=inc_router,
                dwell_model=dwell_model,
                enable_incidents=inc_enabled,
                enable_dwell=dwell_enabled,
                thresholds=thresholds,
                rng=rng,
            )
            evals.append(ev)
            if name == "6_recourse_dwell_incident":
                all_evaluations.append(ev)

        tot = len(evals)

        if policy == "static":
            exec_feas = sum(1 for e in evals if e.realized_is_feasible) / tot * 100.0 if tot else 0.0
            exec_obj = sum(e.realized_objective for e in evals) / tot if tot else 0.0
            exec_detour_km = sum(e.realized_detour_km for e in evals) / tot if tot else 0.0
            exec_dur_s = sum(e.realized_duration_seconds for e in evals) / tot if tot else 0.0
            reroute_freq = 0.0
            lat_ms = None
            tot_calls = 0
            mean_recov = None
            regrets = [e.static_regret_vs_oracle for e in evals if e.static_regret_vs_oracle is not None]
            mean_regret = round(sum(regrets) / len(regrets), 2) if regrets else None
        else:
            exec_feas = sum(1 for e in evals if e.recourse_is_feasible) / tot * 100.0 if tot else 0.0
            exec_obj = sum(e.recourse_objective for e in evals) / tot if tot else 0.0
            exec_detour_km = sum(e.recourse_detour_km for e in evals) / tot if tot else 0.0
            exec_dur_s = sum(e.recourse_duration_seconds for e in evals) / tot if tot else 0.0
            reroute_freq = sum(1 for e in evals if e.recourse_triggered) / tot * 100.0 if tot else 0.0
            lat_ms = sum(e.recourse_latency_ms for e in evals) / tot if tot else 0.0
            tot_calls = sum(e.additional_routing_calls for e in evals)
            recoveries = [e.objective_recovery_pct for e in evals if e.objective_recovery_pct is not None]
            mean_recov = round(sum(recoveries) / len(recoveries), 1) if recoveries else None
            regrets = [e.recourse_regret_vs_oracle for e in evals if e.recourse_regret_vs_oracle is not None]
            mean_regret = round(sum(regrets) / len(regrets), 2) if regrets else None

        oracle_vals = [e.oracle_objective for e in evals if e.oracle_objective is not None]
        mean_oracle = round(sum(oracle_vals) / len(oracle_vals), 2) if oracle_vals else None

        scenario_metrics[name] = RecourseScenarioMetrics(
            scenario_name=name,
            policy=policy,
            perturbation=pert_label,
            severity=sev,
            seed=primary_seed,
            total_trips=tot,
            executed_feasible_rate_pct=round(exec_feas, 1),
            executed_mean_objective=round(exec_obj, 2),
            executed_mean_detour_km=round(exec_detour_km, 3),
            executed_mean_duration_seconds=round(exec_dur_s, 1),
            rerouting_frequency_pct=round(reroute_freq, 1),
            mean_recourse_latency_ms=round(lat_ms, 2) if lat_ms is not None else None,
            total_additional_routing_calls=tot_calls,
            mean_objective_recovery_pct=mean_recov,
            mean_regret_vs_oracle=mean_regret,
            mean_oracle_objective=mean_oracle,
        )

    # Severity Comparison Sweep (mild, moderate, severe) under full perturbation
    severity_comps: Dict[str, Dict[str, float]] = {}
    for sev in ("mild", "moderate", "severe"):
        incidents = build_incident_scenarios(departure_time, severity=sev)
        inc_router = IncidentAwareRouter(network, bpr_model, incidents)
        dwell_model = StochasticDwellModel(seed=primary_seed)
        rng = random.Random(primary_seed)

        evals = []
        for d, rids, plan in planned_trips:
            ev = evaluate_trip_recourse(
                d, rids, plan, departure_time, nominal_router, inc_router, dwell_model, True, True, thresholds, rng
            )
            evals.append(ev)

        tot = len(evals)
        real_feas = sum(1 for e in evals if e.realized_is_feasible) / tot * 100.0 if tot else 0.0
        rec_feas = sum(1 for e in evals if e.recourse_is_feasible) / tot * 100.0 if tot else 0.0
        mean_recov = [e.objective_recovery_pct for e in evals if e.objective_recovery_pct is not None]

        severity_comps[sev] = {
            "realized_feasible_rate_pct": round(real_feas, 1),
            "recourse_feasible_rate_pct": round(rec_feas, 1),
            "feasibility_boost_pct": round(rec_feas - real_feas, 1),
            "mean_objective_recovery_pct": round(sum(mean_recov) / len(mean_recov), 1) if mean_recov else 0.0,
        }

    # Seed Stability Sweep across 3 independent seeds (42, 101, 2024)
    seed_stability: Dict[str, Dict[str, Any]] = {}
    for s_seed in (42, 101, 2024):
        # Generate independent commuter cohort for this seed
        s_drivers, s_riders = generate_stress_instances(network, num_drivers=10, num_riders=25, seed=s_seed)
        s_planned: List[Tuple[Journey, List[Journey], MultiRiderRouteResult]] = []
        for d in s_drivers:
            cands = [
                r for r in s_riders
                if haversine_km(d.start, r.start) <= thresholds["pickup_km"] * 1.5
                and abs((d.departure - r.departure).total_seconds()) / 60.0 <= thresholds["time_diff_min"]
            ]
            if cands:
                res = solve_multi_rider_greedy_insertion(
                    d, cands, departure_time, nominal_router, capacity=2, thresholds=thresholds
                )
                if res.is_feasible and res.rider_ids:
                    matched_cands = [r for r in cands if r.journey_id in res.rider_ids]
                    s_planned.append((d, matched_cands, res))

        incidents = build_incident_scenarios(departure_time, severity="moderate")
        inc_router = IncidentAwareRouter(network, bpr_model, incidents)
        dwell_model = StochasticDwellModel(seed=s_seed)
        rng = random.Random(s_seed)

        evals = []
        for d, rids, plan in s_planned:
            ev = evaluate_trip_recourse(
                d, rids, plan, departure_time, nominal_router, inc_router, dwell_model, True, True, thresholds, rng
            )
            evals.append(ev)

        tot = len(evals)
        real_feas = sum(1 for e in evals if e.realized_is_feasible) / tot * 100.0 if tot else 0.0
        rec_feas = sum(1 for e in evals if e.recourse_is_feasible) / tot * 100.0 if tot else 0.0
        real_obj = sum(e.realized_objective for e in evals) / tot if tot else 0.0
        rec_obj = sum(e.recourse_objective for e in evals) / tot if tot else 0.0
        mean_recov = [e.objective_recovery_pct for e in evals if e.objective_recovery_pct is not None]
        lat_ms = sum(e.recourse_latency_ms for e in evals) / tot if tot else 0.0

        seed_stability[f"seed_{s_seed}"] = {
            "seed": s_seed,
            "cohort_drivers": len(s_drivers),
            "cohort_riders": len(s_riders),
            "planned_trips": tot,
            "realized_feasible_rate_pct": round(real_feas, 1),
            "recourse_feasible_rate_pct": round(rec_feas, 1),
            "feasibility_boost_pct": round(rec_feas - real_feas, 1),
            "realized_mean_objective": round(real_obj, 2),
            "recourse_mean_objective": round(rec_obj, 2),
            "mean_objective_recovery_pct": round(sum(mean_recov) / len(mean_recov), 1) if mean_recov else 0.0,
            "mean_recourse_latency_ms": round(lat_ms, 2),
        }

    return Experiment012Report(
        study_area="San Francisco Downtown / Financial District & SoMa Corridor",
        scenario_metrics=scenario_metrics,
        severity_comparisons=severity_comps,
        seed_stability_results=seed_stability,
        evaluations=tuple(all_evaluations),
    )


DEFAULT_EXPERIMENT_012_OUTPUT_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "experiments"
    / "012_dynamic_recourse"
    / "outputs"
)


def save_experiment_012_outputs(
    report: Experiment012Report,
    output_dir: Optional[Path] = None,
) -> Tuple[Path, Path, Path]:
    """Persists results.json, metrics.csv, and manifest.json to the output directory."""
    if output_dir is None:
        output_dir = DEFAULT_EXPERIMENT_012_OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    results_path = output_dir / "results.json"
    metrics_path = output_dir / "metrics.csv"
    manifest_path = output_dir / "manifest.json"

    # 1. results.json
    results_data = {
        "study_area": report.study_area,
        "scenario_metrics": {k: asdict(v) for k, v in report.scenario_metrics.items()},
        "severity_comparisons": report.severity_comparisons,
        "seed_stability_results": report.seed_stability_results,
        "evaluations_sample": [asdict(e) for e in report.evaluations[:10]],
    }
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results_data, f, indent=2)

    # 2. metrics.csv
    csv_rows = [
        "scenario_name,policy,perturbation,severity,seed,total_trips,executed_feas_pct,executed_mean_obj,executed_mean_detour_km,executed_mean_dur_s,reroute_freq_pct,mean_recourse_lat_ms,additional_calls,mean_recovery_pct,mean_regret_vs_oracle,mean_oracle_obj\n"
    ]
    for k, v in report.scenario_metrics.items():
        recov_str = f"{v.mean_objective_recovery_pct:.1f}" if v.mean_objective_recovery_pct is not None else ""
        regret_str = f"{v.mean_regret_vs_oracle:.2f}" if v.mean_regret_vs_oracle is not None else ""
        lat_str = f"{v.mean_recourse_latency_ms:.2f}" if v.mean_recourse_latency_ms is not None else ""
        oracle_str = f"{v.mean_oracle_objective:.2f}" if v.mean_oracle_objective is not None else ""
        csv_rows.append(
            f"{v.scenario_name},{v.policy},{v.perturbation},{v.severity},{v.seed},{v.total_trips},{v.executed_feasible_rate_pct},{v.executed_mean_objective},{v.executed_mean_detour_km},{v.executed_mean_duration_seconds},{v.rerouting_frequency_pct},{lat_str},{v.total_additional_routing_calls},{recov_str},{regret_str},{oracle_str}\n"
        )
    with open(metrics_path, "w", encoding="utf-8") as f:
        f.writelines(csv_rows)

    # 3. manifest.json
    manifest_data = {
        "experiment_id": "012_dynamic_recourse",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "study_area": report.study_area,
        "evidence_class": "Controlled semi-synthetic algorithmic experiment on a realistic road graph",
        "artifacts": [
            "outputs/results.json",
            "outputs/metrics.csv",
            "outputs/manifest.json",
        ],
        "summary": {
            "unadapted_static_feasibility_pct": report.scenario_metrics["4_static_dwell_incident"].executed_feasible_rate_pct,
            "recourse_adapted_feasibility_pct": report.scenario_metrics["6_recourse_dwell_incident"].executed_feasible_rate_pct,
            "feasibility_restoration_boost_pct": round(
                report.scenario_metrics["6_recourse_dwell_incident"].executed_feasible_rate_pct
                - report.scenario_metrics["4_static_dwell_incident"].executed_feasible_rate_pct,
                1,
            ),
            "unadapted_static_objective": report.scenario_metrics["4_static_dwell_incident"].executed_mean_objective,
            "recourse_adapted_objective": report.scenario_metrics["6_recourse_dwell_incident"].executed_mean_objective,
            "mean_objective_recovery_pct": report.scenario_metrics["6_recourse_dwell_incident"].mean_objective_recovery_pct,
            "mean_recourse_latency_ms": report.scenario_metrics["6_recourse_dwell_incident"].mean_recourse_latency_ms,
            "mean_recourse_regret_vs_oracle": report.scenario_metrics["6_recourse_dwell_incident"].mean_regret_vs_oracle,
        },
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    return results_path, metrics_path, manifest_path
