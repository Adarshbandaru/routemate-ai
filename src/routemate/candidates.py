"""Stage 4 candidate retrieval, feature generation, and feasibility gating.

The stages in this module are deliberately separate: retrieval does not decide
feasibility, and feature calculation does not discard an edge.
"""
from dataclasses import dataclass
from time import perf_counter
from types import MappingProxyType
from typing import Mapping, Optional, Sequence, Tuple

from .features import calculate_features
from .models import Journey
from .scoring import MAXIMUMS, WEIGHTS


@dataclass(frozen=True)
class CandidatePair:
    driver: Journey
    rider: Journey

    @property
    def driver_id(self) -> str:
        return self.driver.journey_id

    @property
    def rider_id(self) -> str:
        return self.rider.journey_id


@dataclass(frozen=True)
class RetrievalResult:
    pairs: Tuple[CandidatePair, ...]
    count: int
    seconds: float

    def __iter__(self):
        return iter(self.pairs)

    def __len__(self):
        return len(self.pairs)


@dataclass(frozen=True)
class FeatureRow:
    driver_id: str
    rider_id: str
    features: Mapping[str, float]


@dataclass(frozen=True)
class FeasibilityDecision:
    driver_id: str
    rider_id: str
    route_direction_compatible: bool
    pickup_distance_eligible: bool
    destination_distance_eligible: bool
    departure_time_eligible: bool
    detour_eligible: bool
    identity_verification: bool
    vehicle_verification: bool
    capacity_eligible: bool
    final_eligible: bool
    features: Mapping[str, float]
    rejection_reasons: Tuple[str, ...] = ()
    score: float = 0.0

    @property
    def no_safety_flags(self) -> bool:
        return not any(reason == "safety flags present" for reason in self.rejection_reasons)

    def __getattr__(self, name: str):
        """Expose measured feature names as row attributes as well as mapping keys."""
        if name in self.features:
            return self.features[name]
        raise AttributeError(name)


# The name is useful to callers that treat the matrix as rows rather than
# decisions, while retaining an immutable row type.
FeasibilityMatrixRow = FeasibilityDecision


@dataclass(frozen=True)
class CandidatePipelineResult:
    retrieved_pairs: Tuple[CandidatePair, ...]
    feature_rows: Tuple[FeatureRow, ...]
    feasibility_matrix: Tuple[FeasibilityDecision, ...]
    eligible_ids: Tuple[str, ...]
    retrieval_seconds: float
    feature_seconds: float
    filtering_seconds: float
    retrieved_count: int


def _validate(rider: Journey, drivers: Sequence[Journey]) -> None:
    if not isinstance(rider, Journey):
        raise TypeError("rider must be a Journey")
    ids = [d.journey_id for d in drivers]
    if any(not isinstance(d, Journey) for d in drivers):
        raise TypeError("drivers must contain Journeys")
    if len(ids) != len(set(ids)):
        raise ValueError("driver journey IDs must be unique")
    if rider.journey_id in ids:
        raise ValueError("rider journey ID collides with a driver ID")


def retrieve_candidates(rider: Journey, drivers: Sequence[Journey]) -> RetrievalResult:
    """Retrieve all drivers in stable ID order, without feasibility filtering.

    Keeping retrieval intentionally broad provides a recall-preserving baseline;
    all hard constraints are applied only by :func:`evaluate_feasibility`.
    """
    started = perf_counter()
    _validate(rider, drivers)
    pairs = tuple(CandidatePair(driver, rider) for driver in sorted(drivers, key=lambda d: d.journey_id))
    return RetrievalResult(pairs, len(pairs), perf_counter() - started)


def generate_features(pairs: Sequence[CandidatePair], router: Optional[object] = None) -> Tuple[FeatureRow, ...]:
    """Calculate features for every retrieved pair; never filter a pair."""
    rows = []
    for pair in pairs:
        if not isinstance(pair, CandidatePair):
            raise TypeError("pairs must contain CandidatePair values")
        values = MappingProxyType(dict(calculate_features(pair.driver, pair.rider, router=router)))
        rows.append(FeatureRow(pair.driver_id, pair.rider_id, values))
    return tuple(rows)


def _score(features: Mapping[str, float]) -> float:
    raw = 0.0
    for key, weight in WEIGHTS.items():
        normalised = max(0.0, 1.0 - features[key] / MAXIMUMS[key]) if key in MAXIMUMS else features[key]
        raw += 100.0 * weight * normalised
    return round(raw, 2)


def evaluate_feasibility(pair: CandidatePair, feature_row: FeatureRow) -> FeasibilityDecision:
    """Apply hard safety, verification, geometry, time, and capacity gates.

    The heuristic score is retained for audit/ranking, but is deliberately not
    an eligibility gate. Otherwise route/time ablations would change the
    candidate population instead of only changing ranking.
    """
    d, r, f = pair.driver, pair.rider, feature_row.features
    reasons = []
    direction = f["direction_similarity"] > 0.5
    pickup = f["pickup_distance_km"] <= 2.0
    destination = f["destination_distance_km"] <= 3.0
    departure = f["departure_difference_min"] <= 30.0
    detour = f["detour_km"] <= 5.0
    identity = d.verification.identity_verified and r.verification.identity_verified
    vehicle = d.vehicle.verified and d.verification.vehicle_verified
    capacity = d.vehicle.capacity >= r.seats_requested
    checks = ((direction, "direction incompatibility"), (pickup, "pickup distance exceeds 2 km"),
              (destination, "destination distance exceeds 3 km"), (departure, "departure difference exceeds 30 minutes"),
              (detour, "detour exceeds 5 km"), (identity, "identity verification failed"),
              (vehicle, "vehicle verification failed"), (capacity, "insufficient vehicle capacity"))
    for passed, reason in checks:
        if not passed:
            reasons.append(reason)
    if d.verification.safety_flags or r.verification.safety_flags:
        reasons.append("safety flags present")
    score = _score(f)
    return FeasibilityDecision(d.journey_id, r.journey_id, direction, pickup, destination,
                               departure, detour, identity, vehicle, capacity,
                               not reasons, f, tuple(reasons), score)


def run_candidate_pipeline(
    rider: Journey,
    drivers: Sequence[Journey],
    router: Optional[object] = None,
) -> CandidatePipelineResult:
    retrieval = retrieve_candidates(rider, drivers)
    feature_started = perf_counter()
    rows = generate_features(retrieval.pairs, router=router)
    feature_seconds = perf_counter() - feature_started
    filtering_started = perf_counter()
    matrix = tuple(evaluate_feasibility(pair, row) for pair, row in zip(retrieval.pairs, rows))
    filtering_seconds = perf_counter() - filtering_started
    eligible = tuple(sorted((row.driver_id for row in matrix if row.final_eligible)))
    return CandidatePipelineResult(retrieval.pairs, rows, matrix, eligible,
                                   retrieval.seconds, feature_seconds, filtering_seconds,
                                   retrieval.count)


def rank_candidates(decisions: Sequence[FeasibilityDecision]) -> Tuple[str, ...]:
    """Rank eligible decisions by the explicit score, breaking ties by ID."""
    return tuple(d.driver_id for d in sorted(
        (d for d in decisions if d.final_eligible),
        key=lambda d: (-d.score, d.driver_id)))


# Explicitly named aliases make the stage boundaries convenient in callers.
generate_feature_rows = generate_features
evaluate_candidate = evaluate_feasibility
candidate_pipeline = run_candidate_pipeline
