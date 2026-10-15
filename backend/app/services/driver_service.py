"""Service handling driver partner workflows, dispatch responses, and earnings."""

from typing import Any, Dict, Optional
from ..repositories.driver_repo import DriverRepository
from ..repositories.booking_repo import BookingRepository


class DriverService:
    @staticmethod
    def set_status(driver_id: str, status: str) -> Dict[str, Any]:
        DriverRepository.update_status(driver_id, status)
        return {"success": True, "status": status}

    @staticmethod
    def update_location(driver_id: str, latitude: float, longitude: float, heading: int = 180) -> Dict[str, Any]:
        DriverRepository.update_location(driver_id, latitude, longitude, heading)
        return {"success": True}

    @staticmethod
    def get_active_request(driver_id: str) -> Optional[Dict[str, Any]]:
        requests = DriverRepository.get_active_requests(driver_id)
        if not requests:
            return None
        r = requests[0]
        return {
            "booking_id": r["id"],
            "rider": {
                "name": r.get("rider_name", "Adarsh Bandaru"),
                "phone": r.get("rider_phone", "+91 98765 43210"),
                "rating": 4.9,
            },
            "pickup": {
                "lat": r.get("pickup_lat", 31.3260),
                "lng": r.get("pickup_lng", 75.5762),
                "address": r.get("pickup_address", "Jalandhar City Railway Station"),
            },
            "dropoff": {
                "lat": r.get("dropoff_lat", 31.2536),
                "lng": r.get("dropoff_lng", 75.7037),
                "address": r.get("dropoff_address", "Lovely Professional University (LPU)"),
            },
            "fare": r.get("total_fare", 320.0),
            "distance_km": r.get("distance_km", 21.4),
            "duration_min": 24,
        }

    @staticmethod
    def accept_request(driver_id: str, booking_id: str) -> Dict[str, Any]:
        DriverRepository.record_request_response(booking_id, driver_id, "ACCEPTED")
        BookingRepository.update_status(booking_id, "DRIVER_ASSIGNED")
        booking = BookingRepository.get_by_id(booking_id)
        return {"success": True, "booking": booking}

    @staticmethod
    def reject_request(driver_id: str, booking_id: str, reason: Optional[str] = "too_far") -> Dict[str, Any]:
        DriverRepository.record_request_response(booking_id, driver_id, "REJECTED")
        return {"success": True, "reason": reason}

    @staticmethod
    def complete_pickup(driver_id: str, booking_id: str) -> Dict[str, Any]:
        BookingRepository.update_status(booking_id, "PICKUP_COMPLETED")
        return {"success": True, "status": "PICKUP_COMPLETED"}

    @staticmethod
    def complete_dropoff(driver_id: str, booking_id: str, fare_amount: float = 320.0) -> Dict[str, Any]:
        BookingRepository.update_status(booking_id, "COMPLETED")
        return {"success": True, "status": "COMPLETED", "earned": fare_amount}

    @staticmethod
    def send_message(driver_id: str, booking_id: str, message: str) -> Dict[str, Any]:
        msg = BookingRepository.add_message(booking_id, sender_id=driver_id, content=message)
        return {"success": True, "message_id": msg["id"]}

    @staticmethod
    def get_earnings(driver_id: str) -> Dict[str, Any]:
        return DriverRepository.get_earnings(driver_id)

    @staticmethod
    def get_profile(driver_id: str) -> Dict[str, Any]:
        profile = DriverRepository.get_by_id(driver_id)
        if profile:
            return {
                "name": profile.get("name", "Priya Sharma"),
                "phone": profile.get("phone", "+91 98123 45678"),
                "rating": profile.get("rating", 4.8),
                "reviews": 342,
                "license_number": profile.get("license_number", "PB-08-2022-00451"),
                "vehicle_type": profile.get("vehicle_type", "SEDAN"),
                "plate_number": profile.get("plate_number", "PB 08 BG 1290"),
            }
        return {
            "name": "Priya Sharma",
            "rating": 4.8,
            "reviews": 342,
            "phone": "+91 98123 45678",
            "license_number": "PB-08-2022-00451",
            "vehicle_type": "SEDAN",
            "plate_number": "PB 08 BG 1290",
        }
