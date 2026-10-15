"""Rider booking creation, status querying, cancellation, and in-app messaging."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Header
from ...schemas.rider import CreateBookingRequest, ConfirmRideRequest, SendMessageRequest
from ...services.booking_service import BookingService
from ...repositories.booking_repo import BookingRepository
from ...core.security import verify_jwt_token

router = APIRouter(tags=["Bookings"])


def _extract_user_id(authorization: Optional[str]) -> str:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        user = verify_jwt_token(token)
        if user:
            return user["id"]
    return "user_rider_demo"


@router.post("/v1/confirm-ride")
def confirm_ride(payload: ConfirmRideRequest):
    return BookingService.confirm_scenario_ride(payload.driver_id, payload.scenario_id)


@router.post("/v1/bookings")
def create_booking(payload: CreateBookingRequest, authorization: Optional[str] = Header(None)):
    rider_id = _extract_user_id(authorization) if not payload.rider_id else payload.rider_id
    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    data["rider_id"] = rider_id
    created = BookingRepository.create(data, polyline=payload.route_polyline)
    return {"success": True, "booking": created}


@router.get("/v1/bookings")
def get_my_bookings(authorization: Optional[str] = Header(None)):
    rider_id = _extract_user_id(authorization)
    bookings = BookingRepository.get_by_rider(rider_id)
    return {"success": True, "count": len(bookings), "bookings": bookings}


@router.get("/v1/bookings/{booking_id}")
def get_booking_details(booking_id: str):
    b = BookingRepository.get_by_id(booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return {"success": True, "booking": b}


@router.post("/v1/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: str, authorization: Optional[str] = Header(None)):
    booking = BookingRepository.get_by_id(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Authorize cancellation: rider, driver, or admin
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        user = verify_jwt_token(token)
        if user:
            uid = user.get("id")
            role = user.get("role", "")
            if uid != booking.get("rider_id") and uid != booking.get("driver_id") and role != "ADMIN":
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden. You do not have permission to cancel this booking."
                )

    success = BookingService.cancel_booking(booking_id)
    if not success:
        raise HTTPException(status_code=400, detail="Unable to cancel booking")
    return {"success": True, "status": "CANCELLED"}


@router.post("/v1/bookings/{booking_id}/message")
def send_booking_message(booking_id: str, payload: SendMessageRequest):
    msg = BookingRepository.add_message(
        booking_id,
        sender_id=payload.sender_id or "rider",
        content=payload.content,
        recipient_id=payload.recipient_id or "driver",
        is_automated=bool(payload.is_automated),
    )
    return {"success": True, "message": msg}


@router.get("/v1/bookings/{booking_id}/messages")
def get_booking_messages(booking_id: str):
    messages = BookingRepository.get_messages(booking_id)
    return {"success": True, "messages": messages}
