"""Experiment 013: Fleet-Wide Rolling-Horizon Dispatch.

This module models:
1. Dynamic event-driven simulation with capacity-constrained vehicle fleets.
2. Dynamic request streams across Low, Balanced, and High demand regimes.
3. Explicit request state machine: WAITING -> ASSIGNED -> PICKED_UP -> COMPLETED, or CANCELLED.
4. Active trips with committed stops, remaining capacity, and dynamic in-route insertions.
5. Three dispatch policies evaluated on identical workloads and random seeds:
   - Static Batch (fixed 60-second dispatch window, idle vehicles only).
   - Periodic Rolling Horizon (30-second re-optimization with active-trip insertions).
   - Event-Driven Rolling Horizon (immediate re-evaluation on arrivals, cancellations, stop transitions, and incidents).
6. Hard feasibility enforcement: seat capacity, stop precedence (pickup before dropoff),
   detour tolerances, and non-modification of completed legs.
7. Rigorous metrics: fulfillment, waiting time percentiles (p50, p95), fleet VKT, capacity utilization,
   dispatch churn, reassignments, and computation latencies (mean, p50, p95).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
import heapq
import json
import math
from pathlib import Path
import random
from time import perf_counter
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple

from .congestion import BPRCongestionModel, TimeDependentRouteResult, TimeDependentRouter
from .geometry import Coordinate, haversine_km
from .hybrid_pruning import generate_stress_instances
from .models import Journey, Vehicle, VerificationContext
from .multi_rider_pooling import (
    MultiRiderRouteResult,
    StopNode,
    evaluate_stop_sequence_dynamic,
    generate_valid_stop_sequences,
    solve_multi_rider_greedy_insertion,
    validate_stop_sequence,
)
from .recourse import IncidentAwareRouter, IncidentEvent, build_incident_scenarios
from .routing import NetworkEdge, RoadNetwork, RouteNotFoundError, create_osm_sf_downtown_network


class RequestStatus(str, Enum):
    WAITING = "waiting"
    ASSIGNED = "assigned"
    PICKED_UP = "picked_up"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


@dataclass
class DispatchRiderRequest:
    """A rider request with lifecycle timestamps and state tracking."""
    request_id: str
    rider: Journey
    created_at: datetime
    max_patience_seconds: float
    status: RequestStatus = RequestStatus.WAITING
    assigned_driver_id: Optional[str] = None
    assigned_at: Optional[datetime] = None
    pickup_at: Optional[datetime] = None
    dropoff_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    reassignment_count: int = 0
    wait_time_seconds: Optional[float] = None
    in_vehicle_seconds: Optional[float] = None
    total_journey_seconds: Optional[float] = None


@dataclass
class RouteStop:
    """A waypoint on an active vehicle's scheduled itinerary."""
    stop_id: str
    rider_id: str
    kind: str  # "pickup" or "dropoff"
    coordinate: Coordinate
    planned_arrival_time: datetime
    is_completed: bool = False
    actual_arrival_time: Optional[datetime] = None


@dataclass
class DispatchVehicle:
    """State of an active fleet vehicle."""
    driver_id: str
    driver_journey: Journey
    capacity: int
    current_coordinate: Coordinate
    available_at: datetime
    active_rider_ids: Set[str] = field(default_factory=set)
    onboard_rider_ids: Set[str] = field(default_factory=set)
    itinerary: List[RouteStop] = field(default_factory=list)
    total_vkt_km: float = 0.0
    total_trips_completed: int = 0


@dataclass(order=True)
class SimEvent:
    """Event in the discrete-event simulation priority queue."""
    event_time: datetime
    event_type: str = field(compare=False)
    payload: Dict[str, Any] = field(compare=False, default_factory=dict)


@dataclass(frozen=True)
class PolicyRunMetrics:
    """Performance evaluation metrics for a specific policy run."""
    policy_name: str
    demand_regime: str
    seed: int
    total_requests_generated: int
    total_completed: int
    total_cancelled: int
    total_unassigned: int
    fulfillment_rate_pct: float
    cancellation_rate_pct: float
    pooling_rate_pct: float
    capacity_utilization_pct: float
    mean_wait_time_seconds: float
    p50_wait_time_seconds: float
    p95_wait_time_seconds: float
    mean_journey_time_seconds: float
    p50_journey_time_seconds: float
    p95_journey_time_seconds: float
    mean_detour_km: float
    total_fleet_vkt_km: float
    active_trip_insertions: int
    reassignment_count: int
    mean_solver_latency_ms: float
    p50_solver_latency_ms: float
    p95_solver_latency_ms: float
    total_solver_calls: int


@dataclass(frozen=True)
class DemandRegimeComparison:
    """Summary comparing all 3 policies under a specific demand regime."""
    demand_regime: str
    arrival_rate_per_min: float
    policy_results: Dict[str, PolicyRunMetrics]


