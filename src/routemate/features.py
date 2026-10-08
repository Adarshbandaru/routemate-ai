"""Feature calculations used by the compatibility rules."""
from datetime import timedelta
from typing import Dict
from .geometry import haversine_km, polyline_length_km, route_similarity, direction_similarity, ordered_insertion_detour_km
from .models import Journey

def calculate_features(driver: Journey, rider: Journey, tolerance_km: float = .5) -> Dict[str, float]:
    pickup = haversine_km(driver.start, rider.start)
    destination = haversine_km(driver.destination, rider.destination)
    overlap = route_similarity(driver.route, rider.route, tolerance_km)
    direction = direction_similarity(driver.route[0], driver.route[-1], rider.route[0], rider.route[-1])
    base = polyline_length_km(driver.route)
    # Ordered pickup/dropoff insertion: geometric approximation, not road/ETA truth.
    detour_km = ordered_insertion_detour_km(driver.route, rider.start, rider.destination)
    return {"pickup_distance_km": pickup, "destination_distance_km": destination,
            "route_similarity": overlap, "direction_similarity": direction,
            "driver_route_km": base, "detour_km": detour_km,
            "departure_difference_min": abs((driver.departure-rider.departure).total_seconds()) / 60}
