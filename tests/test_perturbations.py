import copy
from dataclasses import replace
import json
import math
import random
import unittest
from unittest.mock import patch

from routemate.geometry import Coordinate, EARTH_RADIUS_KM
from routemate.models import VerificationContext
from routemate.perturbations import CONDITIONS, PARAMETERS, PERTURBATION_VERSION, perturb_query
from routemate.synthetic import generate_dataset


class PerturbationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.query = generate_dataset(seeds=(11,), requests_per_scenario=2,
                                    scenarios={"dense": 24})[1]

    def assert_disk_bound(self, before, after):
        north = EARTH_RADIUS_KM * math.radians(after.latitude - before.latitude)
        east = EARTH_RADIUS_KM * math.radians(after.longitude - before.longitude) * math.cos(math.radians(before.latitude))
        self.assertLessEqual(math.hypot(north, east), 0.1 + 1e-10)
        self.assertNotEqual(before, after)

    def test_control_and_metadata(self):
        self.assertIs(perturb_query(self.query, "control"), self.query)
        self.assertEqual(CONDITIONS, ("control", "endpoints_100m", "route_100m", "departure_5min", "availability_25pct"))
        self.assertEqual(json.loads(json.dumps(PARAMETERS))["version"], PERTURBATION_VERSION)

    def test_reproducibility_preservation_and_no_mutation(self):
        original = copy.deepcopy(self.query)
        global_state = random.getstate()
        for condition in CONDITIONS:
            with self.subTest(condition=condition):
                result = perturb_query(self.query, condition)
                perturb_query(self.query, "departure_5min")
                self.assertEqual(result, perturb_query(self.query, condition))
                self.assertEqual(result.query_id, self.query.query_id)
                self.assertEqual(result.seed, self.query.seed)
                self.assertEqual(result.scenario, self.query.scenario)
                self.assertIs(result.rider, self.query.rider)
                self.assertIs(result.relevant_ids, self.query.relevant_ids)
                self.assertIs(result.latent, self.query.latent)
                if condition != "availability_25pct":
                    self.assertEqual([d.journey_id for d in result.drivers], [d.journey_id for d in self.query.drivers])
        self.assertEqual(self.query, original)
        self.assertEqual(random.getstate(), global_state)

    def test_endpoints_bounds_and_synchronization_at_latitude(self):
        drivers = []
        for driver in self.query.drivers:
            route = tuple(Coordinate(p.latitude + 60, p.longitude) for p in driver.route)
            drivers.append(replace(driver, route=route, start=route[0], destination=route[-1]))
        query = replace(self.query, drivers=tuple(drivers))
        for before, after in zip(query.drivers, perturb_query(query, "endpoints_100m").drivers):
            self.assert_disk_bound(before.start, after.start)
            self.assert_disk_bound(before.destination, after.destination)
            self.assertEqual(after.route[0], after.start)
            self.assertEqual(after.route[-1], after.destination)
            self.assertEqual(after.route[1:-1], before.route[1:-1])
            self.assertEqual(after.departure, before.departure)
            self.assertNotEqual((after.start.latitude - before.start.latitude, after.start.longitude - before.start.longitude),
                                (after.destination.latitude - before.destination.latitude, after.destination.longitude - before.destination.longitude))

    def test_route_interior_only(self):
        for before, after in zip(self.query.drivers, perturb_query(self.query, "route_100m").drivers):
            self.assertEqual(after.start, before.start)
            self.assertEqual(after.destination, before.destination)
            self.assertEqual(after.route[0], before.route[0])
            self.assertEqual(after.route[-1], before.route[-1])
            self.assertEqual(after.departure, before.departure)
            self.assertEqual(len(after.route), len(before.route))
            for a, b in zip(before.route[1:-1], after.route[1:-1]):
                self.assert_disk_bound(a, b)
        driver = self.query.drivers[0]
        query = replace(self.query, drivers=(replace(driver, route=(driver.start, driver.destination)),))
        self.assertEqual(perturb_query(query, "route_100m"), query)

    def test_departure_bounds(self):
        offsets = []
        for before, after in zip(self.query.drivers, perturb_query(self.query, "departure_5min").drivers):
            minutes = (after.departure - before.departure).total_seconds() / 60
            self.assertLessEqual(abs(minutes), 5)
            offsets.append(minutes)
            self.assertEqual(after.route, before.route)
            self.assertEqual(after.start, before.start)
            self.assertEqual(after.destination, before.destination)
        self.assertLess(min(offsets), 0)
        self.assertGreater(max(offsets), 0)

    def test_verification_capacity_and_flags_invariant(self):
        query = replace(self.query, drivers=tuple(replace(d, verification=VerificationContext(
            d.verification.identity_verified, d.verification.vehicle_verified, ("review",))) for d in self.query.drivers))
        originals = {d.journey_id: d for d in query.drivers}
        for condition in CONDITIONS:
            for driver in perturb_query(query, condition).drivers:
                before = originals[driver.journey_id]
                self.assertIs(driver.vehicle, before.vehicle)
                self.assertIs(driver.verification, before.verification)
                self.assertEqual(driver.seats_requested, before.seats_requested)

    def test_availability_subset_retained_labels_and_empty_pool(self):
        query = replace(self.query, relevant_ids=tuple(d.journey_id for d in self.query.drivers))
        result = perturb_query(query, "availability_25pct")
        self.assertGreater(len(result.drivers), 0)
        self.assertLess(len(result.drivers), len(query.drivers))
        kept = {d.journey_id for d in result.drivers}
        self.assertEqual(result.drivers, tuple(d for d in query.drivers if d.journey_id in kept))
        self.assertEqual(result.relevant_ids, query.relevant_ids)
        self.assertTrue(set(result.relevant_ids) - kept)
        with patch("routemate.perturbations.random.Random") as rng:
            rng.return_value.random.side_effect = [0.249, 0.25] + [0.0] * 22
            self.assertEqual(perturb_query(query, "availability_25pct").drivers, (query.drivers[1],))
        for index in range(100):
            single = replace(query, query_id=f"single-{index}", drivers=query.drivers[:1])
            empty = perturb_query(single, "availability_25pct")
            if not empty.drivers:
                self.assertEqual(empty.relevant_ids, single.relevant_ids)
                break
        else:
            self.fail("no empty pool observed for singleton availability perturbations")
        for condition in CONDITIONS:
            self.assertEqual(perturb_query(replace(query, drivers=()), condition).drivers, ())

    def test_journey_validation_is_applied(self):
        with patch("routemate.perturbations._offset", return_value=Coordinate(71, 0)):
            with self.assertRaisesRegex(ValueError, "unsupported local projection domain"):
                perturb_query(self.query, "route_100m")

    def test_unknown_condition(self):
        with self.assertRaisesRegex(ValueError, "unknown perturbation condition"):
            perturb_query(self.query, "unknown")


if __name__ == "__main__":
    unittest.main()
