"""Explicit weighted heuristic eligibility index; never a probability."""
from dataclasses import dataclass
from typing import Dict,List
from .features import calculate_features
from .models import Journey
MAXIMUMS={"pickup_distance_km":2.0,"destination_distance_km":3.0,"detour_km":5.0,"departure_difference_min":30.0}
WEIGHTS={"pickup_distance_km":.25,"destination_distance_km":.20,"route_similarity":.25,"direction_similarity":.10,"detour_km":.10,"departure_difference_min":.10}
@dataclass(frozen=True)
class CompatibilityResult:
    score: float; compatible: bool; features: Dict[str,float]; explanations: List[str]
def compatibility_score(driver:Journey,rider:Journey)->CompatibilityResult:
    f=calculate_features(driver,rider); reject=[]
    if not driver.verification.identity_verified: reject.append("rejected: driver identity is not verified")
    if not rider.verification.identity_verified: reject.append("rejected: rider identity is not verified")
    if not driver.vehicle.verified or not driver.verification.vehicle_verified: reject.append("rejected: driver vehicle verification flags must be true")
    if driver.vehicle.capacity<rider.seats_requested: reject.append("rejected: insufficient vehicle capacity")
    if driver.verification.safety_flags or rider.verification.safety_flags: reject.append("rejected: verification safety flag present; no safety prediction")
    for key,limit in MAXIMUMS.items():
        if f[key]>limit: reject.append(f"rejected: {key} {f[key]:.4f} exceeds maximum {limit:g}")
    if f["direction_similarity"]<=.5: reject.append(f"rejected: direction_similarity {f['direction_similarity']:.4f} indicates opposite direction")
    reasons=[]; raw=0
    for key,w in WEIGHTS.items():
        n=max(0,1-f[key]/MAXIMUMS[key]) if key in MAXIMUMS else f[key]; contribution=100*w*n; raw+=contribution; reasons.append(f"{key}={f[key]:.4f}; contribution={contribution:.2f}/100 (weight {w:.2f})")
    reasons.append(f"driver_route_km={f['driver_route_km']:.4f}; detour is geometric ordered insertion, not road distance or ETA")
    reasons.append(f"weighted heuristic index={raw:.2f}/100; threshold=50; not a probability")
    if raw<50: reject.append("rejected: heuristic index below 50")
    return CompatibilityResult(0.0 if reject else round(raw,2),not reject,f,reasons+reject)
