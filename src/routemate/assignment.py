"""Multi-rider batch assignment with greedy, auction-swap, and exact optimal solvers.

All algorithms use only the Python standard library.
"""
from dataclasses import dataclass
from time import perf_counter
from typing import Dict, List, Optional, Sequence, Set, Tuple

from .candidates import (
    FeasibilityDecision,
    evaluate_feasibility,
    generate_features,
    retrieve_candidates,
)
from .models import Journey

ASSIGNMENT_VERSION = "assignment-engine-v2"
METHODS = ("greedy", "auction", "optimal")


@dataclass(frozen=True)
class MatchEdge:
    """Scored, feasible rider–driver edge in the compatibility graph."""
    driver_id: str
    rider_id: str
    score: float
    decision: FeasibilityDecision


@dataclass(frozen=True)
class AssignmentGroup:
    """A driver with its assigned riders after solving."""
    driver_id: str
    rider_ids: Tuple[str, ...]
    seats_used: int
    remaining_capacity: int
    group_score: float


@dataclass(frozen=True)
class AssignmentResult:
    """Batch assignment output with full diagnostics."""
    groups: Tuple[AssignmentGroup, ...]
    unmatched_rider_ids: Tuple[str, ...]
    unmatched_driver_ids: Tuple[str, ...]
    matched_rider_count: int
    matched_driver_count: int
    objective_value: float
    method: str
    total_pairs: int
    feasible_edges: int
    graph_seconds: float
    solve_seconds: float
    nodes_explored: int = 0


def build_feasibility_graph(
    riders: Sequence[Journey],
    drivers: Sequence[Journey],
    router: Optional[object] = None,
) -> Tuple[Tuple[MatchEdge, ...], int, float]:
    """Build the bipartite feasibility graph for a batch of riders and drivers.

    Returns ``(feasible_edges, total_pairs_evaluated, build_seconds)``.
    Edges are sorted by ``(-score, driver_id, rider_id)`` for determinism.
    """
    if not all(isinstance(r, Journey) for r in riders):
        raise TypeError("riders must be Journey instances")
    if not all(isinstance(d, Journey) for d in drivers):
        raise TypeError("drivers must be Journey instances")
    rids = [r.journey_id for r in riders]
    dids = [d.journey_id for d in drivers]
    if len(rids) != len(set(rids)):
        raise ValueError("rider IDs must be unique")
    if len(dids) != len(set(dids)):
        raise ValueError("driver IDs must be unique")
    if set(rids) & set(dids):
        raise ValueError("rider and driver ID sets must be disjoint")

    started = perf_counter()
    edges: List[MatchEdge] = []
    total = 0
    for rider in riders:
        ret = retrieve_candidates(rider, drivers)
        feats = generate_features(ret.pairs, router=router)
        for pair, frow in zip(ret.pairs, feats):
            total += 1
            dec = evaluate_feasibility(pair, frow)
            if dec.final_eligible:
                edges.append(MatchEdge(dec.driver_id, dec.rider_id, dec.score, dec))
    edges.sort(key=lambda e: (-e.score, e.driver_id, e.rider_id))
    return tuple(edges), total, perf_counter() - started


def _finish(
    asgn: Dict[str, List[str]], seats: Dict[str, int], scores: Dict[str, float],
    riders: Sequence[Journey], drivers: Sequence[Journey],
    done: Set[str], edges: Sequence[MatchEdge], method: str, seconds: float,
    nodes_explored: int = 0,
) -> AssignmentResult:
    """Build a deterministic AssignmentResult from solver state."""
    dm = {d.journey_id: d for d in drivers}
    groups = tuple(
        AssignmentGroup(did, tuple(sorted(asgn[did])), seats.get(did, 0),
                        dm[did].vehicle.capacity - seats.get(did, 0),
                        round(scores.get(did, 0), 2))
        for did in sorted(asgn) if asgn[did])
    used = {g.driver_id for g in groups}
    return AssignmentResult(
        groups, tuple(sorted(set(r.journey_id for r in riders) - done)),
        tuple(sorted(set(d.journey_id for d in drivers) - used)),
        len(done), len(used), round(sum(scores.values()), 2),
        method, len(riders) * len(drivers), len(edges), 0.0, seconds,
        nodes_explored=nodes_explored)


