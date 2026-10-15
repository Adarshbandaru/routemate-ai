"""Driver state, telemetry, and trip action schemas."""

from typing import Optional
from pydantic import BaseModel


class DriverRegisterRequest(BaseModel):
    user_id: Optional[str] = None
    license_number: str
    vehicle_type: Optional[str] = "SEDAN"
    plate_number: Optional[str] = "PB 08 BG 1290"


class DriverAvailabilityRequest(BaseModel):
    available: bool


class DriverLocationRequest(BaseModel):
    lat: float
    lng: float
    heading: Optional[int] = 0


# Phase 2 Specific Request Models
class Phase2DriverStatusRequest(BaseModel):
    status: str


class Phase2DriverLocationRequest(BaseModel):
    latitude: float
    longitude: float
    heading: Optional[int] = 180


class Phase2DriverRejectRequest(BaseModel):
    reason: Optional[str] = "too_far"


class Phase2DriverDropoffRequest(BaseModel):
    fare_amount: Optional[float] = 320.0


class Phase2DriverMessageRequest(BaseModel):
    message: str
