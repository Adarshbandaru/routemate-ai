"""Unit tests for the predictive fleet repositioning and spatial rebalancer."""
import unittest
from datetime import datetime, timezone

from routemate.geometry import Coordinate
from routemate.models import Journey, Vehicle, VerificationContext
from routemate.repositioning import (
    PredictiveFleetRebalancer,
    RepositioningReport,
    SF_TRANSIT_ZONES,
)


def _make_idle_driver(did: str, coord: Coordinate) -> Journey:
    dest = Coordinate(coord.latitude + 0.002, coord.longitude + 0.002)
    return Journey(
        journey_id=did,
        start=coord,
        destination=dest,
        departure=datetime.now(timezone.utc),
        route=(coord, dest),
        vehicle=Vehicle(kind="car", capacity=4, verified=True),
        verification=VerificationContext(identity_verified=True, vehicle_verified=True),
        seats_requested=1,
    )


class TestPredictiveFleetRebalancer(unittest.TestCase):
    def test_rebalancer_moves_surplus_to_deficit(self):
        rebalancer = PredictiveFleetRebalancer(zones=SF_TRANSIT_ZONES)

        # Place 15 drivers in Financial District (surplus) and 0 in Caltrain / Mission Bay (deficit)
        fidi_coord = SF_TRANSIT_ZONES[0].centroid
        idle_drivers = [_make_idle_driver(f"driver-{i}", fidi_coord) for i in range(15)]

        # Demand multiplier elevating Caltrain / Mission Bay
        demand_mults = {"Z3_caltrain": 1.5, "Z1_fidi": 0.5}

        report = rebalancer.compute_rebalancing(idle_drivers, demand_multipliers=demand_mults)

        self.assertIsInstance(report, RepositioningReport)
        self.assertEqual(report.total_idle_vehicles, 15)
        self.assertGreater(report.vehicles_repositioned, 0)
        self.assertGreater(report.total_rebalance_vkt_km, 0.0)
        self.assertGreaterEqual(report.demand_fulfillment_gain_pct, 0.0)

        # Check directives
        for d in report.directives:
            self.assertEqual(d.origin_zone, "Z1_fidi")
            self.assertGreater(d.relocation_distance_km, 0.0)
            self.assertGreater(d.estimated_transit_seconds, 0.0)

    def test_rebalancer_no_action_when_balanced(self):
        rebalancer = PredictiveFleetRebalancer(zones=SF_TRANSIT_ZONES)
        # Empty fleet produces zero moves
        report = rebalancer.compute_rebalancing([])
        self.assertEqual(report.total_idle_vehicles, 0)
        self.assertEqual(report.vehicles_repositioned, 0)
        self.assertEqual(report.directives, [])

        dict_out = report.to_dict()
        self.assertEqual(dict_out["vehicles_repositioned"], 0)


if __name__ == "__main__":
    unittest.main()
