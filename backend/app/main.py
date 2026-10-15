"""RouteMate AI — Main FastAPI Application Entry Point.

This module initializes the application, registers middleware, mounts Socket.io
real-time communication, and registers all modular feature routers.
"""

import sys
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
import socketio
import uvicorn

# Ensure repository src is in sys.path for routemate algorithm imports
src_path = str(Path(__file__).resolve().parent.parent.parent / "src")
if src_path not in sys.path:
    sys.path.insert(0, src_path)

from .core.config import CORS_ORIGINS
from .core.database import init_db, get_connection
from .core.security import verify_jwt_token
from .core.middleware import (
    SecurityHeadersMiddleware,
    RequestCorrelationMiddleware,
    RateLimiterMiddleware,
)
from .api.websockets import sio
from .api.routes.auth import router as auth_router
from .api.routes.routes import router as routes_router
from .api.routes.bookings import router as bookings_router
from .api.routes.driver import router as driver_router
from .api.routes.scenarios import router as scenarios_router
from .api.routes.phase3 import router as phase3_router
from .repositories.booking_repo import BookingRepository
from .schemas.rider import CreateBookingRequest, UpdateBookingStatusRequest

# Initialize database schema and default Punjab corridor seed data
init_db()

app = FastAPI(
    title="RouteMate AI - Mobility API",
    description="Enterprise shared-mobility dispatch and research intelligence backend.",
    version="1.1.0",
)

# Socket.io ASGI Server setup
app.mount("/socket.io", socketio.ASGIApp(sio))
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Phase 4: Production Hardening Middleware Stack
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestCorrelationMiddleware)
app.add_middleware(RateLimiterMiddleware, general_limit=250, sensitive_limit=60, window_sec=60)

# -------------------------------------------------------------
# Include Modular Feature Routers
# -------------------------------------------------------------
app.include_router(auth_router)
app.include_router(routes_router)
app.include_router(phase3_router)
app.include_router(bookings_router)
app.include_router(driver_router)
app.include_router(scenarios_router)



# -------------------------------------------------------------
# Core Health & Diagnostic Endpoints
# -------------------------------------------------------------
@app.get("/v1/health", tags=["Health"])
def health_check():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        conn.close()
        return {"success": True, "status": "backend running", "db": "routemate.db active"}
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"success": False, "status": "unhealthy", "error": f"Database unreachable: {str(exc)}"}
        )


@app.get("/health", tags=["Health"])
def root_health():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        conn.close()
        return {"status": "ok", "service": "routemate-backend", "online": True, "db": "healthy"}
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={"status": "unhealthy", "service": "routemate-backend", "error": "Database unreachable"}
        )


@app.get("/v1/telemetry/stats", tags=["Observability"])
def get_telemetry_stats():
    """Returns real-time backend operational telemetry and database statistics."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM bookings")
    total_bookings = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM drivers WHERE available = 1")
    active_drivers = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM users")
    total_users = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM transactions WHERE status = 'COMPLETED'")
    completed_txns = cur.fetchone()[0]

    conn.close()

    return {
        "status": "healthy",
        "service": "routemate-mobility-api",
        "version": "1.1.0",
        "database": "sqlite3_wal",
        "metrics": {
            "total_users": total_users,
            "active_drivers": active_drivers,
            "total_bookings": total_bookings,
            "completed_transactions": completed_txns,
        },
    }


# -------------------------------------------------------------
# Legacy Compatibility Endpoints
# -------------------------------------------------------------
def _get_current_user(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split("Bearer ", 1)[1].strip()
    return verify_jwt_token(token)


@app.get("/v1/user/profile", tags=["Legacy Compatibility"])
def legacy_user_profile(user: Optional[Dict[str, Any]] = Depends(_get_current_user)):
    if not user:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users LIMIT 1")
        row = cur.fetchone()
        conn.close()
        if row:
            return {"success": True, "data": dict(row), "is_demo": True}
        raise HTTPException(status_code=401, detail={"success": False, "error": "Unauthorized. Please log in."})
    return {"success": True, "data": user}


@app.get("/v1/routes/default", tags=["Legacy Compatibility"])
def legacy_default_routes():
    from .repositories.route_repo import RouteRepository
    routes = RouteRepository.get_all()
    grouped = {"lpu": [], "jalandhar": [], "ludhiana": []}
    for r in routes:
        key = r.get("group_key", "lpu")
        formatted = {
            "id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "pickup": {
                "name": r["pickup_name"],
                "address": r["pickup_address"],
                "lat": r["pickup_lat"],
                "lng": r["pickup_lng"],
            },
            "dropoff": {
                "name": r["dropoff_name"],
                "address": r["dropoff_address"],
                "lat": r["dropoff_lat"],
                "lng": r["dropoff_lng"],
            },
            "distance_km": r["distance_km"],
            "duration_min": r["duration_min"],
            "avg_fare": r["avg_fare"],
            "frequency": r["frequency"],
            "icon": r["icon"],
            "route_polyline": r.get("polyline") or [],
        }
        if key in grouped:
            grouped[key].append(formatted)
        else:
            grouped[key] = [formatted]
    return {"success": True, "data": grouped}


@app.get("/v1/routes/default/{route_id}", tags=["Legacy Compatibility"])
def legacy_default_route_by_id(route_id: str):
    from .repositories.route_repo import RouteRepository
    r = RouteRepository.get_by_id(route_id)
    if not r:
        raise HTTPException(status_code=404, detail={"success": False, "error": f"Route '{route_id}' not found."})
    return {"success": True, "data": r}


@app.post("/v1/bookings/create", tags=["Legacy Compatibility"])
def legacy_create_booking(req: CreateBookingRequest, user: Optional[Dict[str, Any]] = Depends(_get_current_user)):
    data = req.model_dump() if hasattr(req, "model_dump") else req.dict()
    if not data.get("rider_id") and user:
        data["rider_id"] = user["id"]
    created = BookingRepository.create(data, polyline=req.route_polyline)
    return {"success": True, "data": created}


@app.put("/v1/bookings/{booking_id}/status", tags=["Legacy Compatibility"])
def legacy_update_booking_status(booking_id: str, req: UpdateBookingStatusRequest):
    BookingRepository.update_status(booking_id, req.status)
    b = BookingRepository.get_by_id(booking_id)
    return {"success": True, "data": b}


@app.get("/v1/user/bookings", tags=["Legacy Compatibility"])
def legacy_user_bookings(user: Optional[Dict[str, Any]] = Depends(_get_current_user)):
    rider_id = user["id"] if user else "user_rider_demo"
    bookings = BookingRepository.get_by_rider(rider_id)
    return {"success": True, "data": bookings}


@app.get("/v1/drivers/{driver_id}/profile", tags=["Legacy Compatibility"])
def legacy_driver_profile(driver_id: str):
    from .repositories.driver_repo import DriverRepository
    profile = DriverRepository.get_by_id(driver_id)
    return {"success": True, "data": profile or {}}


@app.get("/v1/drivers/{driver_id}/earnings", tags=["Legacy Compatibility"])
def legacy_driver_earnings(driver_id: str):
    from .services.driver_service import DriverService
    return {"success": True, "data": DriverService.get_earnings(driver_id)}


if __name__ == "__main__":
    uvicorn.run("backend.app.main:socket_app", host="0.0.0.0", port=8000, reload=False)
