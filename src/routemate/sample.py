"""Deterministic, wholly simulated journeys for demos and tests."""
from datetime import datetime, timezone
from .geometry import Coordinate
from .models import Journey, Vehicle, VerificationContext

def simulated_journeys():
    route = (Coordinate(51.500, -0.120), Coordinate(51.505, -0.110), Coordinate(51.510, -0.100))
    driver = Journey("SIM-DRIVER", route[0], route[-1], datetime(2026,1,1,8,0,tzinfo=timezone.utc), route,
                     Vehicle("car", 2, True), VerificationContext(True, True))
    rider_route = (Coordinate(51.501, -0.119), Coordinate(51.505, -0.109), Coordinate(51.509, -0.101))
    rider = Journey("SIM-RIDER", rider_route[0], rider_route[-1], datetime(2026,1,1,8,10,tzinfo=timezone.utc), rider_route,
                     Vehicle("none", 0, True), VerificationContext(True, True), 1)
    return driver, rider
