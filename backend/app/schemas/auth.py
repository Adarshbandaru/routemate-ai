"""Authentication request and response schemas."""

from typing import Optional
from pydantic import BaseModel


class SendOtpRequest(BaseModel):
    phone: str


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str


class RegisterRequest(BaseModel):
    phone: str
    name: str
    email: Optional[str] = None
    role: Optional[str] = "RIDER"


# Phase 2 Driver Auth Schemas
class Phase2DriverSendOtpRequest(BaseModel):
    phone: str


class Phase2DriverVerifyOtpRequest(BaseModel):
    otp_id: str
    otp: str


class Phase2DriverRegisterRequest(BaseModel):
    phone: str
    name: str
    license_number: str
    vehicle_type: Optional[str] = "sedan"
