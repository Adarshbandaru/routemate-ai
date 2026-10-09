"""Experiment 007: Multi-Rider Assignment Optimality and Scaling Benchmark.

Evaluates Greedy priority, Auction-Swap local search, and Exact Branch-and-Bound
solvers across controlled synthetic scale cohorts.

Quantifies the empirical optimality gap, vehicle capacity utilization, solver
runtimes, and search complexity (branch-and-bound nodes explored) under fixed seeds.
"""
import csv
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from math import isfinite
from pathlib import Path
import random
from time import perf_counter
from typing import Dict, List, Optional, Sequence, Tuple

from .assignment import (
    ASSIGNMENT_VERSION,
    AssignmentResult,
    assign_auction,
    assign_greedy,
    assign_optimal,
    build_feasibility_graph,
    compute_optimality_gap,
)
from .geometry import Coordinate
from .models import Journey, Vehicle, VerificationContext

EXPERIMENT_007_VERSION = "assignment-scaling-v1"

DEFAULT_SCALE_CONFIGS = (
    ("micro_5x3", 5, 3),
    ("small_10x5", 10, 5),
    ("medium_20x10", 20, 10),
    ("large_30x15", 30, 15),
    ("stress_40x20", 40, 20),
)

DEFAULT_SEEDS = (42, 101, 202)


def generate_batch_instance(
    num_riders: int,
    num_drivers: int,
    seed: int = 42,
) -> Tuple[Tuple[Journey, ...], Tuple[Journey, ...]]:
    """Deterministically generates a cohort of rider and driver journeys along an urban corridor."""
    if num_riders < 1 or num_drivers < 1:
        raise ValueError("num_riders and num_drivers must be >= 1")
    rng = random.Random(seed)
    base_time = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)

    # Generate drivers
    drivers: List[Journey] = []
    for d_idx in range(num_drivers):
        start_lat = rng.uniform(-0.015, 0.015)
        start_lon = rng.uniform(-0.015, 0.015)
        dest_lat = rng.uniform(-0.015, 0.015)
        dest_lon = rng.uniform(0.10, 0.14)
        start = Coordinate(start_lat, start_lon)
        dest = Coordinate(dest_lat, dest_lon)
        dep_offset = rng.uniform(-8.0, 8.0)
        departure = base_time.replace(minute=int(10 + dep_offset) % 60)
        cap = rng.choice([2, 3, 4])
        route = (
            start,
            Coordinate((start_lat + dest_lat) / 2.0, (start_lon + dest_lon) / 2.0),
            dest,
        )
        drivers.append(
            Journey(
                journey_id=f"D{d_idx + 1:02d}",
                start=start,
                destination=dest,
                departure=departure,
                route=route,
                vehicle=Vehicle(kind="car", capacity=cap, verified=True),
                verification=VerificationContext(
                    identity_verified=True,
                    vehicle_verified=True,
                    safety_flags=(),
                ),
                seats_requested=1,
            )
        )

    # Generate riders
    riders: List[Journey] = []
    for r_idx in range(num_riders):
        p_lat = rng.uniform(-0.012, 0.012)
        p_lon = rng.uniform(0.005, 0.035)
        d_lat = rng.uniform(-0.012, 0.012)
        d_lon = rng.uniform(0.075, 0.115)
        pickup = Coordinate(p_lat, p_lon)
        dropoff = Coordinate(d_lat, d_lon)
        dep_offset = rng.uniform(-6.0, 6.0)
        departure = base_time.replace(minute=int(12 + dep_offset) % 60)
        req_seats = rng.choice([1, 1, 1, 2])
        route = (pickup, dropoff)
        riders.append(
            Journey(
                journey_id=f"R{r_idx + 1:02d}",
                start=pickup,
                destination=dropoff,
                departure=departure,
                route=route,
                vehicle=Vehicle(kind="car", capacity=0, verified=True),
                verification=VerificationContext(
                    identity_verified=True,
                    vehicle_verified=True,
                    safety_flags=(),
                ),
                seats_requested=req_seats,
            )
        )

    return tuple(riders), tuple(drivers)


@dataclass(frozen=True)
class MethodMetrics:
    """Performance and solution quality metrics for a single algorithm execution."""
    method: str
    objective_value: float
    optimality_gap_pct: float
    matched_riders: int
    match_rate_pct: float
    active_drivers: int
    capacity_utilization_pct: float
    solve_time_ms: float
    nodes_explored: int