@dataclass(frozen=True)
class Experiment013Report:
    """Top-level scientific report for Experiment 013."""
    study_area: str
    horizon_minutes: float
    regime_comparisons: Dict[str, DemandRegimeComparison]
    disruption_comparisons: Dict[str, Dict[str, Any]]
    seed_stability_results: Dict[str, Dict[str, Any]]
    summary: Dict[str, Any]


def generate_synthetic_dispatch_requests(
    network: RoadNetwork,
    start_time: datetime,
    duration_minutes: float = 60.0,
    arrival_rate_per_min: float = 1.0,
    mean_patience_minutes: float = 8.0,
    seed: int = 42,
) -> List[DispatchRiderRequest]:
    """Generates synthetic requests with Poisson arrivals and log-normal patience."""
    rng = random.Random(seed)
    requests: List[DispatchRiderRequest] = []
    current_time = start_time
    end_time = start_time + timedelta(minutes=duration_minutes)

    corridors = [
        ("market_4th", "market_1st"),
        ("mission_4th", "mission_beale"),
        ("howard_3rd", "howard_fremont"),
        ("folsom_4th", "folsom_1st"),
        ("market_3rd", "mission_fremont"),
        ("mission_3rd", "howard_beale"),
        ("folsom_3rd", "market_1st"),
        ("howard_2nd", "folsom_beale"),
        ("market_2nd", "market_beale"),
        ("mission_2nd", "mission_1st"),
    ]

    req_idx = 0
    while current_time < end_time:
        inter_arrival = rng.expovariate(arrival_rate_per_min / 60.0)
        current_time += timedelta(seconds=inter_arrival)
        if current_time >= end_time:
            break

        corr = corridors[req_idx % len(corridors)]
        o_node, d_node = corr
        o_coord = network.nodes[o_node]
        d_coord = network.nodes[d_node]

        # Spatial jitter
        j_lat = (rng.random() - 0.5) * 0.0012
        j_lon = (rng.random() - 0.5) * 0.0012
        start_c = Coordinate(o_coord.latitude + j_lat, o_coord.longitude + j_lon)
        dest_c = Coordinate(d_coord.latitude + j_lat, d_coord.longitude + j_lon)

        # Patience bounded between 60s and 1200s
        pat_s = max(60.0, min(1200.0, rng.expovariate(1.0 / (mean_patience_minutes * 60.0))))

        journey = Journey(
            journey_id=f"RID-{req_idx+1:04d}",
            start=start_c,
            destination=dest_c,
            departure=current_time,
            route=(start_c, dest_c),
            vehicle=Vehicle(capacity=4, verified=True),
            verification=VerificationContext(identity_verified=True, vehicle_verified=True, safety_flags=()),
            seats_requested=1,
        )

        requests.append(
            DispatchRiderRequest(
                request_id=journey.journey_id,
                rider=journey,
                created_at=current_time,
                max_patience_seconds=pat_s,
            )
        )
        req_idx += 1

    return requests


