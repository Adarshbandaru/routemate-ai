"""Research scenario loader and algorithmic matching proxy endpoints."""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Body
from ...core.config import SCENARIOS_DIR

# Import routemate core matching if available in environment
try:
    from routemate.api import match as routemate_match
except ImportError:
    routemate_match = None

router = APIRouter(tags=["Scenarios & Matching"])


def load_scenario(scenario_id: str) -> Optional[Dict[str, Any]]:
    path = SCENARIOS_DIR / f"{scenario_id}.json"
    if not path.is_file():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def load_all_scenarios() -> List[Dict[str, Any]]:
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
                    "route_polyline": data.get("route_polyline", []),
                    "available_drivers": data.get("available_drivers", []),
                    "rejected_candidates": data.get("rejected_candidates", []),
                })
        except Exception:
            continue
    return scenarios


@router.get("/v1/scenarios")
def get_scenarios():
    return {"success": True, "data": load_all_scenarios()}


@router.get("/v1/scenario/{scenario_id}")
def get_scenario_by_id(scenario_id: str):
    data = load_scenario(scenario_id)
    if not data:
        raise HTTPException(
            status_code=404,
            detail={"success": False, "error": f"Scenario '{scenario_id}' not found"},
        )
    return {"success": True, "data": data}


@router.post("/v1/match")
def match_ride(payload: Dict[str, Any] = Body(...)):
    """Delegate to routemate research matching core with deterministic candidate pruning and scoring."""
    if routemate_match is None:
        raise HTTPException(
            status_code=501,
            detail={"success": False, "error": "Matching engine module not available on server"},
        )
    try:
        result = routemate_match(payload)
        return {"success": True, "data": result}
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": str(exc)},
        )
