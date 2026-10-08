"""Deterministic provider perturbations with original synthetic labels retained."""
from dataclasses import replace
from datetime import timedelta
import math
import random

from .geometry import Coordinate, EARTH_RADIUS_KM
from .synthetic import SyntheticQuery

PERTURBATION_VERSION = "provider-perturbations-v1"
CONDITIONS = ("control", "endpoints_100m", "route_100m",
              "departure_5min", "availability_25pct")
PARAMETERS = {
    "version": PERTURBATION_VERSION,
    "rng": "random.Random(f'{PERTURBATION_VERSION}:{query.query_id}:{condition}')",
    "order": "drivers in input order; start then destination; internal vertices in route order",
    "preserved": ["query_id", "seed", "scenario", "rider", "relevant_ids", "latent",
                  "journey_id", "vehicle", "verification", "seats_requested"],
    "control": {"operation": "return original query"},
    "endpoints_100m": {"radius_km": 0.1, "targets": "independent provider start and destination; synchronize route endpoints"},
    "route_100m": {"radius_km": 0.1, "targets": "independent internal provider route vertices only"},
    "disk": {
        "distribution": "uniform area: radius=0.1*sqrt(rng.random()); angle=rng.uniform(0,2*pi)",
        "conversion": "latitude+=degrees(radius*sin(angle)/earth_radius_km); longitude+=degrees(radius*cos(angle)/(earth_radius_km*cos(radians(original_latitude))))",
        "earth_radius_km": EARTH_RADIUS_KM,
        "validation": "Coordinate and Journey validation; invalid local-domain results raise ValueError",
    },
    "departure_5min": {"distribution": "independent rng.uniform(-5.0,5.0) minutes per provider", "minimum_minutes": -5.0, "maximum_minutes": 5.0},
    "availability_25pct": {"removal_probability": 0.25, "rule": "keep each driver iff rng.random() >= 0.25", "allow_empty_pool": True, "retain_original_labels": True},
}


def _offset(point: Coordinate, rng: random.Random) -> Coordinate:
    radius = 0.1 * math.sqrt(rng.random())
    angle = rng.uniform(0, 2 * math.pi)
    return Coordinate(
        point.latitude + math.degrees(radius * math.sin(angle) / EARTH_RADIUS_KM),
        point.longitude + math.degrees(radius * math.cos(angle) /
                                      (EARTH_RADIUS_KM * math.cos(math.radians(point.latitude)))),
    )


def perturb_query(query: SyntheticQuery, condition: str) -> SyntheticQuery:
    """Perturb only providers using a separate query/condition-seeded stream.

    Labels and latent data remain those of the original query, including labels
    for providers removed by availability noise. Replaced journeys validate via
    their normal dataclass constructor.
    """
    if condition not in CONDITIONS:
        raise ValueError(f"unknown perturbation condition: {condition!r}")
    if condition == "control":
        return query
    rng = random.Random(f"{PERTURBATION_VERSION}:{query.query_id}:{condition}")
    drivers = []
    for driver in query.drivers:
        if condition == "availability_25pct":
            if rng.random() >= 0.25:
                drivers.append(driver)
            continue
        if condition == "endpoints_100m":
            start = _offset(driver.start, rng)
            destination = _offset(driver.destination, rng)
            driver = replace(driver, start=start, destination=destination,
                             route=(start,) + driver.route[1:-1] + (destination,))
        elif condition == "route_100m":
            route = (driver.start,) + tuple(_offset(point, rng) for point in driver.route[1:-1]) + (driver.destination,)
            driver = replace(driver, route=route)
        elif condition == "departure_5min":
            driver = replace(driver, departure=driver.departure + timedelta(minutes=rng.uniform(-5.0, 5.0)))
        drivers.append(driver)
    return replace(query, drivers=tuple(drivers))
