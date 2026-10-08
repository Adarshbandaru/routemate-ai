"""Request-level rankings over one shared, precomputed compatibility gate.

Timing preprocessing includes feature extraction AND the core eligibility/score
calculation. Ranking timing excludes both; it is not end-to-end serving latency.
"""
from dataclasses import dataclass
import random
from time import perf_counter
from types import MappingProxyType
from typing import Mapping, Sequence, Tuple

from .models import Journey
from .scoring import compatibility_score

ALGORITHM_VERSION = "shared-gate-baselines-v1"
METHODS = ("seeded_random", "nearest_neighbour", "distance_destination", "route_time")


@dataclass(frozen=True)
class Candidate:
    journey_id: str
    score: float
    features: Mapping[str, float]
    compatible: bool


@dataclass(frozen=True)
class PreparedPool:
    candidates: Tuple[Candidate, ...]
    eligible: Tuple[Candidate, ...]
    preprocessing_seconds: float


def prepare_candidates(rider: Journey, drivers: Sequence[Journey]) -> PreparedPool:
    """Compute each driver's features and gate exactly once; never mutate inputs."""
    drivers = tuple(drivers)
    ids = [driver.journey_id for driver in drivers]
    if len(ids) != len(set(ids)) or rider.journey_id in ids:
        raise ValueError("journey IDs must be unique within each request pool")
    start = perf_counter()
    candidates = []
    for driver in drivers:
        result = compatibility_score(driver, rider)
        candidates.append(Candidate(driver.journey_id, result.score,
                                    MappingProxyType(dict(result.features)), result.compatible))
    candidates = tuple(candidates)
    return PreparedPool(candidates, tuple(c for c in candidates if c.compatible),
                        perf_counter() - start)


def rank_candidates(pool: PreparedPool, method: str, seed: int = 0) -> Tuple[str, ...]:
    """Rank only eligible candidates. IDs break ties; random is input-order invariant."""
    if method not in METHODS:
        raise ValueError("unknown ranking method: " + method)
    candidates = sorted(pool.eligible, key=lambda c: c.journey_id)
    if method == "seeded_random":
        rng = random.Random(seed)
        priorities = {c.journey_id: rng.random() for c in candidates}
        key = lambda c: (priorities[c.journey_id], c.journey_id)
    elif method == "nearest_neighbour":
        key = lambda c: (c.features["pickup_distance_km"], c.journey_id)
    elif method == "distance_destination":
        key = lambda c: (c.features["pickup_distance_km"] +
                         c.features["destination_distance_km"], c.journey_id)
    else:
        key = lambda c: (-c.score, c.journey_id)
    return tuple(c.journey_id for c in sorted(candidates, key=key))
