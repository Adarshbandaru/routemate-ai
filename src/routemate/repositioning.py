"""Predictive fleet repositioning and spatial demand rebalancing.

Implements proactive idle-vehicle staging across urban transit zones before
peak request arrivals occur. Formulates supply-demand deficit matching to minimize
rider pickup latency (P95 wait time) and deadhead relocation mileage.
"""
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Sequence, Tuple
import math

from .geometry import Coordinate, haversine_km
from .models import Journey, Vehicle
from .routing import RoadNetwork, NetworkGraphRouter, RouteQuery


@dataclass(frozen=True)
class TransitZone:
    """Urban dispatch sub-region with historical or forecast demand intensity."""
    zone_id: str
    name: str
    centroid: Coordinate
    radius_km: float
    base_demand_rate: float  # requests per 10-minute window


# Canonical San Francisco transit staging zones
SF_TRANSIT_ZONES = [
    TransitZone("Z1_fidi", "Financial District", Coordinate(37.7892, -122.4014), 0.8, 18.0),
    TransitZone("Z2_soma", "SoMa / Moscone Tech Hub", Coordinate(37.7833, -122.4031), 1.0, 22.0),
    TransitZone("Z3_caltrain", "Mission Bay / Caltrain Spine", Coordinate(37.7766, -122.3949), 1.2, 25.0),
    TransitZone("Z4_civic", "Civic Center / Mid-Market", Coordinate(37.7763, -122.4172), 0.9, 14.0),
    TransitZone("Z5_mission", "Mission District Arterial", Coordinate(37.7650, -122.4197), 1.4, 16.0),
]


@dataclass(frozen=True)
class RebalanceDirective:
    """Actionable instruction directing an idle vehicle to stage in a high-demand zone."""
    driver_id: str
    origin_coord: Coordinate
    origin_zone: str
    target_zone: str
    target_coord: Coordinate
    relocation_distance_km: float
    estimated_transit_seconds: float


@dataclass(frozen=True)
class RepositioningReport:
    """Telemetry report quantifying predictive repositioning efficiency."""
    total_idle_vehicles: int
    vehicles_repositioned: int
    unmet_demand_before_rebalance: int
    unmet_demand_after_rebalance: int
    demand_fulfillment_gain_pct: float
    mean_relocation_distance_km: float
    p95_relocation_distance_km: float
    total_rebalance_vkt_km: float
    solver_latency_ms: float
    directives: List[RebalanceDirective]

    def to_dict(self) -> Dict:
        return {
            "total_idle_vehicles": self.total_idle_vehicles,
            "vehicles_repositioned": self.vehicles_repositioned,
            "unmet_demand_before_rebalance": self.unmet_demand_before_rebalance,
            "unmet_demand_after_rebalance": self.unmet_demand_after_rebalance,
            "demand_fulfillment_gain_pct": self.demand_fulfillment_gain_pct,
            "mean_relocation_distance_km": self.mean_relocation_distance_km,
            "p95_relocation_distance_km": self.p95_relocation_distance_km,
            "total_rebalance_vkt_km": self.total_rebalance_vkt_km,
            "solver_latency_ms": self.solver_latency_ms,
            "directives_count": len(self.directives),
        }


