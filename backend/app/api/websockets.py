"""Socket.io real-time communication events and driver telemetry broadcaster."""

import logging
from typing import Any, Dict
import socketio

logger = logging.getLogger("routemate.websockets")

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")


@sio.event
async def connect(sid, environ, auth=None):
    logger.info("Socket.io client connected: sid=%s, auth=%s", sid, auth)


@sio.event
async def disconnect(sid):
    logger.info("Socket.io client disconnected: sid=%s", sid)


@sio.on("driver:connect")
async def handle_driver_connect(sid, data: Dict[str, Any]):
    driver_id = data.get("driver_id", "unknown")
    status = data.get("status", "online")
    logger.info("driver:connect received: %s, status=%s", driver_id, status)
    await sio.emit("driver:connected", {"status": "connected", "driver_id": driver_id}, to=sid)


@sio.on("driver:location_update")
async def handle_driver_location(sid, data: Dict[str, Any]):
    driver_id = data.get("driver_id")
    lat = data.get("latitude") or data.get("lat")
    lng = data.get("longitude") or data.get("lng")
    heading = data.get("heading", 0)
    # Broadcast driver location update to listening riders
    await sio.emit("booking:driver_location", {"driver_id": driver_id, "lat": lat, "lng": lng, "heading": heading})


@sio.on("driver:respond_request")
async def handle_driver_respond(sid, data: Dict[str, Any]):
    booking_id = data.get("booking_id")
    driver_id = data.get("driver_id")
    response = data.get("response", "REJECT")  # 'ACCEPT' or 'REJECT'
    logger.info("driver:respond_request: booking=%s, driver=%s, response=%s", booking_id, driver_id, response)
    if response == "ACCEPT":
        await sio.emit(
            "booking:accepted",
            {
                "booking_id": booking_id,
                "driver_id": driver_id,
                "driver_name": "Priya Sharma",
                "driver_rating": 4.8,
                "vehicle": "Glacier White Swift Dzire (PB 08 BG 1290)",
            },
        )


@sio.on("driver:message")
async def handle_driver_message(sid, data: Dict[str, Any]):
    booking_id = data.get("booking_id")
    message = data.get("message")
    driver_id = data.get("driver_id", "driver")
    await sio.emit(
        "booking:message",
        {
            "booking_id": booking_id,
            "sender_id": driver_id,
            "sender_type": "driver",
            "message": message,
            "timestamp": "Just now",
        },
    )