@dataclass(frozen=True)
class ScaleBenchmarkPoint:
    """Full benchmark evaluation point for one synthetic cohort instance across all solvers."""
    scale_name: str
    num_riders: int
    num_drivers: int
    seed: int
    total_pairs: int
    feasible_edges: int
    graph_build_ms: float
    total_seat_capacity: int
    total_requested_seats: int
    greedy: MethodMetrics
    auction: MethodMetrics
    optimal: MethodMetrics


@dataclass(frozen=True)
class ScaleAggregateSummary:
    """Summary statistics for a scale cohort aggregated across evaluation seeds."""
    scale_name: str
    num_riders: int
    num_drivers: int
    instances_evaluated: int
    mean_feasible_edges: float
    edge_density_pct: float
    greedy_mean_objective: float
    greedy_mean_gap_pct: float
    greedy_mean_runtime_ms: float
    auction_mean_objective: float
    auction_mean_gap_pct: float
    auction_mean_runtime_ms: float
    optimal_mean_objective: float
    optimal_mean_runtime_ms: float
    optimal_mean_nodes_explored: float


@dataclass(frozen=True)
class AssignmentScalingReport:
    """Complete Experiment 007 report containing raw evaluation points and aggregated metrics."""
    experiment_version: str
    scale_points: Tuple[ScaleBenchmarkPoint, ...]
    aggregates: Tuple[ScaleAggregateSummary, ...]
    overall_greedy_mean_gap_pct: float
    overall_auction_mean_gap_pct: float
    total_evaluations: int


def _extract_metrics(
    res: AssignmentResult,
    opt_res: AssignmentResult,
    total_riders: int,
    total_capacity: int,
) -> MethodMetrics:
    gap = compute_optimality_gap(opt_res, res)
    seats_used = sum(g.seats_used for g in res.groups)
    cap_util = (seats_used / total_capacity * 100.0) if total_capacity > 0 else 0.0
    match_rate = (res.matched_rider_count / total_riders * 100.0) if total_riders > 0 else 0.0
    return MethodMetrics(
        method=res.method,
        objective_value=round(res.objective_value, 2),
        optimality_gap_pct=round(gap, 2),
        matched_riders=res.matched_rider_count,
        match_rate_pct=round(match_rate, 1),
        active_drivers=res.matched_driver_count,
        capacity_utilization_pct=round(cap_util, 1),
        solve_time_ms=round(res.solve_seconds * 1000.0, 3),
        nodes_explored=res.nodes_explored,
    )


def run_scale_point(
    scale_name: str,
    num_riders: int,
    num_drivers: int,
    seed: int,
    timeout_seconds: float = 5.0,
) -> ScaleBenchmarkPoint:
    """Executes Greedy, Auction, and Optimal solvers on a single synthetic instance."""
    riders, drivers = generate_batch_instance(num_riders, num_drivers, seed=seed)
    total_cap = sum(d.vehicle.capacity for d in drivers)
    total_req = sum(r.seats_requested for r in riders)

    edges, total_pairs, graph_sec = build_feasibility_graph(riders, drivers)
    graph_ms = round(graph_sec * 1000.0, 3)

    # 1. Exact optimal solver first as ground truth
    opt_res = assign_optimal(edges, riders, drivers, timeout_seconds=timeout_seconds)
    opt_metrics = _extract_metrics(opt_res, opt_res, len(riders), total_cap)

    # 2. Greedy solver
    greedy_res = assign_greedy(edges, riders, drivers)
    greedy_metrics = _extract_metrics(greedy_res, opt_res, len(riders), total_cap)

    # 3. Auction-swap solver
    auction_res = assign_auction(edges, riders, drivers)
    auction_metrics = _extract_metrics(auction_res, opt_res, len(riders), total_cap)

    return ScaleBenchmarkPoint(
        scale_name=scale_name,
        num_riders=num_riders,
        num_drivers=num_drivers,
        seed=seed,
        total_pairs=total_pairs,
        feasible_edges=len(edges),
        graph_build_ms=graph_ms,
        total_seat_capacity=total_cap,
        total_requested_seats=total_req,
        greedy=greedy_metrics,
        auction=auction_metrics,
        optimal=opt_metrics,
    )


