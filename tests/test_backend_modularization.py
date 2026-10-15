"""Regression tests for RouteMate AI modularized backend architecture."""

import unittest
from backend.api import app as api_app, socket_app as api_socket_app
from backend.app.main import app as main_app, socket_app as main_socket_app
from backend.app.core.database import get_connection, init_db
from backend.app.core.security import generate_otp_for_phone, verify_phone_otp, create_access_token, decode_access_token
from backend.app.repositories.user_repo import UserRepository
from backend.app.repositories.route_repo import RouteRepository
from backend.app.repositories.driver_repo import DriverRepository
from backend.app.services.driver_service import DriverService


class TestBackendModularization(unittest.TestCase):
    def setUp(self):
        init_db()

    def test_app_instances_and_facade_parity(self):
        """Verify that backend.api exports the FastAPI and Socket.io ASGI apps."""
        self.assertIsNotNone(api_app)
        self.assertIsNotNone(api_socket_app)
        self.assertEqual(api_app.title, "RouteMate AI - Mobility API")
        self.assertEqual(main_app.title, "RouteMate AI - Mobility API")

    def test_security_and_token_round_trip(self):
        """Verify JWT token encoding and decoding."""
        user_id = "test_user_mod_99"
        token = create_access_token(user_id, "RIDER")
        payload = decode_access_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["sub"], user_id)
        self.assertEqual(payload["role"], "RIDER")

    def test_otp_issuance_and_master_code(self):
        """Verify OTP generation and dev validation."""
        phone = "+91 98765 00000"
        otp_info = generate_otp_for_phone(phone)
        self.assertIn("otp_id", otp_info)
        # Test master dev code
        verified = verify_phone_otp(phone, "123456")
        self.assertIsNotNone(verified)
        self.assertIn("token", verified)
        self.assertIn("user", verified)

    def test_route_repository_retrieval(self):
        """Verify route catalog query returns Punjab corridor routes."""
        routes = RouteRepository.get_all()
        self.assertGreaterEqual(len(routes), 9)
        # Check first route has required schema
        r0 = routes[0]
        self.assertIn("pickup_name", r0)
        self.assertIn("dropoff_name", r0)
        self.assertIn("avg_fare", r0)

    def test_driver_repository_and_service(self):
        """Verify driver repository and service earnings calculation."""
        earnings = DriverService.get_earnings("drv_priya")
        self.assertIn("today", earnings)
        self.assertIn("rides_today", earnings)
        self.assertIn("rating", earnings)
        self.assertEqual(earnings["today"], 2400)


if __name__ == "__main__":
    unittest.main()
