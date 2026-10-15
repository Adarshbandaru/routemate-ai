"""Service managing ride confirmations, lifecycle events, and cancellations."""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from ..core.config import SCENARIOS_DIR
from ..repositories.booking_repo import BookingRepository
from ..repositories.driver_repo import DriverRepository


class BookingService:
    @staticmethod
    def confirm_scenario_ride(driver_id: str, scenario_id: str) -> Dict[str, Any]:
        scenario_file = SCENARIOS_DIR / f"{scenario_id}.json"
        scenario_data = {}
        if scenario_file.is_file():
            try:
                with open(scenario_file, "r", encoding="utf-8") as f:
                    scenario_data = json.load(f)
            except Exception:
                pass

        pickup = scenario_data.get("pickup", {})
        dropoff = scenario_data.get("dropoff", {})
        polyline = scenario_data.get("route_polyline", [])
        fare = scenario_data.get("fare", 320.0)

        booking_payload = {
            "driver_id": driver_id,
            "pickup_lat": pickup.get("lat", 31.3260),
            "pickup_lng": pickup.get("lng", 75.5762),
            "pickup_address": pickup.get("address", "Jalandhar City Railway Station"),
            "dropoff_lat": dropoff.get("lat", 31.2536),
            "dropoff_lng": dropoff.get("lng", 75.7037),
            "dropoff_address": dropoff.get("address", "Lovely Professional University (LPU)"),
            "total_fare": fare,
            "status": "CONFIRMED",
        }

        created = BookingRepository.create(booking_payload, polyline=polyline)

        # Notify driver dispatch request in booking_driver_requests
        from ..core.database import get_connection
        conn = get_connection()
        cur = conn.cursor()
        import uuid
        req_id = f"req_{uuid.uuid4().hex[:12]}"
        cur.execute(
            """
            INSERT INTO booking_driver_requests (id, booking_id, driver_id, status)
            VALUES (?, ?, ?, 'SENT')
            """,
            (req_id, created["id"], driver_id),
        )
        conn.commit()
        conn.close()

        return {
            "success": True,
            "booking_id": created["id"],
            "booking_number": created.get("booking_number", "RM-88219"),
            "status": "CONFIRMED",
            "driver_id": driver_id,
            "pickup_eta_mins": 4,
            "pickup_address": booking_payload["pickup_address"],
            "dropoff_address": booking_payload["dropoff_address"],
            "total_fare": fare,
            "route_polyline": polyline,
        }

    @staticmethod
    def cancel_booking(booking_id: str, reason: Optional[str] = None) -> bool:
        return BookingRepository.update_status(booking_id, "CANCELLED")
