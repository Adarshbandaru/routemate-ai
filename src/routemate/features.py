"""Feature calculations used by the compatibility rules.

Supports optional RoutingProvider for real road-network distance and detour
calculations while preserving backward compatibility with geometric heuristics.
"""
from datetime import timedelta
from typing import Dict, Optional
from .geometry import (
    haversine_km,
    polyline_length_km,
    route_similarity,
    direction_similarity,
    ordered_insertion_detour_km,
)
from .models import Journey


def calculate_features(
    driver: Journey,
    rider: Journey,
    tolerance_km: float = 0.5,
    router: Optional[object] = None,
) -> Dict[str, float]:
    """Calculate pairwise spatial and temporal compatibility features.

    When *router* is provided, pickup/destination distances and multi-stop
    detours are calculated via the routing provider. Otherwise, deterministic
    geometric approximations (Haversine and geometric insertion) are used.
    """
    overlap = route_similarity(driver.route, rider.route, tolerance_km)
    direction = direction_similarity(driver.route[0], driver.route[-1], rider.route[0], rider.route[-1])
    base = polyline_length_km(driver.route)

    if router is not None:
        from .routing import RouteQuery, compute_road_detour
        try:
            pickup_res = router.route(RouteQuery(driver.start, rider.start))
            pickup = pickup_res.distance_km
        except Exception:
            pickup = haversine_km(driver.start, rider.start)

        try:
            dest_res = router.route(RouteQuery(driver.destination, rider.destination))
            destination = dest_res.distance_km
        except Exception:
            destination = haversine_km(driver.destination, rider.destination)

        try:
            detour_res = compute_road_detour(driver.start, driver.destination, rider.start, rider.destination, router)
            detour_km = detour_res.detour_km
            detour_seconds = detour_res.detour_seconds
        except Exception:
            detour_km = ordered_insertion_detour_km(driver.route, rider.start, rider.destination)
            detour_seconds = 0.0
    else:
        pickup = haversine_km(driver.start, rider.start)
        destination = haversine_km(driver.destination, rider.destination)
        detour_km = ordered_insertion_detour_km(driver.route, rider.start, rider.destination)
        detour_seconds = 0.0

    return {
        "pickup_distance_km": pickup,
        "destination_distance_km": destination,
        "route_similarity": overlap,
        "direction_similarity": direction,
        "driver_route_km": base,
        "detour_km": detour_km,
        "departure_difference_min": abs((driver.departure - rider.departure).total_seconds()) / 60,
        "detour_seconds": detour_seconds,
    }