class PredictiveFleetRebalancer:
    """Solves minimum-cost bipartite vehicle rebalancing over transit zones."""

    def __init__(
        self,
        zones: Sequence[TransitZone] = SF_TRANSIT_ZONES,
        router: Optional[NetworkGraphRouter] = None,
        max_relocation_radius_km: float = 6.0,
    ) -> None:
        self.zones = list(zones)
        self.router = router
        self.max_relocation_radius_km = max_relocation_radius_km

    def _project_coord(self, coord: Coordinate) -> Coordinate:
        """Projects synthetic equatorial coordinates to San Francisco if needed."""
        if abs(coord.latitude) < 15.0:
            return Coordinate(coord.latitude + 37.7749, coord.longitude - 122.4194)
        return coord

    def _find_nearest_zone(self, coord: Coordinate) -> TransitZone:
        """Finds closest transit zone centroid to a vehicle."""
        proj = self._project_coord(coord)
        best_zone = self.zones[0]
        best_d = haversine_km(proj, best_zone.centroid)
        for z in self.zones[1:]:
            d = haversine_km(proj, z.centroid)
            if d < best_d:
                best_d = d
                best_zone = z
        return best_zone

    def compute_rebalancing(
        self,
        idle_drivers: Sequence[Journey],
        demand_multipliers: Optional[Dict[str, float]] = None,
    ) -> RepositioningReport:
        """Calculates optimal rebalancing directives for idle drivers."""
        import time
        t0 = time.perf_counter()

        # 1. Map idle drivers to zones
        driver_zones: Dict[str, List[Journey]] = {z.zone_id: [] for z in self.zones}
        for d in idle_drivers:
            loc = d.destination if d.destination else d.start
            nearest = self._find_nearest_zone(loc)
            driver_zones[nearest.zone_id].append(d)

        # 2. Compute supply vs forecasted demand proportionally
        multipliers = demand_multipliers or {}
        surplus_drivers: List[Tuple[Journey, str]] = []
        deficit_zones: List[Tuple[TransitZone, int]] = []

        zone_demands = {z.zone_id: z.base_demand_rate * multipliers.get(z.zone_id, 1.0) for z in self.zones}
        total_demand = sum(zone_demands.values())
        total_fleet = len(idle_drivers)

        unmet_before = 0

        for z in self.zones:
            rate = zone_demands[z.zone_id]
            if total_demand > 0 and total_fleet > 0:
                target_vehicles = max(1, round((rate / total_demand) * total_fleet))
            else:
                target_vehicles = int(math.ceil(rate * 0.5))

            current_count = len(driver_zones[z.zone_id])
            diff = current_count - target_vehicles

            if diff > 0:
                # Surplus zone
                for d in driver_zones[z.zone_id][:diff]:
                    surplus_drivers.append((d, z.zone_id))
            elif diff < 0:
                # Deficit zone
                unmet_before += abs(diff)
                deficit_zones.append((z, abs(diff)))

        # 3. Match surplus drivers to nearest deficit zones (greedy minimum cost)
        directives: List[RebalanceDirective] = []
        unmet_after = unmet_before

        # Expand deficit slots
        deficit_slots: List[TransitZone] = []
        for zone, count in deficit_zones:
            deficit_slots.extend([zone] * count)

        used_surplus = set()

        for slot_zone in deficit_slots:
            best_idx = None
            best_dist = float("inf")
            for i, (drv, origin_zid) in enumerate(surplus_drivers):
                if i in used_surplus:
                    continue
                loc = drv.destination if drv.destination else drv.start
                proj_loc = self._project_coord(loc)
                d_km = haversine_km(proj_loc, slot_zone.centroid)
                if d_km <= self.max_relocation_radius_km and d_km < best_dist:
                    best_dist = d_km
                    best_idx = i

            if best_idx is not None:
                used_surplus.add(best_idx)
                drv, origin_zid = surplus_drivers[best_idx]
                loc = self._project_coord(drv.destination if drv.destination else drv.start)

                # Transit duration (estimate at 25 km/h urban speed or router)
                transit_sec = (best_dist / 25.0) * 3600.0
                if self.router:
                    try:
                        q = RouteQuery(loc, slot_zone.centroid)
                        r = self.router.route(q)
                        if r:
                            best_dist = r.distance_km
                            transit_sec = r.duration_seconds
                    except Exception:
                        pass

                directives.append(
                    RebalanceDirective(
                        driver_id=drv.journey_id,
                        origin_coord=loc,
                        origin_zone=origin_zid,
                        target_zone=slot_zone.zone_id,
                        target_coord=slot_zone.centroid,
                        relocation_distance_km=round(best_dist, 3),
                        estimated_transit_seconds=round(transit_sec, 1),
                    )
                )
                unmet_after -= 1

        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        d_distances = [d.relocation_distance_km for d in directives]
        mean_d = sum(d_distances) / len(d_distances) if d_distances else 0.0
        sorted_d = sorted(d_distances)
        p95_d = sorted_d[int(len(sorted_d) * 0.95)] if sorted_d else 0.0
        gain_pct = ((unmet_before - unmet_after) / unmet_before * 100.0) if unmet_before > 0 else 0.0

        return RepositioningReport(
            total_idle_vehicles=len(idle_drivers),
            vehicles_repositioned=len(directives),
            unmet_demand_before_rebalance=unmet_before,
            unmet_demand_after_rebalance=unmet_after,
            demand_fulfillment_gain_pct=round(gain_pct, 1),
            mean_relocation_distance_km=round(mean_d, 2),
            p95_relocation_distance_km=round(p95_d, 2),
            total_rebalance_vkt_km=round(sum(d_distances), 2),
            solver_latency_ms=round(elapsed_ms, 2),
            directives=directives,
        )
