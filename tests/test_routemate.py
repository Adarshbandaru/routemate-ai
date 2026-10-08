import unittest
from datetime import datetime, timezone, timedelta
from routemate.geometry import Coordinate, haversine_km, route_similarity, direction_similarity
from routemate.models import Journey, Vehicle, VerificationContext
from routemate.features import calculate_features
from routemate.scoring import compatibility_score

def journey(capacity=1, flags=(), offset=0):
    r=(Coordinate(0,0), Coordinate(0,1))
    return Journey("x",r[0],r[1],datetime(2026,1,1,tzinfo=timezone.utc)+timedelta(minutes=offset),r,
                   Vehicle(capacity=capacity), VerificationContext(safety_flags=flags))

class RouteMateTests(unittest.TestCase):
  def test_geometry(self):
    self.assertAlmostEqual(haversine_km(Coordinate(0,0), Coordinate(0,1)), 111.195, delta=.2)
    r=(Coordinate(0,0),Coordinate(0,1))
    self.assertEqual(route_similarity(r,r), 1)
    self.assertEqual(direction_similarity(Coordinate(0,0),Coordinate(0,1),Coordinate(0,0),Coordinate(0,1)), 1)

  def test_features_temporal_and_detour(self):
    f=calculate_features(journey(), journey(offset=20))
    self.assertEqual(f["departure_difference_min"], 20)
    self.assertGreaterEqual(f["detour_km"], 0)

  def test_capacity_and_safety_constraints(self):
    rider=journey(); rider=Journey("r", rider.start,rider.destination,rider.departure,rider.route,rider.vehicle,rider.verification,2)
    self.assertFalse(compatibility_score(journey(capacity=1),rider).compatible)
    self.assertFalse(compatibility_score(journey(flags=("flag",)),journey()).compatible)

  def test_score_and_explanations_are_interpretable(self):
    result=compatibility_score(journey(capacity=2),journey(capacity=1,offset=10))
    self.assertTrue(0 <= result.score <= 100)
    self.assertTrue(result.explanations)
    self.assertTrue(any("pickup" in x for x in result.explanations))
