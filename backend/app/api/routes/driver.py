"""Driver partner lifecycle, telemetry, dispatch, and earnings endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Body
from ...schemas.auth import (
    Phase2DriverSendOtpRequest,
    Phase2DriverVerifyOtpRequest,
    Phase2DriverRegisterRequest,
)
from ...schemas.driver import (
    Phase2DriverStatusRequest,
    Phase2DriverLocationRequest,
    Phase2DriverRejectRequest,
    Phase2DriverDropoffRequest,
    Phase2DriverMessageRequest,
)
from ...services.driver_service import DriverService
from ...services.auth_service import AuthService
from ...repositories.driver_repo import DriverRepository

router = APIRouter(prefix="/v1/driver", tags=["Driver Partner"])


# 1. Driver Auth: send-otp
@router.post("/auth/send-otp")
def driver_send_otp(payload: Phase2DriverSendOtpRequest):
    return AuthService.request_otp(payload.phone)


# 2. Driver Auth: verify-otp
@router.post("/auth/verify-otp")
def driver_verify_otp(payload: Phase2DriverVerifyOtpRequest):
    res = AuthService.verify_driver_otp_by_id(payload.otp_id, payload.otp)
    if not res:
        raise HTTPException(status_code=400, detail="Invalid OTP code")
    return res


# 3. Driver Register
@router.post("/register")
def driver_register(payload: Phase2DriverRegisterRequest):
    return DriverRepository.register(
        phone=payload.phone,
        name=payload.name,
        license_number=payload.license_number,
        vehicle_type=payload.vehicle_type or "sedan",
    )


# 4. Driver Status Toggle
@router.put("/{driver_id}/status")
def update_driver_status(driver_id: str, payload: Phase2DriverStatusRequest):
    return DriverService.set_status(driver_id, payload.status.upper())


# 5. Get Active Dispatch Request
@router.get("/{driver_id}/active-request")
def get_active_request(driver_id: str):
    req = DriverService.get_active_request(driver_id)
    if not req:
        raise HTTPException(status_code=404, detail="no_request")
    return req


# Support alternative plural /requests path
@router.get("/{driver_id}/requests")
def get_driver_requests(driver_id: str):
    requests = DriverRepository.get_active_requests(driver_id)
    return {"success": True, "count": len(requests), "requests": requests}


# 6. Location Update
@router.put("/{driver_id}/location")
def update_driver_location(driver_id: str, payload: Phase2DriverLocationRequest):
    return DriverService.update_location(driver_id, payload.latitude, payload.longitude, payload.heading or 180)


# 7. Accept Ride Request
@router.post("/{driver_id}/request/{booking_id}/accept")
@router.post("/{driver_id}/accept/{booking_id}")
def accept_request(driver_id: str, booking_id: str):
    return DriverService.accept_request(driver_id, booking_id)


# 8. Reject Ride Request
@router.post("/{driver_id}/request/{booking_id}/reject")
@router.post("/{driver_id}/reject/{booking_id}")
def reject_request(driver_id: str, booking_id: str, payload: Optional[Phase2DriverRejectRequest] = None):
    reason = payload.reason if payload else "too_far"
    return DriverService.reject_request(driver_id, booking_id, reason=reason)


# 9. Pickup Completed
@router.post("/{driver_id}/booking/{booking_id}/pickup")
def complete_pickup(driver_id: str, booking_id: str):
    return DriverService.complete_pickup(driver_id, booking_id)


# 10. Dropoff Completed
@router.post("/{driver_id}/booking/{booking_id}/dropoff")
def complete_dropoff(driver_id: str, booking_id: str, payload: Optional[Phase2DriverDropoffRequest] = None):
    fare = payload.fare_amount if payload and payload.fare_amount is not None else 320.0
    return DriverService.complete_dropoff(driver_id, booking_id, fare_amount=fare)


# 11. In-App Messaging
@router.post("/{driver_id}/booking/{booking_id}/message")
def send_driver_message(driver_id: str, booking_id: str, payload: Phase2DriverMessageRequest):
    return DriverService.send_message(driver_id, booking_id, payload.message)


# 12. Earnings Summary & Ledger
@router.get("/{driver_id}/earnings")
def get_driver_earnings(driver_id: str):
    return DriverService.get_earnings(driver_id)


# 13. Driver Profile
@router.get("/{driver_id}/profile")
def get_driver_profile(driver_id: str):
    return DriverService.get_profile(driver_id)
