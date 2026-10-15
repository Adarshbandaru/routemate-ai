"""Automated Unit and Integration Tests for Phase 4: Production Hardening & Operational Wallet."""

import os
import unittest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.database import init_db
from backend.app.repositories.booking_repo import BookingRepository
from backend.app.repositories.phase3_repo import WalletRepository, PaymentRepository


class TestPhase4ProductionHardening(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_01_security_headers_present(self):
        """Verify OWASP and enterprise security headers are present in responses."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)

        # Check security headers
        self.assertEqual(res.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(res.headers.get("X-Frame-Options"), "DENY")
        self.assertIn("max-age=31536000", res.headers.get("Strict-Transport-Security", ""))
        self.assertIn("default-src 'self'", res.headers.get("Content-Security-Policy", ""))
        self.assertEqual(res.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")

    def test_02_request_correlation_and_timing_headers(self):
        """Verify X-Request-ID and X-Response-Time headers are generated and returned."""
        res = self.client.get("/v1/health")
        self.assertEqual(res.status_code, 200)

        req_id = res.headers.get("X-Request-ID")
        self.assertIsNotNone(req_id)
        self.assertTrue(req_id.startswith("req_"))

        resp_time = res.headers.get("X-Response-Time")
        self.assertIsNotNone(resp_time)
        self.assertTrue(resp_time.endswith("ms"))

    def test_03_telemetry_stats_endpoint(self):
        """Verify /v1/telemetry/stats returns accurate database metrics."""
        res = self.client.get("/v1/telemetry/stats")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["service"], "routemate-mobility-api")
        self.assertIn("metrics", data)
        self.assertGreaterEqual(data["metrics"]["total_bookings"], 0)
        self.assertGreaterEqual(data["metrics"]["active_drivers"], 0)

    def test_04_operational_wallet_get_active(self):
        """Verify uninitialized wallet returns honest disabled state, and becomes active after topup."""
        user_id = f"usr_wlt_{os.urandom(4).hex()}"
        res = self.client.get(f"/v1/wallet/{user_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["enabled"])
        self.assertEqual(data["balance"], 0.0)

        # After topup, wallet becomes active
        self.client.post(f"/v1/wallet/{user_id}/topup", json={"amount": 100.0})
        res_active = self.client.get(f"/v1/wallet/{user_id}")
        self.assertEqual(res_active.status_code, 200)
        self.assertTrue(res_active.json()["enabled"])
        self.assertEqual(res_active.json()["balance"], 100.0)

    def test_05_wallet_topup_credit(self):
        """Verify wallet topup credits balance and records ledger transaction."""
        user_id = f"usr_wlt_{os.urandom(4).hex()}"
        topup_res = self.client.post(f"/v1/wallet/{user_id}/topup", json={
            "amount": 500.0,
            "payment_method": "RAZORPAY",
            "reference_id": "pay_topup_123",
        })
        self.assertEqual(topup_res.status_code, 200)
        topup_data = topup_res.json()

        self.assertTrue(topup_data["success"])
        self.assertEqual(topup_data["balance"], 500.0)
        self.assertEqual(topup_data["credited"], 500.0)

        # Check ledger transactions
        txns_res = self.client.get(f"/v1/wallet/{user_id}/transactions")
        self.assertEqual(txns_res.status_code, 200)
        txns = txns_res.json()["transactions"]
        self.assertEqual(len(txns), 1)
        self.assertEqual(txns[0]["type"], "CREDIT")
        self.assertEqual(txns[0]["amount"], 500.0)

    def test_06_wallet_pay_success_and_debit(self):
        """Verify wallet balance can pay for booking fare."""
        user_id = f"usr_wlt_{os.urandom(4).hex()}"
        # 1. Topup 400
        self.client.post(f"/v1/wallet/{user_id}/topup", json={"amount": 400.0})

        # 2. Create booking for 250
        bkg_id = f"bkg_pay_{os.urandom(4).hex()}"
        BookingRepository.create({
            "id": bkg_id,
            "rider_id": user_id,
            "pickup_address": "A",
            "dropoff_address": "B",
            "pickup_lat": 31.0,
            "pickup_lng": 75.0,
            "dropoff_lat": 31.1,
            "dropoff_lng": 75.1,
            "distance_km": 10.0,
            "duration_sec": 600,
            "vehicle_type": "sedan",
            "total_fare": 250.0,
        })

        # 3. Pay via wallet
        pay_res = self.client.post(f"/v1/wallet/{user_id}/pay", json={
            "booking_id": bkg_id,
            "amount": 250.0,
        })
        self.assertEqual(pay_res.status_code, 200)
        pay_data = pay_res.json()

        self.assertTrue(pay_data["success"])
        self.assertEqual(pay_data["payment_method"], "WALLET")
        self.assertEqual(pay_data["amount"], 250.0)
        self.assertEqual(pay_data["remaining_balance"], 150.0)

        # 4. Check receipt reflects WALLET and COMPLETED
        rcpt_res = self.client.get(f"/v1/bookings/{bkg_id}/receipt")
        self.assertEqual(rcpt_res.status_code, 200)
        rcpt = rcpt_res.json()
        self.assertEqual(rcpt["payment_method"], "WALLET")
        self.assertEqual(rcpt["payment_status"], "COMPLETED")

    def test_07_wallet_pay_insufficient_balance_rejection(self):
        """Verify payment attempt with insufficient wallet balance is rejected."""
        user_id = f"usr_wlt_{os.urandom(4).hex()}"
        # Topup only 50
        self.client.post(f"/v1/wallet/{user_id}/topup", json={"amount": 50.0})

        bkg_id = f"bkg_pay_{os.urandom(4).hex()}"
        BookingRepository.create({
            "id": bkg_id,
            "rider_id": user_id,
            "pickup_address": "A",
            "dropoff_address": "B",
            "pickup_lat": 31.0,
            "pickup_lng": 75.0,
            "dropoff_lat": 31.1,
            "dropoff_lng": 75.1,
            "distance_km": 10.0,
            "duration_sec": 600,
            "vehicle_type": "sedan",
            "total_fare": 200.0,
        })

        # Attempt to pay 200 with only 50
        pay_res = self.client.post(f"/v1/wallet/{user_id}/pay", json={
            "booking_id": bkg_id,
            "amount": 200.0,
        })
        self.assertEqual(pay_res.status_code, 400)
        self.assertIn("Insufficient wallet balance", pay_res.json()["detail"])


if __name__ == "__main__":
    unittest.main()
