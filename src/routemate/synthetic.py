"""Small artificial equatorial corridors; no real journeys or acceptance data.

Labels use simulator offsets, not core features or ranking scores. Independently
sampled passenger tolerances control Bernoulli preference outcomes. This still
shares distance/time assumptions with the rankers, so it is a biased toy benchmark,
not independent evidence of acceptance, safety, or real-world recommendation value.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math
import random
from typing import Tuple

from .geometry import Coordinate
from .models import Journey, Vehicle, VerificationContext

DATASET_VERSION = "latent-corridor-v1"
DEFAULT_SEEDS = (11, 29, 47)
SCENARIOS = {"thin": 4, "balanced": 12, "dense": 24}
LABEL_MODEL = {
    "source": "synthetic_latent_preferences_not_observed_acceptance",
    "distance_tolerance_km": [0.35, 2.5],
    "time_tolerance_min": [5.0, 35.0],
    "formula": "p=0.05+0.90*exp(-0.5*((abs(start_y)+abs(end_y))/distance_tolerance+abs(minutes)/time_tolerance))",
    "reverse_probability_multiplier": 0.15,
    "forced_zero_relevant": "every tenth request (index modulo 10 equals 0)",
    "limitations": "Shared distance/time assumptions bias comparisons; labels are independent of core score but not feature concepts. No real acceptance evidence. Labels ignore verification/capacity so relevant-lost-to-filter remains visible.",
}


@dataclass(frozen=True)
class SyntheticQuery:
    query_id: str
    seed: int
    scenario: str
    rider: Journey
    drivers: Tuple[Journey, ...]
    relevant_ids: Tuple[str, ...]
    latent: dict


def _coordinate(x: float, y: float) -> Coordinate:
    # Artificial kilometres near (0, 0), not a real street network.
    return Coordinate(y / 111.195, x / 111.195)


def generate_dataset(seeds=DEFAULT_SEEDS, requests_per_scenario=20,
                     scenarios=None) -> Tuple[SyntheticQuery, ...]:
    scenarios = SCENARIOS if scenarios is None else dict(scenarios)
    seeds = tuple(seeds)
    if len(seeds) != len(set(seeds)) or any(type(s) is not int for s in seeds):
        raise ValueError("seeds must be unique integers")
    if type(requests_per_scenario) is not int or requests_per_scenario < 1:
        raise ValueError("requests_per_scenario must be positive")
    if any(type(n) is not int or n < 1 for n in scenarios.values()):
        raise ValueError("candidate counts must be positive integers")
    queries = []
    for seed in seeds:
        for scenario, count in scenarios.items():
            # Independent streams keep labels independent from candidate generation.
            geometry_rng = random.Random(f"geometry:{seed}:{scenario}")
            label_rng = random.Random(f"labels:{seed}:{scenario}")
            for index in range(requests_per_scenario):
                qid = f"syn-{seed}-{scenario}-{index:03d}"
                departure = datetime(2026, 1, 1, 8, tzinfo=timezone.utc) + timedelta(days=index)
                route = tuple(_coordinate(x, 0) for x in (0, 2, 4, 6, 8))
                rider = Journey(qid + "-r", route[0], route[-1], departure, route,
                                verification=VerificationContext(identity_verified=True))
                distance_tolerance = label_rng.uniform(0.35, 2.5)
                time_tolerance = label_rng.uniform(5, 35)
                forced_zero = index % 10 == 0
                drivers, relevant, latent_candidates = [], [], []
                for candidate_index in range(count):
                    did = f"{qid}-d{candidate_index:03d}"
                    y0, y1 = geometry_rng.uniform(-1.2, 1.2), geometry_rng.uniform(-1.5, 1.5)
                    minutes = geometry_rng.uniform(-25, 25)
                    # Cycling negatives guarantees coverage in the default dataset.
                    mode = (index + candidate_index) % 12
                    reverse = mode == 6
                    if mode == 7:
                        y0, y1 = 4.0, 4.0
                    if mode == 8:
                        minutes = 75.0
                    identity, vehicle, capacity = mode != 9, mode != 10, (0 if mode == 11 else 2)
                    driver_route = tuple(_coordinate(x, y0 + (y1-y0)*x/8)
                                         for x in (0, 2, 4, 6, 8))
                    if reverse:
                        driver_route = tuple(reversed(driver_route))
                    drivers.append(Journey(did, driver_route[0], driver_route[-1],
                                           departure + timedelta(minutes=minutes), driver_route,
                                           Vehicle("car", capacity, vehicle),
                                           VerificationContext(identity, vehicle)))
                    probability = 0.05 + 0.90 * math.exp(-0.5 * (
                        (abs(y0)+abs(y1))/distance_tolerance + abs(minutes)/time_tolerance))
                    if reverse:
                        probability *= 0.15
                    draw = label_rng.random()
                    label = not forced_zero and draw < probability
                    if label:
                        relevant.append(did)
                    latent_candidates.append({"journey_id": did, "start_y_km": y0,
                                              "end_y_km": y1, "minutes": minutes,
                                              "mode": mode, "reverse": reverse,
                                              "pre_override_probability": probability,
                                              "bernoulli_draw": draw, "relevant": label})
                queries.append(SyntheticQuery(qid, seed, scenario, rider, tuple(drivers),
                                              tuple(relevant), {"distance_tolerance_km": distance_tolerance,
                                              "time_tolerance_min": time_tolerance,
                                              "forced_zero_relevant": forced_zero,
                                              "candidates": latent_candidates}))
    return tuple(queries)
