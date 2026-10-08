"""Domain objects. Coordinates are latitude/longitude in decimal degrees."""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Tuple

from .geometry import Coordinate, haversine_km, validate_local_domain


@dataclass(frozen=True)
class Vehicle:
    kind: str = "car"
    capacity: int = 1                 # available passenger seats
    verified: bool = False

    def __post_init__(self) -> None:
        if type(self.capacity) is not int or self.capacity < 0:
            raise ValueError("capacity must be a nonnegative integer")
        if type(self.verified) is not bool:
            raise ValueError("verified must be a bool")


@dataclass(frozen=True)
class VerificationContext:
    identity_verified: bool = False
    vehicle_verified: bool = False
    safety_flags: Tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if type(self.identity_verified) is not bool or type(self.vehicle_verified) is not bool:
            raise ValueError("verification flags must be bools")
        if not isinstance(self.safety_flags, tuple) or any(not isinstance(flag, str) or not flag.strip() for flag in self.safety_flags):
            raise ValueError("safety_flags must be a tuple of nonempty strings")


@dataclass(frozen=True)
class Journey:
    journey_id: str
    start: Coordinate
    destination: Coordinate
    departure: datetime
    route: Tuple[Coordinate, ...]
    vehicle: Vehicle = field(default_factory=Vehicle)
    verification: VerificationContext = field(default_factory=VerificationContext)
    seats_requested: int = 1

    def __post_init__(self) -> None:
        if not isinstance(self.start, Coordinate) or not isinstance(self.destination, Coordinate):
            raise ValueError("start and destination must be Coordinates")
        if not isinstance(self.departure, datetime) or self.departure.tzinfo is None or self.departure.utcoffset() is None:
            raise ValueError("departure must be timezone-aware")
        if not isinstance(self.vehicle, Vehicle) or not isinstance(self.verification, VerificationContext):
            raise ValueError("vehicle and verification must be validated domain objects")
        if not isinstance(self.route, (tuple, list)):
            raise ValueError("route must be a sequence of Coordinates")
        object.__setattr__(self, "route", tuple(self.route))
        if len(self.route) < 2:
            raise ValueError("route must contain at least two coordinates")
        validate_local_domain(self.route)
        if self.route[0] != self.start or self.route[-1] != self.destination:
            raise ValueError("route endpoints must equal start and destination")
        if haversine_km(self.start, self.destination) <= 1e-6:
            raise ValueError("route endpoints must be distinct (more than 1 mm apart)")
        if type(self.seats_requested) is not int or self.seats_requested < 1:
            raise ValueError("seats_requested must be a positive integer")
