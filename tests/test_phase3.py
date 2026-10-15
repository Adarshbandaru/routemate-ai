"""Unit and Integration Tests for RouteMate AI — Phase 3 Features.

Covers:
  - Canonical Fare Calculation Engine
  - Cash Payment Confirmation & Status
  - Promo Codes Validation, Usage, and Application
  - Ratings & Reviews Persistence and Aggregation
  - Scheduled Rides Lifecycle & Validation
  - Ride Pooling Compatibility & Capacity
  - Favorite Drivers Add/Read/Remove
  - Trip Receipts & Ride History
  - Wallet UI Support (Honest Disabled State)
"""

import unittest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.database import init_db, get_connection
from backend.app.services.fare_service import FareService, _round_currency


class TestPhase3Features(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    # ---------------------------------------------------------------------
    # 1. Canonical Fare Calculation Formula
    # ---------------------------------------------------------------------
    def test_canonical_fare_exact_example(self):
        """Part 5 specification: 24.5 km, 25 min, 0 wait, 1.0 surge -> total 263.03"""
        fb = FareService.calculate_fare(distance_km=24.5, duration_min=25, wait_min=0, surge_multiplier=1.0)
        self.assertEqual(fb.base_fare, 50.0)
        self.assertEqual(fb.distance_fare, 188.0)  # (24.5 - 1) * 8 = 188
        self.assertEqual(fb.time_fare, 12.5)       # 25 * 0.50 = 12.5
        self.assertEqual(fb.wait_fare, 0.0)
        self.assertEqual(fb.subtotal, 250.5)      # 50 + 188 + 12.5 = 250.5
        self.assertEqual(fb.tax_rate, 0.05)
        self.assertEqual(fb.tax, 12.53)           # round(250.5 * 0.05, 2) = 12.53
        self.assertEqual(fb.total, 263.03)        # 250.5 + 12.53 = 263.03

    def test_fare_distance_below_one_km(self):
        """Distances <= 1.0 km incur zero distance fare (included in base fare)."""
        fb = FareService.calculate_fare(distance_km=0.8, duration_min=4, wait_min=0, surge_multiplier=1.0)
        self.assertEqual(fb.base_fare, 50.0)
        self.assertEqual(fb.distance_fare, 0.0)
        self.assertEqual(fb.time_fare, 2.0)
        self.assertEqual(fb.subtotal, 52.0)

    def test_fare_waiting_charges(self):
        """First 5 minutes of waiting are free; ₹1/min thereafter."""
        # 4 min waiting -> free
        fb1 = FareService.calculate_fare(distance_km=5.0, duration_min=10, wait_min=4.0)
        self.assertEqual(fb1.wait_fare, 0.0)
        # 10 min waiting -> 5 min charged = ₹5.0
        fb2 = FareService.calculate_fare(distance_km=5.0, duration_min=10, wait_min=10.0)
        self.assertEqual(fb2.wait_fare, 5.0)

    def test_fare_surge_and_discount(self):
        """Surge scales subtotal; discount subtracts and total never becomes negative."""
        fb = FareService.calculate_fare(
            distance_km=10.0,
            duration_min=15.0,
            wait_min=0.0,
            surge_multiplier=1.5,
            discount_amount=500.0,  # exceeds total
        )
        self.assertGreaterEqual(fb.total, 0.0)
        self.assertEqual(fb.total, 0.0)

    def test_api_fare_estimate_endpoint(self):
        """POST /v1/fare/estimate returns complete canonical breakdown."""
        payload = {
            "pickup_lat": 31.3260,
            "pickup_lng": 75.5762,
            "dropoff_lat": 31.2536,
            "dropoff_lng": 75.7037,
            "vehicle_type": "sedan",
            "surge_multiplier": 1.0,
        }
        res = self.client.post("/v1/fare/estimate", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["base_fare"], 50.0)
        self.assertGreater(data["distance_km"], 0.0)
        self.assertGreater(data["total"], 50.0)
        self.assertEqual(data["currency"], "INR")
        self.assertTrue(data["estimate_only"])

    # ---------------------------------------------------------------------
    # 2. Promo Codes
    # ---------------------------------------------------------------------
    def test_get_available_promos(self):
        res = self.client.get("/v1/promo/available")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        codes = [p["code"] for p in data["data"]]
        self.assertIn("WELCOME50", codes)
        self.assertIn("SUMMER20", codes)

    def test_validate_promo_flat(self):
        # WELCOME50: ₹50 flat discount, min fare ₹100
        res = self.client.post("/v1/promo/validate", json={"code": "WELCOME50", "ride_amount": 320.0})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["discount"], 50.0)
        self.assertEqual(data["final_amount"], 270.0)

    def test_validate_promo_minimum_fare_rejection(self):
        res = self.client.post("/v1/promo/validate", json={"code": "WELCOME50", "ride_amount": 60.0})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["valid"])
        self.assertIn("Minimum ride fare", data["message"])

    def test_validate_promo_percentage_and_cap(self):
        # SUMMER20: 20%, max ₹200
        # Ride amount ₹500 -> 20% is ₹100 (< 200)
        res1 = self.client.post("/v1/promo/validate", json={"code": "SUMMER20", "ride_amount": 500.0})
        self.assertEqual(res1.json()["discount"], 100.0)
        # Ride amount ₹1500 -> 20% is ₹300, capped at ₹200
        res2 = self.client.post("/v1/promo/validate", json={"code": "SUMMER20", "ride_amount": 1500.0})
        self.assertEqual(res2.json()["discount"], 200.0)

    # ---------------------------------------------------------------------
    # 3. Cash Payment Workflow
    # ---------------------------------------------------------------------
    def test_cash_payment_confirmation_and_status(self):
        # Create a test booking first
        bk_res = self.client.post("/v1/bookings", json={
            "pickup_lat": 31.3260,
            "pickup_lng": 75.5762,
            "pickup_address": "Jalandhar Station",
            "dropoff_lat": 31.2536,
            "dropoff_lng": 75.7037,
            "dropoff_address": "LPU Phagwara",
            "seats": 1,
        })
        self.assertEqual(bk_res.status_code, 200)
        booking_id = bk_res.json()["booking"]["id"]

        # Check initial payment status
        st_res1 = self.client.get(f"/v1/payment/{booking_id}/status")
        self.assertEqual(st_res1.status_code, 200)
        self.assertEqual(st_res1.json()["status"], "PENDING")

        # Confirm cash payment by driver
        conf_res = self.client.post("/v1/payment/confirm-cash", json={
            "booking_id": booking_id,
            "amount": 280.0,
        })
        self.assertEqual(conf_res.status_code, 200)
        data = conf_res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "COMPLETED")
        self.assertEqual(data["payment_method"], "CASH")
        self.assertEqual(data["amount"], 280.0)

        # Check updated payment status
        st_res2 = self.client.get(f"/v1/payment/{booking_id}/status")
        self.assertEqual(st_res2.status_code, 200)
        self.assertEqual(st_res2.json()["status"], "COMPLETED")

    # ---------------------------------------------------------------------
    # 4. Ratings and Reviews
    # ---------------------------------------------------------------------
    def test_ratings_submission_and_aggregation(self):
        # Create booking to rate
        bk_res = self.client.post("/v1/bookings", json={
            "pickup_lat": 31.3260,
            "pickup_lng": 75.5762,
            "dropoff_lat": 31.2536,
            "dropoff_lng": 75.7037,
            "seats": 1,
        })
        self.assertEqual(bk_res.status_code, 200)
        booking_id = bk_res.json()["booking"]["id"]

        # Submit rating
        rate_res = self.client.post(f"/v1/booking/{booking_id}/rate", json={
            "rating": 5,
            "review": "Smooth driving and very polite!",
            "tags": {"cleanliness": True, "comfort": True, "safety": True},
        })
        self.assertEqual(rate_res.status_code, 200)
        self.assertTrue(rate_res.json()["success"])

        # Query driver ratings breakdown
        drv_res = self.client.get("/v1/driver/drv_priya/ratings")
        self.assertEqual(drv_res.status_code, 200)
        drv_data = drv_res.json()
        self.assertGreater(drv_data["total_reviews"], 0)
        self.assertIn("5", drv_data["breakdown"])

        # Query booking ratings
        bkr_res = self.client.get(f"/v1/booking/{booking_id}/rating")
        self.assertEqual(bkr_res.status_code, 200)
        self.assertIsNotNone(bkr_res.json()["rider_rating"])

    # ---------------------------------------------------------------------
    # 5. Scheduled Rides Lifecycle
    # ---------------------------------------------------------------------
    def test_scheduled_ride_creation_and_rejection_of_past(self):
        # Test past time rejection
        past_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        res_past = self.client.post("/v1/bookings/schedule", json={
            "pickup_lat": 31.3260,
            "pickup_lng": 75.5762,
            "dropoff_lat": 31.2536,
            "dropoff_lng": 75.7037,
            "scheduled_time": past_time,
            "passenger_count": 1,
        })
        self.assertEqual(res_past.status_code, 400)

        # Test valid future time
        future_time = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        res_fut = self.client.post("/v1/bookings/schedule", json={
            "pickup_lat": 31.3260,
            "pickup_lng": 75.5762,
            "dropoff_lat": 31.2536,
            "dropoff_lng": 75.7037,
            "scheduled_time": future_time,
            "passenger_count": 2,
            "special_requests": "Need AC",
        })
        self.assertEqual(res_fut.status_code, 200)
        data = res_fut.json()
        self.assertEqual(data["status"], "SCHEDULED")
        sched_id = data["booking_id"]

        # Confirm scheduled ride
        conf_res = self.client.post(f"/v1/bookings/scheduled/{sched_id}/confirm")
        self.assertEqual(conf_res.status_code, 200)
        self.assertEqual(conf_res.json()["status"], "CONFIRMED")

        # Cancel scheduled ride
        cancel_res = self.client.post(f"/v1/bookings/scheduled/{sched_id}/cancel")
        self.assertEqual(cancel_res.status_code, 200)
        self.assertEqual(cancel_res.json()["status"], "CANCELLED")

    # ---------------------------------------------------------------------
    # 6. Ride Pooling
    # ---------------------------------------------------------------------
    def test_ride_pooling_flow(self):
        res1 = self.client.post("/v1/bookings/pool", json={
            "pickup_lat": 31.3260,
            "pickup_lng": 75.5762,
            "dropoff_lat": 31.2536,
            "dropoff_lng": 75.7037,
            "allow_pooling": True,
        })
        self.assertEqual(res1.status_code, 200)
        pool_data = res1.json()
        self.assertIn("booking_id", pool_data)
        self.assertIn("pool_id", pool_data)

    # ---------------------------------------------------------------------
    # 7. Favorite Drivers
    # ---------------------------------------------------------------------
    def test_favorite_driver_lifecycle(self):
        driver_id = "drv_priya"
        # Add favorite
        add_res = self.client.post(f"/v1/driver/{driver_id}/favorite")
        self.assertEqual(add_res.status_code, 200)
        self.assertTrue(add_res.json()["success"])

        # Check is favorite
        chk_res = self.client.get(f"/v1/driver/{driver_id}/favorite")
        self.assertEqual(chk_res.status_code, 200)
        self.assertTrue(chk_res.json()["is_favorite"])

        # Remove favorite
        del_res = self.client.delete(f"/v1/driver/{driver_id}/favorite")
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json()["success"])

        # Check no longer favorite
        chk_res2 = self.client.get(f"/v1/driver/{driver_id}/favorite")
        self.assertFalse(chk_res2.json()["is_favorite"])

    # ---------------------------------------------------------------------
    # 8. Trip Receipt and History
    # ---------------------------------------------------------------------
    def test_trip_receipt_and_ride_history(self):
        # Create and complete a ride
        bk_res = self.client.post("/v1/bookings", json={
            "pickup_lat": 31.3260,
            "pickup_lng": 75.5762,
            "pickup_address": "LPU Campus",
            "dropoff_lat": 31.2536,
            "dropoff_lng": 75.7037,
            "dropoff_address": "Jalandhar Cantt",
            "seats": 1,
        })
        self.assertEqual(bk_res.status_code, 200)
        b_id = bk_res.json()["booking"]["id"]
        self.client.post("/v1/payment/confirm-cash", json={"booking_id": b_id, "amount": 240.0})

        # Fetch receipt
        rec_res = self.client.get(f"/v1/bookings/{b_id}/receipt")
        self.assertEqual(rec_res.status_code, 200)
        rec = rec_res.json()
        self.assertEqual(rec["booking_id"], b_id)
        self.assertEqual(rec["payment_method"], "CASH")
        self.assertEqual(rec["payment_status"], "COMPLETED")
        self.assertIn("fare_breakdown", rec)

        # Fetch history
        hist_res = self.client.get("/v1/bookings/history")
        self.assertEqual(hist_res.status_code, 200)
        hist = hist_res.json()
        self.assertGreater(hist["total_rides"], 0)
        self.assertGreater(hist["total_monthly_spend"], 0.0)

    # ---------------------------------------------------------------------
    # 9. Wallet UI Honest Disabled State
    # ---------------------------------------------------------------------
    def test_wallet_honest_disabled_state(self):
        res = self.client.get("/v1/wallet/user_rider_demo")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["balance"], 0.0)
        self.assertFalse(data["enabled"])
        self.assertIn("not enabled yet", data["message"])

        res_txns = self.client.get("/v1/wallet/user_rider_demo/transactions")
        self.assertEqual(res_txns.status_code, 200)
        self.assertFalse(res_txns.json()["enabled"])
        self.assertEqual(len(res_txns.json()["transactions"]), 0)


if __name__ == "__main__":
    unittest.main()