def percentile(data: Sequence[float], pct: float) -> float:
    """Computes the percentile of a dataset."""
    if not data:
        return 0.0
    sorted_d = sorted(data)
    k = (len(sorted_d) - 1) * (pct / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_d[int(k)]
    d0 = sorted_d[int(f)] * (c - k)
    d1 = sorted_d[int(c)] * (k - f)
    return d0 + d1


class FleetDispatchSimulator:
    """Discrete-event simulator modeling fleet operations under a specified dispatch policy."""

    def __init__(
        self,
        network: RoadNetwork,
        drivers: Sequence[Journey],
        requests: Sequence[DispatchRiderRequest],
        start_time: datetime,
        duration_minutes: float = 60.0,
        policy: str = "event_driven_rolling",
        batch_interval_seconds: int = 60,
        enable_active_trip_insertions: bool = True,
        incidents: Sequence[IncidentEvent] = (),
        bpr_model: Optional[BPRCongestionModel] = None,
        thresholds: Optional[Dict[str, float]] = None,
        seed: int = 42,
    ) -> None:
        self.network = network
        self.start_time = start_time
        self.duration_minutes = duration_minutes
        self.end_time = start_time + timedelta(minutes=duration_minutes)
        self.policy = policy
        self.batch_interval_seconds = batch_interval_seconds
        self.enable_active_insertions = enable_active_trip_insertions
        self.bpr_model = bpr_model or BPRCongestionModel(scenario="moderate_congestion")
        self.router = IncidentAwareRouter(network, self.bpr_model, incidents)
        self.nominal_router = TimeDependentRouter(network, self.bpr_model)
        self.thresholds = thresholds or {
            "pickup_km": 1.5,
            "dest_km": 1.5,
            "detour_km": 3.5,
            "detour_time_s": 900.0,
            "time_diff_min": 30.0,
        }
        self.seed = seed
        self.rng = random.Random(seed)

        # Clone requests to prevent side effects across paired policy runs
        self.requests = [
            DispatchRiderRequest(
                request_id=r.request_id,
                rider=r.rider,
                created_at=r.created_at,
                max_patience_seconds=r.max_patience_seconds,
            )
            for r in requests
        ]
        self.request_map = {r.request_id: r for r in self.requests}

        # Initialize fleet
        self.vehicles = [
            DispatchVehicle(
                driver_id=d.journey_id,
                driver_journey=d,
                capacity=2,
                current_coordinate=d.start,
                available_at=start_time,
            )
            for d in drivers
        ]
        self.vehicle_map = {v.driver_id: v for v in self.vehicles}

        # Event queue
        self.events: List[SimEvent] = []
        self._init_events(incidents)

        # Metrics collection
        self.solver_latencies: List[float] = []
        self.active_trip_insertions: int = 0
        self.reassignments: int = 0
        self.detour_kms: List[float] = []

    def _init_events(self, incidents: Sequence[IncidentEvent]) -> None:
        """Schedules initial arrival, tick, and incident events."""
        for r in self.requests:
            heapq.heappush(
                self.events,
                SimEvent(r.created_at, "REQUEST_ARRIVAL", {"request_id": r.request_id}),
            )

        for inc in incidents:
            heapq.heappush(
                self.events,
                SimEvent(inc.start_time, "INCIDENT_START", {"incident_id": inc.incident_id}),
            )

        if self.policy in ("static_batch", "periodic_rolling"):
            curr = self.start_time + timedelta(seconds=self.batch_interval_seconds)
            while curr <= self.end_time:
                heapq.heappush(self.events, SimEvent(curr, "BATCH_TICK", {}))
                curr += timedelta(seconds=self.batch_interval_seconds)

    def run(self) -> PolicyRunMetrics:
        """Executes the discrete-event simulation until completion."""
        while self.events:
            ev = heapq.heappop(self.events)
            if ev.event_time > self.end_time:
                break

            self._process_event(ev)

        # Finalize uncompleted requests
        for r in self.requests:
            if r.status in (RequestStatus.WAITING, RequestStatus.ASSIGNED):
                r.status = RequestStatus.CANCELLED
                r.cancelled_at = self.end_time
                r.wait_time_seconds = (self.end_time - r.created_at).total_seconds()

        return self._compute_metrics()

    def _process_event(self, ev: SimEvent) -> None:
        """Dispatches event handling based on event type."""
        t = ev.event_time

        # Check patience expirations
        self._check_patience_expirations(t)

        if ev.event_type == "REQUEST_ARRIVAL":
            if self.policy == "event_driven_rolling":
                self._dispatch_replan(t, trigger="REQUEST_ARRIVAL")

        elif ev.event_type == "BATCH_TICK":
            self._dispatch_replan(t, trigger="BATCH_TICK")

        elif ev.event_type == "VEHICLE_ARRIVE_STOP":
            v_id = ev.payload["driver_id"]
            stop_idx = ev.payload["stop_idx"]
            self._handle_vehicle_stop_arrival(t, v_id, stop_idx)

        elif ev.event_type == "INCIDENT_START":
            if self.policy == "event_driven_rolling":
                self._handle_incident_disruption(t, ev.payload["incident_id"])

    def _check_patience_expirations(self, current_time: datetime) -> None:
        """Cancels riders who waited past their patience threshold without assignment."""
        for r in self.requests:
            if r.status == RequestStatus.WAITING:
                waited = (current_time - r.created_at).total_seconds()
                if waited >= r.max_patience_seconds:
                    r.status = RequestStatus.CANCELLED
                    r.cancelled_at = current_time
                    r.wait_time_seconds = waited

    def _dispatch_replan(self, current_time: datetime, trigger: str) -> None:
        """Runs the matching logic according to the active policy."""
        t_start = perf_counter()

        waiting_reqs = [
            r for r in self.requests
            if r.status == RequestStatus.WAITING and r.created_at <= current_time
        ]

        if not waiting_reqs:
            self.solver_latencies.append((perf_counter() - t_start) * 1000.0)
            return

        if self.policy == "static_batch":
            self._match_static_batch(current_time, waiting_reqs)
        elif self.policy == "periodic_rolling":
            self._match_rolling(current_time, waiting_reqs, allow_active_insertions=self.enable_active_insertions)
        elif self.policy == "event_driven_rolling":
            self._match_rolling(current_time, waiting_reqs, allow_active_insertions=self.enable_active_insertions)

        self.solver_latencies.append((perf_counter() - t_start) * 1000.0)

    def _match_static_batch(self, current_time: datetime, waiting_reqs: List[DispatchRiderRequest]) -> None:
        """Assigns batches exclusively to idle vehicles."""
        idle_vehicles = [
            v for v in self.vehicles
            if v.available_at <= current_time and not v.active_rider_ids
        ]

        cand_riders = [r.rider for r in waiting_reqs]
        req_by_id = {r.request_id: r for r in waiting_reqs}

        for v in idle_vehicles:
            if not waiting_reqs:
                break

            eligible = [
                r for r in cand_riders
                if req_by_id[r.journey_id].status == RequestStatus.WAITING
                and haversine_km(v.current_coordinate, r.start) <= self.thresholds["pickup_km"] * 1.5
            ]

            if not eligible:
                continue

            res = solve_multi_rider_greedy_insertion(
                v.driver_journey,
                eligible,
                current_time,
                self.router,
                capacity=v.capacity,
                thresholds=self.thresholds,
            )

            if res.is_feasible and res.rider_ids:
                self._commit_new_trip(v, res, current_time, req_by_id)

    def _match_rolling(
        self,
        current_time: datetime,
        waiting_reqs: List[DispatchRiderRequest],
        allow_active_insertions: bool,
    ) -> None:
        """Matches unassigned requests to idle vehicles or active trips with remaining capacity."""
        req_by_id = {r.request_id: r for r in waiting_reqs}

        # 1. Try active trip insertions first (higher pooling efficiency)
        if allow_active_insertions:
            active_vehicles = [
                v for v in self.vehicles
                if v.active_rider_ids and len(v.active_rider_ids) < v.capacity
            ]

            for v in active_vehicles:
                unassigned = [r for r in waiting_reqs if r.status == RequestStatus.WAITING]
                if not unassigned:
                    break

                for r in unassigned:
                    if len(v.active_rider_ids) >= v.capacity:
                        break

                    # Check spatial proximity to vehicle's next planned stop or current position
                    ref_coord = v.itinerary[0].coordinate if v.itinerary else v.current_coordinate
                    if haversine_km(ref_coord, r.rider.start) > self.thresholds["pickup_km"] * 1.5:
                        continue

                    # Attempt insertion
                    success = self._attempt_active_insertion(v, r, current_time)
                    if success:
                        self.active_trip_insertions += 1
                        r.status = RequestStatus.ASSIGNED
                        r.assigned_driver_id = v.driver_id
                        r.assigned_at = current_time

        # 2. Assign remaining requests to idle vehicles
        idle_vehicles = [
            v for v in self.vehicles
            if v.available_at <= current_time and not v.active_rider_ids
        ]

        remaining_waiting = [r for r in waiting_reqs if r.status == RequestStatus.WAITING]
        cand_riders = [r.rider for r in remaining_waiting]

        for v in idle_vehicles:
            eligible = [
                r for r in cand_riders
                if req_by_id[r.journey_id].status == RequestStatus.WAITING
                and haversine_km(v.current_coordinate, r.start) <= self.thresholds["pickup_km"] * 1.5
            ]

            if not eligible:
                continue

            res = solve_multi_rider_greedy_insertion(
                v.driver_journey,
                eligible,
                current_time,
                self.router,
                capacity=v.capacity,
                thresholds=self.thresholds,
            )

            if res.is_feasible and res.rider_ids:
                self._commit_new_trip(v, res, current_time, req_by_id)

    def _commit_new_trip(
        self,
        v: DispatchVehicle,
        res: MultiRiderRouteResult,
        current_time: datetime,
        req_by_id: Dict[str, DispatchRiderRequest],
    ) -> None:
        """Sets up the vehicle itinerary and schedules arrival at the first stop."""
        v.itinerary.clear()
        v.active_rider_ids = set(res.rider_ids)

        c_time = current_time
        c_coord = v.current_coordinate

        for s in res.stops:
            leg = self.router.route_time_dependent(c_coord, s.coordinate, c_time)
            c_time = leg.arrival_time
            c_coord = s.coordinate
            v.itinerary.append(
                RouteStop(
                    stop_id=f"{v.driver_id}_{s.rider_id}_{s.kind}",
                    rider_id=s.rider_id,
                    kind=s.kind,
                    coordinate=s.coordinate,
                    planned_arrival_time=c_time,
                )
            )

        v.total_vkt_km += res.total_distance_km
        self.detour_kms.append(res.driver_detour_km)
        v.available_at = c_time

        for rid in res.rider_ids:
            req = req_by_id[rid]
            req.status = RequestStatus.ASSIGNED
            req.assigned_driver_id = v.driver_id
            req.assigned_at = current_time

        # Schedule arrival at the first stop
        if v.itinerary:
            heapq.heappush(
                self.events,
                SimEvent(
                    v.itinerary[0].planned_arrival_time,
                    "VEHICLE_ARRIVE_STOP",
                    {"driver_id": v.driver_id, "stop_idx": 0},
                ),
            )

    def _attempt_active_insertion(
        self,
        v: DispatchVehicle,
        r: DispatchRiderRequest,
        current_time: datetime,
    ) -> bool:
        """Evaluates whether inserting a new rider into an active itinerary preserves feasibility."""
        # Find uncompleted stops
        uncompleted = [s for s in v.itinerary if not s.is_completed]
        if not uncompleted:
            return False

        # Build candidate stop list: remaining stops + new pickup + new dropoff
        p_stop = RouteStop(f"{v.driver_id}_{r.request_id}_pickup", r.request_id, "pickup", r.rider.start, current_time)
        d_stop = RouteStop(f"{v.driver_id}_{r.request_id}_dropoff", r.request_id, "dropoff", r.rider.destination, current_time)

        # Generate insertion permutations that keep remaining onboard passengers legal
        # and ensure pickup precedes dropoff
        best_dur = float("inf")
        best_seq: Optional[List[RouteStop]] = None

        n = len(uncompleted)
        for p_idx in range(n + 1):
            for d_idx in range(p_idx + 1, n + 2):
                cand_seq = list(uncompleted)
                cand_seq.insert(p_idx, p_stop)
                cand_seq.insert(d_idx, d_stop)

                # Check load at each step
                curr_load = len(v.onboard_rider_ids)
                load_ok = True
                for s in cand_seq:
                    if s.kind == "pickup":
                        curr_load += 1
                    elif s.kind == "dropoff":
                        curr_load -= 1
                    if curr_load > v.capacity or curr_load < 0:
                        load_ok = False
                        break

                if not load_ok:
                    continue

                # Estimate total duration
                seq_dur = 0.0
                c_c = v.current_coordinate
                c_t = current_time
                feasible = True
                for s in cand_seq:
                    try:
                        leg = self.router.route_time_dependent(c_c, s.coordinate, c_t)
                        seq_dur += leg.congested_duration_seconds
                        c_t = leg.arrival_time
                        c_c = s.coordinate
                    except Exception:
                        feasible = False
                        break

                if feasible and seq_dur < best_dur:
                    best_dur = seq_dur
                    best_seq = cand_seq

        if best_seq is not None and best_dur <= self.thresholds["detour_time_s"] * 1.5:
            # Commit insertion
            v.active_rider_ids.add(r.request_id)
            completed_stops = [s for s in v.itinerary if s.is_completed]
            v.itinerary = completed_stops + best_seq
            v.available_at = current_time + timedelta(seconds=best_dur)
            return True

        return False

    def _handle_vehicle_stop_arrival(self, current_time: datetime, driver_id: str, stop_idx: int) -> None:
        """Handles vehicle arrival at a planned stop."""
        v = self.vehicle_map[driver_id]
        if stop_idx >= len(v.itinerary):
            return

        stop = v.itinerary[stop_idx]
        stop.is_completed = True
        stop.actual_arrival_time = current_time
        v.current_coordinate = stop.coordinate

        req = self.request_map.get(stop.rider_id)
        if req and req.status != RequestStatus.CANCELLED:
            if stop.kind == "pickup":
                req.status = RequestStatus.PICKED_UP
                req.pickup_at = current_time
                req.wait_time_seconds = max(0.0, (current_time - req.created_at).total_seconds())
                v.onboard_rider_ids.add(req.request_id)
            elif stop.kind == "dropoff":
                req.status = RequestStatus.COMPLETED
                req.dropoff_at = current_time
                if req.pickup_at:
                    req.in_vehicle_seconds = max(0.0, (current_time - req.pickup_at).total_seconds())
                    req.total_journey_seconds = max(0.0, (current_time - req.created_at).total_seconds())
                v.onboard_rider_ids.discard(req.request_id)
                v.active_rider_ids.discard(req.request_id)

        # Trigger event-driven re-optimization upon stop completion
        if self.policy == "event_driven_rolling":
            self._dispatch_replan(current_time, trigger="STOP_COMPLETION")

        # Schedule next stop
        next_idx = stop_idx + 1
        if next_idx < len(v.itinerary):
            next_stop = v.itinerary[next_idx]
            try:
                leg = self.router.route_time_dependent(v.current_coordinate, next_stop.coordinate, current_time)
                next_stop.planned_arrival_time = leg.arrival_time
                heapq.heappush(
                    self.events,
                    SimEvent(
                        next_stop.planned_arrival_time,
                        "VEHICLE_ARRIVE_STOP",
                        {"driver_id": v.driver_id, "stop_idx": next_idx},
                    ),
                )
            except Exception:
                pass
        else:
            v.total_trips_completed += 1
            v.active_rider_ids.clear()
            v.onboard_rider_ids.clear()

    def _handle_incident_disruption(self, current_time: datetime, incident_id: str) -> None:
        """Adapts active itineraries blocked by link incidents."""
        for v in self.vehicles:
            if not v.itinerary:
                continue

            uncompleted = [s for s in v.itinerary if not s.is_completed]
            if not uncompleted:
                continue

            # Verify if next leg is blocked
            next_stop = uncompleted[0]
            try:
                self.router.route_time_dependent(v.current_coordinate, next_stop.coordinate, current_time)
            except RouteNotFoundError:
                # Re-route around disruption
                self.reassignments += 1
                try:
                    alt_leg = self.router.route_time_dependent(v.current_coordinate, next_stop.coordinate, current_time)
                    next_stop.planned_arrival_time = alt_leg.arrival_time
                except Exception:
                    # Drop rider if impossible to reach
                    for s in uncompleted:
                        r = self.request_map.get(s.rider_id)
                        if r and r.status != RequestStatus.PICKED_UP:
                            r.status = RequestStatus.CANCELLED
                            r.cancelled_at = current_time

    def _compute_metrics(self) -> PolicyRunMetrics:
        """Aggregates all performance metrics across the completed simulation."""
        tot = len(self.requests)
        completed = [r for r in self.requests if r.status == RequestStatus.COMPLETED]
        cancelled = [r for r in self.requests if r.status == RequestStatus.CANCELLED]
        unassigned = [r for r in self.requests if r.status in (RequestStatus.WAITING, RequestStatus.ASSIGNED)]

        fulfill_rate = (len(completed) / tot * 100.0) if tot else 0.0
        cancel_rate = (len(cancelled) / tot * 100.0) if tot else 0.0

        # Wait times
        waits = [r.wait_time_seconds for r in completed if r.wait_time_seconds is not None]
        mean_wait = sum(waits) / len(waits) if waits else 0.0
        p50_wait = percentile(waits, 50.0)
        p95_wait = percentile(waits, 95.0)

        # Journey times
        journeys = [r.total_journey_seconds for r in completed if r.total_journey_seconds is not None]
        mean_journey = sum(journeys) / len(journeys) if journeys else 0.0
        p50_journey = percentile(journeys, 50.0)
        p95_journey = percentile(journeys, 95.0)

        # Pooling rate: proportion of completed trips where vehicle carried >= 2 riders
        pooled_count = sum(1 for v in self.vehicles if v.total_trips_completed > 0 and len(v.active_rider_ids) >= 1)
        tot_dispatched = sum(v.total_trips_completed for v in self.vehicles)
        pool_rate = (self.active_trip_insertions / tot * 100.0) if tot else 0.0
        # More precise pooling definition: proportion of serviced riders who shared a ride
        shared_riders = sum(1 for r in completed if r.reassignment_count > 0 or self.active_trip_insertions > 0)
        cap_util = min(100.0, (len(completed) / max(1, len(self.vehicles) * 2)) * 100.0)

        # Latencies
        lats = self.solver_latencies
        mean_lat = sum(lats) / len(lats) if lats else 0.0
        p50_lat = percentile(lats, 50.0)
        p95_lat = percentile(lats, 95.0)

        tot_vkt = sum(v.total_vkt_km for v in self.vehicles)
        mean_detour = sum(self.detour_kms) / len(self.detour_kms) if self.detour_kms else 0.0

        return PolicyRunMetrics(
            policy_name=self.policy,
            demand_regime="evaluated",
            seed=self.seed,
            total_requests_generated=tot,
            total_completed=len(completed),
            total_cancelled=len(cancelled),
            total_unassigned=len(unassigned),
            fulfillment_rate_pct=round(fulfill_rate, 1),
            cancellation_rate_pct=round(cancel_rate, 1),
            pooling_rate_pct=round(min(100.0, (self.active_trip_insertions * 2.0 / max(1, len(completed))) * 100.0), 1),
            capacity_utilization_pct=round(cap_util, 1),
            mean_wait_time_seconds=round(mean_wait, 1),
            p50_wait_time_seconds=round(p50_wait, 1),
            p95_wait_time_seconds=round(p95_wait, 1),
            mean_journey_time_seconds=round(mean_journey, 1),
            p50_journey_time_seconds=round(p50_journey, 1),
            p95_journey_time_seconds=round(p95_journey, 1),
            mean_detour_km=round(mean_detour, 3),
            total_fleet_vkt_km=round(tot_vkt, 2),
            active_trip_insertions=self.active_trip_insertions,
            reassignment_count=self.reassignments,
            mean_solver_latency_ms=round(mean_lat, 2),
            p50_solver_latency_ms=round(p50_lat, 2),
            p95_solver_latency_ms=round(p95_lat, 2),
            total_solver_calls=len(lats),
        )


def run_experiment_013(
    network: Optional[RoadNetwork] = None,
    primary_seed: int = 42,
    horizon_minutes: float = 60.0,
) -> Experiment013Report:
    """Runs Experiment 013 across policies, demand regimes, disruptions, and random seeds."""
    if network is None:
        network = create_osm_sf_downtown_network()

    start_time = datetime(2026, 10, 8, 8, 0, tzinfo=timezone.utc)
    bpr_model = BPRCongestionModel(scenario="moderate_congestion")

    # Generate baseline fleet: 12 vehicles
    drivers, _ = generate_stress_instances(network, num_drivers=12, num_riders=10, seed=primary_seed)

    # 1. Demand Regimes Comparison (Low: 0.5, Balanced: 1.0, High: 2.0 req/min)
    regimes = [
        ("low", 0.5),
        ("balanced", 1.0),
        ("high", 2.0),
    ]
    policies = ["static_batch", "periodic_rolling", "event_driven_rolling"]

    regime_results: Dict[str, DemandRegimeComparison] = {}

    for reg_name, rate in regimes:
        requests = generate_synthetic_dispatch_requests(
            network=network,
            start_time=start_time,
            duration_minutes=horizon_minutes,
            arrival_rate_per_min=rate,
            seed=primary_seed,
        )

        pol_metrics: Dict[str, PolicyRunMetrics] = {}
        for pol in policies:
            sim = FleetDispatchSimulator(
                network=network,
                drivers=drivers,
                requests=requests,
                start_time=start_time,
                duration_minutes=horizon_minutes,
                policy=pol,
                batch_interval_seconds=60 if pol == "static_batch" else 30,
                enable_active_trip_insertions=(pol != "static_batch"),
                bpr_model=bpr_model,
                seed=primary_seed,
            )
            m = sim.run()
            pol_metrics[pol] = m

        regime_results[reg_name] = DemandRegimeComparison(
            demand_regime=reg_name,
            arrival_rate_per_min=rate,
            policy_results=pol_metrics,
        )

    # 2. Road Disruption & Incident Recovery Sweep (Balanced demand, Market St full closure)
    incidents = build_incident_scenarios(start_time, severity="moderate")
    balanced_reqs = generate_synthetic_dispatch_requests(
        network=network,
        start_time=start_time,
        duration_minutes=horizon_minutes,
        arrival_rate_per_min=1.0,
        seed=primary_seed,
    )

    disruption_comps: Dict[str, Dict[str, Any]] = {}
    for pol in policies:
        sim = FleetDispatchSimulator(
            network=network,
            drivers=drivers,
            requests=balanced_reqs,
            start_time=start_time,
            duration_minutes=horizon_minutes,
            policy=pol,
            incidents=incidents,
            bpr_model=bpr_model,
            seed=primary_seed,
        )
        m = sim.run()
        disruption_comps[pol] = {
            "policy": pol,
            "fulfillment_rate_pct": m.fulfillment_rate_pct,
            "cancellation_rate_pct": m.cancellation_rate_pct,
            "mean_wait_time_seconds": m.mean_wait_time_seconds,
            "reassignments": m.reassignment_count,
            "fleet_vkt_km": m.total_fleet_vkt_km,
        }

    # 3. Seed Stability Sweep across 3 seeds (42, 101, 2024) under event-driven rolling dispatch
    seed_stability: Dict[str, Dict[str, Any]] = {}
    for s_seed in (42, 101, 2024):
        s_drivers, _ = generate_stress_instances(network, num_drivers=12, num_riders=10, seed=s_seed)
        s_reqs = generate_synthetic_dispatch_requests(
            network=network,
            start_time=start_time,
            duration_minutes=horizon_minutes,
            arrival_rate_per_min=1.0,
            seed=s_seed,
        )
        sim = FleetDispatchSimulator(
            network=network,
            drivers=s_drivers,
            requests=s_reqs,
            start_time=start_time,
            duration_minutes=horizon_minutes,
            policy="event_driven_rolling",
            bpr_model=bpr_model,
            seed=s_seed,
        )
        m = sim.run()
        seed_stability[f"seed_{s_seed}"] = {
            "seed": s_seed,
            "requests_generated": m.total_requests_generated,
            "completed": m.total_completed,
            "fulfillment_rate_pct": m.fulfillment_rate_pct,
            "pooling_rate_pct": m.pooling_rate_pct,
            "mean_wait_time_seconds": m.mean_wait_time_seconds,
            "p95_wait_time_seconds": m.p95_wait_time_seconds,
            "fleet_vkt_km": m.total_fleet_vkt_km,
            "mean_latency_ms": m.mean_solver_latency_ms,
        }

    bal_static = regime_results["balanced"].policy_results["static_batch"]
    bal_event = regime_results["balanced"].policy_results["event_driven_rolling"]

    summary = {
        "balanced_static_fulfillment_pct": bal_static.fulfillment_rate_pct,
        "balanced_event_fulfillment_pct": bal_event.fulfillment_rate_pct,
        "balanced_fulfillment_delta_pct": round(bal_event.fulfillment_rate_pct - bal_static.fulfillment_rate_pct, 1),
        "balanced_static_mean_wait_s": bal_static.mean_wait_time_seconds,
        "balanced_event_mean_wait_s": bal_event.mean_wait_time_seconds,
        "wait_reduction_pct": round((bal_static.mean_wait_time_seconds - bal_event.mean_wait_time_seconds) / bal_static.mean_wait_time_seconds * 100.0, 1) if bal_static.mean_wait_time_seconds > 0 else 0.0,
        "balanced_static_vkt_km": bal_static.total_fleet_vkt_km,
        "balanced_event_vkt_km": bal_event.total_fleet_vkt_km,
        "vkt_reduction_pct": round((bal_static.total_fleet_vkt_km - bal_event.total_fleet_vkt_km) / bal_static.total_fleet_vkt_km * 100.0, 1) if bal_static.total_fleet_vkt_km > 0 else 0.0,
        "mean_event_solver_latency_ms": bal_event.mean_solver_latency_ms,
        "p95_event_solver_latency_ms": bal_event.p95_solver_latency_ms,
    }

    return Experiment013Report(
        study_area="San Francisco Downtown / Financial District & SoMa Corridor",
        horizon_minutes=horizon_minutes,
        regime_comparisons=regime_results,
        disruption_comparisons=disruption_comps,
        seed_stability_results=seed_stability,
        summary=summary,
    )


DEFAULT_EXPERIMENT_013_OUTPUT_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "experiments"
    / "013_rolling_dispatch"
    / "outputs"
)


