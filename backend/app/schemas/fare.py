"""Pydantic models for Fare Calculation and Estimation."""

from typing import Optional
from pydantic import BaseModel, Field


class FareEstimateRequest(BaseModel):
    pickup_lat: float = Field(..., ge=-90.0, le=90.0, description="Pickup latitude")
    pickup_lng: float = Field(..., ge=-180.0, le=180.0, description="Pickup longitude")
    dropoff_lat: float = Field(..., ge=-90.0, le=90.0, description="Dropoff latitude")
    dropoff_lng: float = Field(..., ge=-180.0, le=180.0, description="Dropoff longitude")
    vehicle_type: Optional[str] = Field("sedan", description="Vehicle type: sedan, bike, auto")
    surge_multiplier: Optional[float] = Field(1.0, ge=1.0, le=3.0, description="Surge multiplier policy")
    wait_minutes: Optional[float] = Field(0.0, ge=0.0, description="Optional anticipated wait time in minutes")


class FareBreakdown(BaseModel):
    base_fare: float
    distance_km: float
    distance_fare: float
    time_minutes: float
    time_fare: float
    wait_fare: float
    surge_multiplier: float
    subtotal: float
    tax_rate: float
    tax: float
    discount: float
    total: float
    currency: str = "INR"
    estimate_only: bool = True
