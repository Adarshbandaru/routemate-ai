"""RouteMate AI — Phase 5 Production Readiness Verification Test Suite.

Validates:
1. Health check active database ping and failure handling.
2. Single-use OTP token invalidation and attempt limit throttling.
3. Wallet authorization and IDOR prevention.
4. Booking cancellation ownership verification.
5. SQLite WAL mode, foreign keys, and busy timeout enforcement.
6. Rate limiting on sensitive endpoints.
7. Database live online backup and dry-run restore verification.
"""

import os
import sqlite3
import time
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.database import get_connection, DB_PATH
from backend.app.core.security import (
    create_access_token,
    generate_otp_for_phone,
    verify_phone_otp,
    OTP_STORE,
    OTP_BY_ID,
)
from backend.scripts.backup_db import perform_backup
from backend.scripts.restore_db import perform_restore
from backend.app.repositories.booking_repo import BookingRepository


class TestPhase5ProductionReadiness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # Ensure test users exist in database to satisfy foreign keys
        conn = get_connection()
        cur = conn.cursor()
        test_users = [
            ("user_victim_a", "+919999900001", "Victim User", "RIDER"),
            ("user_attacker_b", "+919999900002", "Attacker User", "RIDER"),
            ("user_rider_real", "+919999900003", "Real Rider", "RIDER"),
            ("user_intruder_x", "+919999900004", "Intruder User", "RIDER"),
        ]
        for u in test_users:
            cur.execute(
                "INSERT OR IGNORE INTO users (id, phone, name, role) VALUES (?, ?, ?, ?)",
                u,
            )
        conn.commit()
        conn.close()

    def test_01_health_check_db_ping(self):
        """Verify health check endpoints execute an active DB ping."""
        res1 = self.client.get("/health")
        self.assertEqual(res1.status_code, 200)
        body1 = res1.json()
        self.assertEqual(body1["status"], "ok")
        self.assertTrue(body1["online"])
        self.assertEqual(body1["db"], "healthy")

        res2 = self.client.get("/v1/health")
        self.assertEqual(res2.status_code, 200)
        body2 = res2.json()
        self.assertTrue(body2["success"])
        self.assertIn("routemate.db active", body2["db"])

    def test_02_sqlite_pragmas(self):
        """Verify database connection enables WAL mode, foreign keys, and busy timeout."""
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("PRAGMA journal_mode;")
        journal_mode = cur.fetchone()[0]
        self.assertEqual(journal_mode.lower(), "wal")

        cur.execute("PRAGMA foreign_keys;")
        foreign_keys = cur.fetchone()[0]
        self.assertEqual(foreign_keys, 1)

        cur.execute("PRAGMA busy_timeout;")
        busy_timeout = cur.fetchone()[0]
        self.assertEqual(busy_timeout, 5000)

        conn.close()

    def test_03_otp_single_use_consumption(self):
        """Verify OTP codes are strictly single-use and cannot be replayed."""
        test_phone = "+919111122222"
        gen = generate_otp_for_phone(test_phone)
        otp_code = OTP_STORE[test_phone]["otp"]

        # First verification must succeed
        res1 = verify_phone_otp(test_phone, otp_code)
        self.assertIsNotNone(res1)
        self.assertIn("token", res1)

        # Immediate replay of the same OTP must fail
        res2 = verify_phone_otp(test_phone, otp_code)
        self.assertIsNone(res2)

    def test_04_otp_attempt_limit_throttling(self):
        """Verify OTP is locked out after exceeding 5 failed attempts."""
        test_phone = "+919333344444"
        gen = generate_otp_for_phone(test_phone)
        correct_otp = OTP_STORE[test_phone]["otp"]

        # Attempt with wrong OTP 5 times
        for _ in range(5):
            fail_res = verify_phone_otp(test_phone, "000000")
            self.assertIsNone(fail_res)

        # 6th attempt with correct OTP must fail because max attempts was exceeded
        locked_res = verify_phone_otp(test_phone, correct_otp)
        self.assertIsNone(locked_res)
        self.assertNotIn(test_phone, OTP_STORE)

    def test_05_wallet_idor_prevention(self):
        """Verify user A cannot topup, debit, or view user B's wallet."""
        user_a_token = create_access_token("user_victim_a", role="RIDER")
        user_b_token = create_access_token("user_attacker_b", role="RIDER")

        # Setup victim wallet by victim
        topup_res = self.client.post(
            "/v1/wallet/user_victim_a/topup",
            json={"amount": 500.0, "payment_method": "UPI"},
            headers={"Authorization": f"Bearer {user_a_token}"},
        )
        self.assertEqual(topup_res.status_code, 200)

        # Attacker B tries to topup victim A's wallet -> 403 Forbidden
        attack_topup = self.client.post(
            "/v1/wallet/user_victim_a/topup",
            json={"amount": 100.0, "payment_method": "UPI"},
            headers={"Authorization": f"Bearer {user_b_token}"},
        )
        self.assertEqual(attack_topup.status_code, 403)

        # Attacker B tries to view victim A's wallet -> 403 Forbidden
        attack_view = self.client.get(
            "/v1/wallet/user_victim_a",
            headers={"Authorization": f"Bearer {user_b_token}"},
        )
        self.assertEqual(attack_view.status_code, 403)

        # Attacker B tries to view victim A's transactions -> 403 Forbidden
        attack_txns = self.client.get(
            "/v1/wallet/user_victim_a/transactions",
            headers={"Authorization": f"Bearer {user_b_token}"},
        )
        self.assertEqual(attack_txns.status_code, 403)

        # Attacker B tries to debit victim A's wallet -> 403 Forbidden
        attack_pay = self.client.post(
            "/v1/wallet/user_victim_a/pay",
            json={"booking_id": "bk_test_123", "amount": 50.0},
            headers={"Authorization": f"Bearer {user_b_token}"},
        )
        self.assertEqual(attack_pay.status_code, 403)

    def test_06_booking_cancellation_authorization(self):
        """Verify unauthorized user cannot cancel another user's booking."""
        rider_token = create_access_token("user_rider_real", role="RIDER")
        intruder_token = create_access_token("user_intruder_x", role="RIDER")

        # Create a booking owned by user_rider_real
        booking = BookingRepository.create({
            "rider_id": "user_rider_real",
            "pickup_address": "LPU Gate 1",
            "dropoff_address": "Jalandhar City",
            "total_fare": 250.0,
            "status": "CONFIRMED",
        })
        booking_id = booking["id"]

        # Intruder tries to cancel the ride -> 403 Forbidden
        intruder_res = self.client.post(
            f"/v1/bookings/{booking_id}/cancel",
            headers={"Authorization": f"Bearer {intruder_token}"},
        )
        self.assertEqual(intruder_res.status_code, 403)

        # Real rider cancels the ride -> 200 OK
        owner_res = self.client.post(
            f"/v1/bookings/{booking_id}/cancel",
            headers={"Authorization": f"Bearer {rider_token}"},
        )
        self.assertEqual(owner_res.status_code, 200)
        self.assertEqual(owner_res.json()["status"], "CANCELLED")

    def test_07_rate_limiter_headers(self):
        """Verify rate limiter injects standard telemetry headers on sensitive endpoints."""
        res = self.client.post(
            "/v1/auth/send-otp",
            json={"phone": "+919876543210"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("X-RateLimit-Limit", res.headers)
        self.assertIn("X-RateLimit-Remaining", res.headers)
        self.assertIn("X-Request-ID", res.headers)
        self.assertIn("X-Response-Time", res.headers)

    def test_08_database_backup_and_dry_run_restore(self):
        """Verify automated database backup creates valid snapshot and dry-run restore passes."""
        temp_backup_dir = Path(DB_PATH).parent / "backups_test"
        res = perform_backup(Path(DB_PATH), temp_backup_dir, max_retained=5)
        self.assertTrue(res["success"])
        self.assertEqual(res["integrity"], "ok")
        backup_file = Path(res["backup_path"])
        self.assertTrue(backup_file.exists())

        # Dry run restore verification
        restore_res = perform_restore(backup_file, dry_run=True)
        self.assertTrue(restore_res["success"])
        self.assertTrue(restore_res["dry_run"])
        self.assertEqual(restore_res["integrity"], "ok")

        # Cleanup test backup files
        try:
            backup_file.unlink()
            temp_backup_dir.rmdir()
        except OSError:
            pass


if __name__ == "__main__":
    unittest.main()
