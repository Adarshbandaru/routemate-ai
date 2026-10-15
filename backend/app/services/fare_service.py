"""Canonical Fare Calculation Service for RouteMate AI."""

import math
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, Optional
from ..schemas.fare import FareBreakdown


def _round_currency(value: float) -> float:
    """Consistently round currency to 2 decimal places using Decimal ROUND_HALF_UP."""
    d = Decimal(str(value))
    return float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def compute_haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in kilometers."""
    R = 6371.0088  # Earth mean radius in kilometers
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class FareService:
    BASE_FARE = 50.0
    DISTANCE_RATE_PER_KM = 8.0
    TIME_RATE_PER_MIN = 0.50
    WAIT_RATE_PER_MIN = 1.00
    TAX_RATE = 0.05

    @classmethod
    def calculate_fare(
        cls,
        distance_km: float,
        duration_min: float,
        wait_min: float = 0.0,
        surge_multiplier: float = 1.0,
        discount_amount: float = 0.0,
        estimate_only: bool = True,
    ) -> FareBreakdown:
        """Calculate fare breakdown according to the canonical Phase 3 formula.
        
        Formula:
          1. base_fare = 50.0 (covers first 1 km)
          2. distance_fare = max(0, distance_km - 1.0) * 8.0
          3. time_fare = duration_min * 0.50
          4. wait_fare = max(0, wait_min - 5.0) * 1.0
          5. subtotal = base_fare + distance_fare + time_fare + wait_fare
          6. surged_subtotal = subtotal * surge_multiplier
          7. tax = surged_subtotal * 0.05
          8. total = max(0.0, surged_subtotal + tax - discount)
        """
        # Validate and clamp non-negative inputs
        dist = max(0.0, float(distance_km))
        dur = max(0.0, float(duration_min))
        wait = max(0.0, float(wait_min))
        surge = max(1.0, min(3.0, float(surge_multiplier)))
        disc = max(0.0, float(discount_amount))

        base_fare = cls.BASE_FARE
        distance_fare = _round_currency(max(0.0, dist - 1.0) * cls.DISTANCE_RATE_PER_KM)
        time_fare = _round_currency(dur * cls.TIME_RATE_PER_MIN)
        wait_fare = _round_currency(max(0.0, wait - 5.0) * cls.WAIT_RATE_PER_MIN)

        subtotal = _round_currency(base_fare + distance_fare + time_fare + wait_fare)
        surged_subtotal = _round_currency(subtotal * surge)
        tax = _round_currency(surged_subtotal * cls.TAX_RATE)

        total_before_discount = _round_currency(surged_subtotal + tax)
        final_total = max(0.0, _round_currency(total_before_discount - disc))

        return FareBreakdown(
            base_fare=_round_currency(base_fare),
            distance_km=_round_currency(dist),
            distance_fare=distance_fare,
            time_minutes=_round_currency(dur),
            time_fare=time_fare,
            wait_fare=wait_fare,
            surge_multiplier=surge,
            subtotal=subtotal,
            tax_rate=cls.TAX_RATE,
            tax=tax,
            discount=_round_currency(disc),
            total=final_total,
            currency="INR",
            estimate_only=estimate_only,
        )

    @classmethod
    def estimate_from_coords(
        cls,
        pickup_lat: float,
        pickup_lng: float,
        dropoff_lat: float,
        dropoff_lng: float,
        surge_multiplier: float = 1.0,
        wait_minutes: float = 0.0,
        discount_amount: float = 0.0,
    ) -> FareBreakdown:
        """Estimate fare given pickup and dropoff coordinates."""
        direct_dist = compute_haversine_distance_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
        # Apply typical road route winding factor (1.25x haversine)
        route_dist = direct_dist * 1.25 if direct_dist > 0.1 else 0.5
        # Assume average city/highway speed of 35 km/h for duration estimate
        est_duration = max(5.0, (route_dist / 35.0) * 60.0)

        return cls.calculate_fare(
            distance_km=route_dist,
            duration_min=est_duration,
            wait_min=wait_minutes,
            surge_multiplier=surge_multiplier,
            discount_amount=discount_amount,
            estimate_only=True,
        )