def assign_greedy(
    edges: Sequence[MatchEdge], riders: Sequence[Journey], drivers: Sequence[Journey],
) -> AssignmentResult:
    """Assign by descending score, greedily respecting capacity."""
    started = perf_counter()
    dm = {d.journey_id: d for d in drivers}
    rm = {r.journey_id: r for r in riders}
    done: Set[str] = set()
    asgn: Dict[str, List[str]] = {}
    seats: Dict[str, int] = {}
    sc: Dict[str, float] = {}
    for e in sorted(edges, key=lambda e: (-e.score, e.driver_id, e.rider_id)):
        if e.rider_id in done:
            continue
        used = seats.get(e.driver_id, 0)
        if used + rm[e.rider_id].seats_requested <= dm[e.driver_id].vehicle.capacity:
            done.add(e.rider_id)
            asgn.setdefault(e.driver_id, []).append(e.rider_id)
            seats[e.driver_id] = used + rm[e.rider_id].seats_requested
            sc[e.driver_id] = sc.get(e.driver_id, 0.0) + e.score
    return _finish(asgn, seats, sc, riders, drivers, done, edges, "greedy",
                   perf_counter() - started, nodes_explored=len(edges))


def assign_auction(
    edges: Sequence[MatchEdge], riders: Sequence[Journey], drivers: Sequence[Journey],
    max_rounds: int = 50,
) -> AssignmentResult:
    """Greedy initialisation plus iterative swap improvement."""
    started = perf_counter()
    dm = {d.journey_id: d for d in drivers}
    rm = {r.journey_id: r for r in riders}
    se = sorted(edges, key=lambda e: (-e.score, e.driver_id, e.rider_id))
    ep: Dict[Tuple[str, str], MatchEdge] = {(e.driver_id, e.rider_id): e for e in se}
    er: Dict[str, List[MatchEdge]] = {}
    for e in se:
        er.setdefault(e.rider_id, []).append(e)

    # Greedy initialisation
    r2d: Dict[str, str] = {}
    dr: Dict[str, List[str]] = {}
    ds: Dict[str, int] = {}
    for e in se:
        if e.rider_id in r2d:
            continue
        used = ds.get(e.driver_id, 0)
        if used + rm[e.rider_id].seats_requested <= dm[e.driver_id].vehicle.capacity:
            r2d[e.rider_id] = e.driver_id
            dr.setdefault(e.driver_id, []).append(e.rider_id)
            ds[e.driver_id] = used + rm[e.rider_id].seats_requested

    # Iterative improvement
    for _ in range(max_rounds):
        improved = False
        # Phase 1: assign unmatched riders to best available driver
        for r in riders:
            rid = r.journey_id
            if rid in r2d:
                continue
            best = None
            for e in er.get(rid, []):
                used = ds.get(e.driver_id, 0)
                if used + r.seats_requested <= dm[e.driver_id].vehicle.capacity:
                    if best is None or e.score > best.score:
                        best = e
            if best:
                r2d[rid] = best.driver_id
                dr.setdefault(best.driver_id, []).append(rid)
                ds[best.driver_id] = ds.get(best.driver_id, 0) + r.seats_requested
                improved = True
        # Phase 2: swap to a strictly better driver
        for rid in list(r2d):
            cur = r2d[rid]
            cur_score = ep[(cur, rid)].score if (cur, rid) in ep else 0
            rider = rm[rid]
            for e in er.get(rid, []):
                if e.driver_id == cur:
                    continue
                new_used = ds.get(e.driver_id, 0)
                if (new_used + rider.seats_requested <= dm[e.driver_id].vehicle.capacity
                        and e.score > cur_score + 0.01):
                    dr[cur].remove(rid)
                    ds[cur] -= rider.seats_requested
                    if not dr[cur]:
                        del dr[cur]
                        ds.pop(cur, None)
                    r2d[rid] = e.driver_id
                    dr.setdefault(e.driver_id, []).append(rid)
                    ds[e.driver_id] = new_used + rider.seats_requested
                    improved = True
                    break
        if not improved:
            break

    sc: Dict[str, float] = {}
    for did, rids in dr.items():
        sc[did] = sum(ep[(did, r)].score for r in rids)
    return _finish(dr, ds, sc, riders, drivers, set(r2d), edges, "auction",
                   perf_counter() - started, nodes_explored=len(edges))