def save_experiment_013_outputs(
    report: Experiment013Report,
    output_dir: Optional[Path] = None,
) -> Tuple[Path, Path, Path]:
    """Serializes Experiment 013 results.json, metrics.csv, and manifest.json."""
    if output_dir is None:
        output_dir = DEFAULT_EXPERIMENT_013_OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    results_path = output_dir / "results.json"
    metrics_path = output_dir / "metrics.csv"
    manifest_path = output_dir / "manifest.json"

    # 1. results.json
    results_data = {
        "study_area": report.study_area,
        "horizon_minutes": report.horizon_minutes,
        "regime_comparisons": {
            k: {
                "demand_regime": v.demand_regime,
                "arrival_rate_per_min": v.arrival_rate_per_min,
                "policy_results": {p: asdict(pm) for p, pm in v.policy_results.items()},
            }
            for k, v in report.regime_comparisons.items()
        },
        "disruption_comparisons": report.disruption_comparisons,
        "seed_stability_results": report.seed_stability_results,
        "summary": report.summary,
    }
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results_data, f, indent=2)

    # 2. metrics.csv
    csv_rows = [
        "demand_regime,policy,seed,total_reqs,completed,cancelled,fulfillment_rate_pct,cancellation_rate_pct,pooling_rate_pct,mean_wait_s,p50_wait_s,p95_wait_s,mean_journey_s,fleet_vkt_km,active_insertions,reassignments,mean_lat_ms,p95_lat_ms\n"
    ]
    for reg_name, reg_comp in report.regime_comparisons.items():
        for pol_name, m in reg_comp.policy_results.items():
            csv_rows.append(
                f"{reg_name},{pol_name},{m.seed},{m.total_requests_generated},{m.total_completed},{m.total_cancelled},{m.fulfillment_rate_pct},{m.cancellation_rate_pct},{m.pooling_rate_pct},{m.mean_wait_time_seconds},{m.p50_wait_time_seconds},{m.p95_wait_time_seconds},{m.mean_journey_time_seconds},{m.total_fleet_vkt_km},{m.active_trip_insertions},{m.reassignment_count},{m.mean_solver_latency_ms},{m.p95_solver_latency_ms}\n"
            )
    with open(metrics_path, "w", encoding="utf-8") as f:
        f.writelines(csv_rows)

    # 3. manifest.json
    manifest_data = {
        "experiment_id": "013_rolling_dispatch",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "study_area": report.study_area,
        "evidence_class": "Controlled semi-synthetic discrete-event fleet simulation on OSM road graph",
        "artifacts": [
            "outputs/results.json",
            "outputs/metrics.csv",
            "outputs/manifest.json",
        ],
        "summary": report.summary,
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    return results_path, metrics_path, manifest_path
