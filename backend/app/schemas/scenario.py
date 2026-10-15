"""Research scenario and match proxy schemas."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class ScenarioDetail(BaseModel):
    id: str
    name: str
    description: str
    distance_km: float
    duration_min: int
    pickup: Dict[str, Any]
    dropoff: Dict[str, Any]
    route_polyline: List[List[float]]
    available_drivers: List[Dict[str, Any]]
    rejected_candidates: List[Dict[str, Any]]
