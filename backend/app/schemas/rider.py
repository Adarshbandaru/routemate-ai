"""Rider booking, ride confirmation, and route schemas."""

from typing import List, Optional
from pydantic import BaseModel


class CreateBookingRequest(BaseModel):
    rider_id: Optional[str] = None
    driver_id: Optional[str] = None
    pickup_lat: float
    pickup_lng: float
    pickup_address: Optional[str] = "Pickup Location"
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: Optional[str] = "Dropoff Location"
    departure_time: Optional[str] = None
    seats: Optional[int] = 1
    notes: Optional[str] = None
    route_polyline: Optional[List[List[float]]] = None


class UpdateBookingStatusRequest(BaseModel):
    status: str


class ConfirmRideRequest(BaseModel):
    driver_id: str
    scenario_id: str


class SendMessageRequest(BaseModel):
    content: str
    sender_id: Optional[str] = "rider"
    recipient_id: Optional[str] = "driver"
    is_automated: Optional[bool] = False