def assign_optimal(
    edges: Sequence[MatchEdge],
    riders: Sequence[Journey],
    drivers: Sequence[Journey],
    timeout_seconds: float = 5.0,
) -> AssignmentResult:
    """Exact optimal assignment via branch-and-bound search.

    Establishes the provably optimal maximum-weight assignment benchmark
    to evaluate the optimality gap of Greedy and Auction heuristics.
    """
    started = perf_counter()
    dm = {d.journey_id: d for d in drivers}
    rm = {r.journey_id: r for r in riders}

    # Group feasible edges by rider_id, sorted by descending score
    rider_edges: Dict[str, List[MatchEdge]] = {r.journey_id: [] for r in riders}
    for e in edges:
        rider_edges[e.rider_id].append(e)
    for rid in rider_edges:
        rider_edges[rid].sort(key=lambda e: (-e.score, e.driver_id))

    sorted_riders = sorted(
        riders,
        key=lambda r: (-(rider_edges[r.journey_id][0].score if rider_edges[r.journey_id] else 0), r.journey_id)
    )

    # Precompute suffix maximum potential scores for bounding
    max_scores = [
        (rider_edges[r.journey_id][0].score if rider_edges[r.journey_id] else 0.0)
        for r in sorted_riders
    ]
    suffix_upper_bounds = [0.0] * (len(sorted_riders) + 1)
    for i in range(len(sorted_riders) - 1, -1, -1):
        suffix_upper_bounds[i] = suffix_upper_bounds[i + 1] + max_scores[i]

    # Initial lower bound using greedy solution
    greedy_res = assign_greedy(edges, riders, drivers)
    best_score = greedy_res.objective_value
    best_asgn: Dict[str, List[str]] = {}
    best_seats: Dict[str, int] = {}
    best_scores: Dict[str, float] = {}
    for g in greedy_res.groups:
        best_asgn[g.driver_id] = list(g.rider_ids)
        best_seats[g.driver_id] = g.seats_used
        best_scores[g.driver_id] = g.group_score
    best_done = set(r.journey_id for r in riders) - set(greedy_res.unmatched_rider_ids)

    cur_asgn: Dict[str, List[str]] = {d.journey_id: [] for d in drivers}
    cur_seats: Dict[str, int] = {d.journey_id: 0 for d in drivers}
    cur_scores: Dict[str, float] = {d.journey_id: 0.0 for d in drivers}

    deadline = started + timeout_seconds
    nodes_explored = 0

    def branch(idx: int, cur_total_score: float) -> None:
        nonlocal best_score, best_asgn, best_seats, best_scores, best_done, nodes_explored
        nodes_explored += 1
        if perf_counter() > deadline:
            return  # Safety timeout fallback

        if idx == len(sorted_riders):
            if cur_total_score > best_score + 1e-6:
                best_score = cur_total_score
                best_asgn = {d: list(rids) for d, rids in cur_asgn.items() if rids}
                best_seats = dict(cur_seats)
                best_scores = dict(cur_scores)
                best_done = {r for rids in cur_asgn.values() for r in rids}
            return

        # Prune if upper bound cannot beat best known solution
        if cur_total_score + suffix_upper_bounds[idx] <= best_score + 1e-6:
            return

        rider = sorted_riders[idx]
        rid = rider.journey_id
        req_seats = rider.seats_requested

        # Option A: Try assigning rider to each feasible driver with available capacity
        for e in rider_edges.get(rid, []):
            did = e.driver_id
            if cur_seats[did] + req_seats <= dm[did].vehicle.capacity:
                cur_asgn[did].append(rid)
                cur_seats[did] += req_seats
                cur_scores[did] += e.score

                branch(idx + 1, cur_total_score + e.score)

                cur_scores[did] -= e.score
                cur_seats[did] -= req_seats
                cur_asgn[did].pop()

        # Option B: Leave rider unmatched
        branch(idx + 1, cur_total_score)

    branch(0, 0.0)

    return _finish(
        best_asgn, best_seats, best_scores, riders, drivers, best_done, edges, "optimal",
        perf_counter() - started, nodes_explored=nodes_explored,
    )


def compute_optimality_gap(optimal_result: AssignmentResult, heuristic_result: AssignmentResult) -> float:
    """Calculate the percentage optimality gap of a heuristic against the optimal solution."""
    opt_val = optimal_result.objective_value
    heu_val = heuristic_result.objective_value
    if opt_val <= 1e-6:
        return 0.0
    gap = max(0.0, (opt_val - heu_val) / opt_val) * 100.0
    return round(gap, 2)


_SOLVERS = {
    "greedy": assign_greedy,
    "auction": assign_auction,
    "optimal": assign_optimal,
}


def run_assignment(
    riders: Sequence[Journey],
    drivers: Sequence[Journey],
    method: str = "greedy",
    router: Optional[object] = None,
) -> AssignmentResult:
    """Full pipeline: validate → build feasibility graph → solve → return."""
    if method not in _SOLVERS:
        raise ValueError(f"unknown method {method!r}; choose from {sorted(_SOLVERS)}")
    if not riders or not drivers:
        return AssignmentResult(
            (), tuple(r.journey_id for r in riders),
            tuple(d.journey_id for d in drivers), 0, 0, 0.0, method, 0, 0, 0.0, 0.0)
    edges, total, gsec = build_feasibility_graph(riders, drivers, router=router)
    result = _SOLVERS[method](edges, riders, drivers)
    return AssignmentResult(
        result.groups, result.unmatched_rider_ids, result.unmatched_driver_ids,
        result.matched_rider_count, result.matched_driver_count,
        result.objective_value, method, total, len(edges), gsec, result.solve_seconds)
