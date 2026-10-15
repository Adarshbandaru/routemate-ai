import json
import os
import time
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="RouteMate AI - Mobility API", version="1.0.0")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCENARIOS_DIR = Path(__file__).parent / "scenarios"


def load_scenario(scenario_id: str) -> Optional[Dict[str, Any]]:
    path = SCENARIOS_DIR / f"{scenario_id}.json"
    if not path.is_file():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_all_scenarios():
    scenarios = []
    if not SCENARIOS_DIR.exists():
        return scenarios
    for p in sorted(SCENARIOS_DIR.glob("*.json")):
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                scenarios.append({
                    "id": data.get("id", p.stem),
                    "name": data.get("name", p.stem),
                    "description": data.get("description", ""),
                    "distance_km": data.get("distance_km", 0),
                    "duration_min": data.get("duration_min", 0),
                    "pickup": data.get("pickup", {}),
                    "dropoff": data.get("dropoff", {}),
                })
        except Exception:
            continue
    return scenarios


class ConfirmRideRequest(BaseModel):
    driver_id: str
    scenario_id: str


@app.get("/v1/health")
def health_check():
    return {"success": True, "status": "backend running"}


@app.get("/health")
def root_health():
    return {"status": "ok", "service": "routemate-backend", "online": True}


@app.get("/v1/scenarios")
def get_scenarios():
    scenarios = load_all_scenarios()
    return {"success": True, "data": scenarios}


@app.get("/v1/scenario/{scenario_id}")
def get_scenario_by_id(scenario_id: str):
    data = load_scenario(scenario_id)
    if not data:
        raise HTTPException(
            status_code=404,
            detail={"success": False, "error": f"Scenario '{scenario_id}' not found"}
        )
    return {"success": True, "data": data}


@app.post("/v1/confirm-ride")
def confirm_ride(req: ConfirmRideRequest):
    scenario = load_scenario(req.scenario_id)
    if not scenario:
        raise HTTPException(
            status_code=404,
            detail={"success": False, "error": f"Scenario '{req.scenario_id}' not found"}
        )

    matched_driver = None
    for d in scenario.get("available_drivers", []):
        if d.get("id") == req.driver_id:
            matched_driver = d
            break

    if not matched_driver and scenario.get("available_drivers"):
        matched_driver = scenario["available_drivers"][0]

    if not matched_driver:
        raise HTTPException(
            status_code=404,
            detail={"success": False, "error": f"Driver '{req.driver_id}' not found in scenario"}
        )

    ride_id = f"RIDE_{int(time.time() * 1000) % 1000000}"

    return {
        "success": True,
        "data": {
            "ride_id": ride_id,
            "driver": matched_driver,
            "pickup": scenario.get("pickup"),
            "dropoff": scenario.get("dropoff"),
            "route_polyline": scenario.get("route_polyline", []),
            "status": "driver_arriving",
            "eta_min": matched_driver.get("eta_to_pickup_min", 2),
        }
    }


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False)