def run_assignment_scaling_experiment(
    scale_configs: Optional[Sequence[Tuple[str, int, int]]] = None,
    seeds: Sequence[int] = DEFAULT_SEEDS,
    timeout_seconds: float = 5.0,
) -> AssignmentScalingReport:
    """Executes the complete Experiment 007 benchmark suite."""
    configs = DEFAULT_SCALE_CONFIGS if scale_configs is None else scale_configs
    points: List[ScaleBenchmarkPoint] = []

    for name, n_riders, n_drivers in configs:
        for seed in seeds:
            pt = run_scale_point(name, n_riders, n_drivers, seed, timeout_seconds=timeout_seconds)
            points.append(pt)

    # Compute aggregates per scale configuration
    aggregates: List[ScaleAggregateSummary] = []
    for name, n_riders, n_drivers in configs:
        pts = [p for p in points if p.scale_name == name]
        k = len(pts)
        mean_edges = sum(p.feasible_edges for p in pts) / k
        total_pairs = pts[0].total_pairs
        density = (mean_edges / total_pairs * 100.0) if total_pairs > 0 else 0.0

        aggregates.append(
            ScaleAggregateSummary(
                scale_name=name,
                num_riders=n_riders,
                num_drivers=n_drivers,
                instances_evaluated=k,
                mean_feasible_edges=round(mean_edges, 1),
                edge_density_pct=round(density, 1),
                greedy_mean_objective=round(sum(p.greedy.objective_value for p in pts) / k, 2),
                greedy_mean_gap_pct=round(sum(p.greedy.optimality_gap_pct for p in pts) / k, 2),
                greedy_mean_runtime_ms=round(sum(p.greedy.solve_time_ms for p in pts) / k, 3),
                auction_mean_objective=round(sum(p.auction.objective_value for p in pts) / k, 2),
                auction_mean_gap_pct=round(sum(p.auction.optimality_gap_pct for p in pts) / k, 2),
                auction_mean_runtime_ms=round(sum(p.auction.solve_time_ms for p in pts) / k, 3),
                optimal_mean_objective=round(sum(p.optimal.objective_value for p in pts) / k, 2),
                optimal_mean_runtime_ms=round(sum(p.optimal.solve_time_ms for p in pts) / k, 3),
                optimal_mean_nodes_explored=round(sum(p.optimal.nodes_explored for p in pts) / k, 1),
            )
        )

    overall_greedy_gap = sum(p.greedy.optimality_gap_pct for p in points) / len(points)
    overall_auction_gap = sum(p.auction.optimality_gap_pct for p in points) / len(points)

    return AssignmentScalingReport(
        experiment_version=EXPERIMENT_007_VERSION,
        scale_points=tuple(points),
        aggregates=tuple(aggregates),
        overall_greedy_mean_gap_pct=round(overall_greedy_gap, 2),
        overall_auction_mean_gap_pct=round(overall_auction_gap, 2),
        total_evaluations=len(points),
    )


def save_experiment_outputs(
    report: AssignmentScalingReport,
    output_dir: Path,
) -> Dict[str, Path]:
    """Serializes experiment results to JSON and CSV formats."""
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: Dict[str, Path] = {}

    # 1. results.json
    results_path = output_dir / "results.json"
    results_data = {
        "experiment_version": report.experiment_version,
        "total_evaluations": report.total_evaluations,
        "overall_greedy_mean_gap_pct": report.overall_greedy_mean_gap_pct,
        "overall_auction_mean_gap_pct": report.overall_auction_mean_gap_pct,
        "aggregates": [asdict(a) for a in report.aggregates],
        "points": [asdict(p) for p in report.scale_points],
    }
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results_data, f, indent=2)
    paths["results_json"] = results_path

    # 2. summary_metrics.csv
    csv_path = output_dir / "metrics.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "scale_name", "num_riders", "num_drivers", "mean_feasible_edges",
            "edge_density_pct", "greedy_obj", "greedy_gap_pct", "greedy_ms",
            "auction_obj", "auction_gap_pct", "auction_ms",
            "optimal_obj", "optimal_ms", "optimal_nodes_explored"
        ])
        for a in report.aggregates:
            writer.writerow([
                a.scale_name, a.num_riders, a.num_drivers, a.mean_feasible_edges,
                a.edge_density_pct, a.greedy_mean_objective, a.greedy_mean_gap_pct, a.greedy_mean_runtime_ms,
                a.auction_mean_objective, a.auction_mean_gap_pct, a.auction_mean_runtime_ms,
                a.optimal_mean_objective, a.optimal_mean_runtime_ms, a.optimal_mean_nodes_explored
            ])
    paths["metrics_csv"] = csv_path

    return paths
