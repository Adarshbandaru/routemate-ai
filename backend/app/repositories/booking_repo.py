"""Repository for bookings, status transitions, and in-app trip messaging."""

import json
import uuid
from typing import Any, Dict, List, Optional
from ..core.database import get_connection


class BookingRepository:
    @staticmethod
    def create(booking_data: Dict[str, Any], polyline: Optional[List[List[float]]] = None) -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        booking_id = booking_data.get("id") or f"bk_{uuid.uuid4().hex[:12]}"
        booking_num = booking_data.get("booking_number") or f"RM-{uuid.uuid4().hex[:6].upper()}"

        cur.execute(
            """
            INSERT INTO bookings (
                id, booking_number, rider_id, driver_id, pickup_lat, pickup_lng, pickup_address,
                dropoff_lat, dropoff_lng, dropoff_address, scheduled_for, seats, notes, total_fare, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                booking_id,
                booking_num,
                booking_data.get("rider_id", "user_rider_demo"),
                booking_data.get("driver_id"),
                booking_data.get("pickup_lat", 31.3260),
                booking_data.get("pickup_lng", 75.5762),
                booking_data.get("pickup_address", "Pickup Location"),
                booking_data.get("dropoff_lat", 31.2536),
                booking_data.get("dropoff_lng", 75.7037),
                booking_data.get("dropoff_address", "Dropoff Location"),
                booking_data.get("scheduled_for"),
                booking_data.get("seats", 1),
                booking_data.get("notes"),
                booking_data.get("total_fare", 320.0),
                booking_data.get("status", "CONFIRMED"),
            ),
        )

        if polyline:
            route_id = f"bkr_{uuid.uuid4().hex[:12]}"
            cur.execute(
                "INSERT INTO booking_routes (id, booking_id, polyline) VALUES (?, ?, ?)",
                (route_id, booking_id, json.dumps(polyline)),
            )

        conn.commit()
        cur.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else {"id": booking_id, "booking_number": booking_num}

    @staticmethod
    def get_by_id(booking_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT b.*, u.name as rider_name, u.phone as rider_phone, d.license_number as driver_license, d.rating as driver_rating
            FROM bookings b
            LEFT JOIN users u ON b.rider_id = u.id
            LEFT JOIN drivers d ON b.driver_id = d.id
            WHERE b.id = ?
            """,
            (booking_id,),
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return None
        d = dict(row)

        cur.execute("SELECT polyline FROM booking_routes WHERE booking_id = ?", (booking_id,))
        route_row = cur.fetchone()
        if route_row and route_row["polyline"]:
            try:
                d["polyline"] = json.loads(route_row["polyline"])
            except Exception:
                d["polyline"] = None
        else:
            d["polyline"] = None

        conn.close()
        return d

    @staticmethod
    def get_by_rider(rider_id: str) -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT b.*, d.license_number as driver_license, d.rating as driver_rating
            FROM bookings b
            LEFT JOIN drivers d ON b.driver_id = d.id
            WHERE b.rider_id = ?
            ORDER BY b.requested_at DESC
            """,
            (rider_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    @staticmethod
    def update_status(booking_id: str, status: str) -> bool:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (status, booking_id))
        affected = cur.rowcount > 0
        conn.commit()
        conn.close()
        return affected

    @staticmethod
    def add_message(booking_id: str, sender_id: str, content: str, recipient_id: Optional[str] = None, is_automated: bool = False) -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        cur.execute(
            "INSERT INTO messages (id, booking_id, sender_id, recipient_id, content, is_automated) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, booking_id, sender_id, recipient_id, content, 1 if is_automated else 0),
        )
        conn.commit()
        conn.close()
        return {"id": msg_id, "booking_id": booking_id, "sender_id": sender_id, "content": content}

    @staticmethod
    def get_messages(booking_id: str) -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at ASC", (booking_id,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
