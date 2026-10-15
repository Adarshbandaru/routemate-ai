"""Automated unit and integration test suite for Phase 3.5 Razorpay Payment Gateway."""

import json
import os
import unittest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.database import init_db
from backend.app.core.config import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
from backend.app.services.razorpay_service import RazorpayService
from backend.app.repositories.booking_repo import BookingRepository
from backend.app.repositories.phase3_repo import PaymentRepository


class TestRazorpayIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        # Create a test booking
        self.booking_id = f"bkg_rzp_{os.urandom(4).hex()}"
        bkg = BookingRepository.create({
            "id": self.booking_id,
            "rider_id": "user_rider_demo",
            "pickup_address": "LPU Campus Main Gate",
            "dropoff_address": "Jalandhar City Center",
            "pickup_lat": 31.2536,
            "pickup_lng": 75.7037,
            "dropoff_lat": 31.3260,
            "dropoff_lng": 75.5762,
            "distance_km": 21.4,
            "duration_sec": 1440,
            "vehicle_type": "sedan",
            "total_fare": 263.03,
            "driver_id": "drv_priya",
        })
        self.assertIsNotNone(bkg)

    def test_01_create_razorpay_order(self):
        """Verify order creation converts to paise, creates pending transaction, returns key_id."""
        res = self.client.post("/v1/payment/razorpay/order", json={
            "booking_id": self.booking_id,
            "amount": 263.03,
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["order_id"].startswith("order_"))
        self.assertEqual(data["amount"], 26303)  # In paise
        self.assertEqual(data["currency"], "INR")
        self.assertEqual(data["key_id"], RAZORPAY_KEY_ID)
        self.assertEqual(data["booking_id"], self.booking_id)

        # Check transaction in DB
        txn = PaymentRepository.get_by_order_id(data["order_id"])
        self.assertIsNotNone(txn)
        self.assertEqual(txn["status"], "PENDING")
        self.assertEqual(txn["payment_method"], "RAZORPAY")

    def test_02_verify_valid_signature(self):
        """Verify cryptographic HMAC-SHA256 signature verification completes payment."""
        order_res = self.client.post("/v1/payment/razorpay/order", json={
            "booking_id": self.booking_id,
            "amount": 263.03,
        })
        order_id = order_res.json()["order_id"]
        payment_id = f"pay_{os.urandom(6).hex()}"
        valid_signature = RazorpayService.generate_sandbox_signature(order_id, payment_id)

        verify_res = self.client.post("/v1/payment/razorpay/verify", json={
            "booking_id": self.booking_id,
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": valid_signature,
        })
        self.assertEqual(verify_res.status_code, 200)
        data = verify_res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "COMPLETED")
        self.assertEqual(data["payment_method"], "RAZORPAY")

        # Verify receipt reflects RAZORPAY and COMPLETED
        rcpt_res = self.client.get(f"/v1/bookings/{self.booking_id}/receipt")
        self.assertEqual(rcpt_res.status_code, 200)
        rcpt = rcpt_res.json()
        self.assertEqual(rcpt["payment_method"], "RAZORPAY")
        self.assertEqual(rcpt["payment_status"], "COMPLETED")

    def test_03_reject_tampered_signature(self):
        """Verify tampered signature is rejected and marks transaction failed."""
        order_res = self.client.post("/v1/payment/razorpay/order", json={
            "booking_id": self.booking_id,
            "amount": 263.03,
        })
        order_id = order_res.json()["order_id"]
        payment_id = f"pay_{os.urandom(6).hex()}"
        tampered_signature = "invalid_tampered_hmac_sha256_hash"

        verify_res = self.client.post("/v1/payment/razorpay/verify", json={
            "booking_id": self.booking_id,
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": tampered_signature,
        })
        self.assertEqual(verify_res.status_code, 400)
        self.assertIn("Invalid Razorpay signature", verify_res.json()["detail"])

        txn = PaymentRepository.get_by_order_id(order_id)
        self.assertIsNotNone(txn)
        self.assertEqual(txn["status"], "FAILED")

    def test_04_idempotent_payment_verification(self):
        """Verify repeated calls with identical payment signature succeed idempotently."""
        order_res = self.client.post("/v1/payment/razorpay/order", json={
            "booking_id": self.booking_id,
            "amount": 150.0,
        })
        order_id = order_res.json()["order_id"]
        payment_id = f"pay_{os.urandom(6).hex()}"
        signature = RazorpayService.generate_sandbox_signature(order_id, payment_id)

        # Call 1
        res1 = self.client.post("/v1/payment/razorpay/verify", json={
            "booking_id": self.booking_id,
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        self.assertEqual(res1.status_code, 200)

        # Call 2
        res2 = self.client.post("/v1/payment/razorpay/verify", json={
            "booking_id": self.booking_id,
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["status"], "COMPLETED")

    def test_05_webhook_capture_event(self):
        """Verify webhook signature verification and idempotent payment.captured processing."""
        order_res = self.client.post("/v1/payment/razorpay/order", json={
            "booking_id": self.booking_id,
            "amount": 200.0,
        })
        order_id = order_res.json()["order_id"]
        payment_id = f"pay_hook_{os.urandom(4).hex()}"

        webhook_body = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": payment_id,
                        "order_id": order_id,
                        "amount": 20000,
                        "status": "captured",
                    }
                }
            }
        }
        body_bytes = json.dumps(webhook_body).encode("utf-8")
        import hmac, hashlib
        valid_wh_sig = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()

        wh_res = self.client.post(
            "/v1/payment/razorpay/webhook",
            content=body_bytes,
            headers={"X-Razorpay-Signature": valid_wh_sig, "Content-Type": "application/json"},
        )
        self.assertEqual(wh_res.status_code, 200)
        self.assertEqual(wh_res.json()["event"], "payment.captured")

        # Verify transaction status was updated to COMPLETED
        txn = PaymentRepository.get_by_order_id(order_id)
        self.assertEqual(txn["status"], "COMPLETED")
        self.assertEqual(txn["payment_method"], "RAZORPAY")

    def test_06_webhook_invalid_signature_rejection(self):
        """Verify webhook with bad signature is rejected with HTTP 400."""
        body_bytes = json.dumps({"event": "payment.captured"}).encode("utf-8")
        wh_res = self.client.post(
            "/v1/payment/razorpay/webhook",
            content=body_bytes,
            headers={"X-Razorpay-Signature": "bad_sig", "Content-Type": "application/json"},
        )
        self.assertEqual(wh_res.status_code, 400)

    def test_07_refund_completed_payment(self):
        """Verify completed online payment can be refunded."""
        # Complete payment
        order_res = self.client.post("/v1/payment/razorpay/order", json={
            "booking_id": self.booking_id,
            "amount": 263.03,
        })
        order_id = order_res.json()["order_id"]
        payment_id = f"pay_{os.urandom(6).hex()}"
        signature = RazorpayService.generate_sandbox_signature(order_id, payment_id)
        self.client.post("/v1/payment/razorpay/verify", json={
            "booking_id": self.booking_id,
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })

        # Refund
        rfnd_res = self.client.post("/v1/payment/razorpay/refund", json={
            "booking_id": self.booking_id,
            "reason": "Trip cancelled by rider",
        })
        self.assertEqual(rfnd_res.status_code, 200)
        data = rfnd_res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "REFUNDED")
        self.assertTrue(data["refund_id"].startswith("rfnd_"))

        # Verify transaction state in DB
        txn = PaymentRepository.get_by_booking_id(self.booking_id)
        self.assertEqual(txn["status"], "REFUNDED")
        self.assertEqual(txn["refund_id"], data["refund_id"])

    def test_08_cannot_refund_uncompleted_payment(self):
        """Verify refund attempt on pending or cash payment without completion is rejected."""
        unpaid_bkg = f"bkg_unpaid_{os.urandom(4).hex()}"
        BookingRepository.create({
            "id": unpaid_bkg,
            "rider_id": "user_rider_demo",
            "pickup_address": "A",
            "dropoff_address": "B",
            "pickup_lat": 31.0,
            "pickup_lng": 75.0,
            "dropoff_lat": 31.1,
            "dropoff_lng": 75.1,
            "distance_km": 5.0,
            "duration_sec": 300,
            "vehicle_type": "sedan",
            "total_fare": 100.0,
        })
        # Initiates order (pending)
        self.client.post("/v1/payment/razorpay/order", json={
            "booking_id": unpaid_bkg,
            "amount": 100.0,
        })
        rfnd_res = self.client.post("/v1/payment/razorpay/refund", json={
            "booking_id": unpaid_bkg,
        })
        self.assertEqual(rfnd_res.status_code, 400)
        self.assertIn("Cannot refund", rfnd_res.json()["detail"])


if __name__ == "__main__":
    unittest.main()
