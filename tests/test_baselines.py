import unittest
from datetime import datetime, timezone
from routemate.baselines import prepare_candidates, rank_candidates
from routemate.geometry import Coordinate
from routemate.models import Journey, Vehicle, VerificationContext

def j(i, x=0, y=0):
    a, b = Coordinate(0, x), Coordinate(0, x + 1)
    return Journey(i, a, b, datetime(2026,1,1,tzinfo=timezone.utc), (a,b),
                   Vehicle("car", 2, True), VerificationContext(True, True))

class BaselineTests(unittest.TestCase):
    def setUp(self): self.pool = prepare_candidates(j("r"), [j("b", 0.01), j("a", 0.01), j("c", 0.1)])
    def test_orderings(self):
        self.assertEqual(rank_candidates(self.pool, "nearest_neighbour")[:2], ("a", "b"))
        self.assertEqual(rank_candidates(self.pool, "distance_destination")[:2], ("a", "b"))
        self.assertEqual(rank_candidates(self.pool, "route_time")[:2], ("a", "b"))
    def test_random_seed_and_ties(self):
        self.assertEqual(rank_candidates(self.pool, "seeded_random", 4), rank_candidates(self.pool, "seeded_random", 4))
        self.assertEqual(tuple(sorted(rank_candidates(self.pool, "seeded_random", 4))),
                         tuple(sorted(c.journey_id for c in self.pool.eligible)))
    def test_unique(self):
        with self.assertRaises(ValueError): prepare_candidates(j("r"), [j("x"), j("x")])
