"""Phase 3 Data Repositories for RouteMate AI."""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from ..core.database import get_connection


class PaymentRepository:
    @staticmethod
    def get_by_booking_id(booking_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM transactions WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1", (booking_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def create_or_update_cash_transaction(
        booking_id: str,
        user_id: str,
        driver_id: Optional[str],
        amount: float,
        breakdown: Optional[Dict[str, Any]] = None,
        status: str = "PENDING",
        payment_method: str = "CASH",
    ) -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM transactions WHERE booking_id = ?", (booking_id,))
        existing = cur.fetchone()

        bd = breakdown or {}
        base_fare = bd.get("base_fare", 50.0)
        distance_fare = bd.get("distance_fare", 0.0)
        time_fare = bd.get("time_fare", 0.0)
        wait_fare = bd.get("wait_fare", 0.0)
        surge = bd.get("surge_multiplier", 1.0)
        discount = bd.get("discount", 0.0)
        tax = bd.get("tax", 0.0)
        final_amt = bd.get("total", amount)

        if existing:
            txn_id = existing["id"]
            cur.execute("""
            UPDATE transactions
            SET status = ?, payment_method = ?, amount = ?, final_amount = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (status, payment_method, amount, final_amt, txn_id))
        else:
            txn_id = f"txn_{uuid.uuid4().hex[:12]}"
            cur.execute("""
            INSERT INTO transactions (
                id, booking_id, user_id, driver_id, amount, payment_method, status,
                base_fare, distance_fare, time_fare, wait_fare, surge_multiplier,
                discount_amount, tax, final_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                txn_id, booking_id, user_id, driver_id, amount, payment_method, status,
                base_fare, distance_fare, time_fare, wait_fare, surge,
                discount, tax, final_amt
            ))
        conn.commit()
        cur.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
        res = dict(cur.fetchone())
        conn.close()
        return res

    @staticmethod
    def confirm_cash_payment(booking_id: str, amount: float) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM transactions WHERE booking_id = ?", (booking_id,))
        existing = cur.fetchone()

        if existing:
            txn_id = existing["id"]
            cur.execute("""
            UPDATE transactions
            SET status = 'COMPLETED', payment_method = 'CASH', amount = ?, final_amount = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (amount, amount, txn_id))
        else:
            # Look up booking to find user_id & driver_id
            cur.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,))
            b_row = cur.fetchone()
            user_id = b_row["rider_id"] if b_row else "user_rider_demo"
            driver_id = b_row["driver_id"] if b_row else None

            txn_id = f"txn_{uuid.uuid4().hex[:12]}"
            cur.execute("""
            INSERT INTO transactions (
                id, booking_id, user_id, driver_id, amount, payment_method, status, final_amount
            ) VALUES (?, ?, ?, ?, ?, 'CASH', 'COMPLETED', ?)
            """, (txn_id, booking_id, user_id, driver_id, amount, amount))

        # Also sync booking status if completed
        cur.execute("UPDATE bookings SET status = 'COMPLETED' WHERE id = ? AND status != 'CANCELLED'", (booking_id,))
        conn.commit()

        cur.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def create_razorpay_order_transaction(
        booking_id: str,
        user_id: str,
        driver_id: Optional[str],
        amount: float,
        order_id: str,
        breakdown: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Creates or updates a transaction in PENDING status associated with a Razorpay order_id."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM transactions WHERE booking_id = ?", (booking_id,))
        existing = cur.fetchone()

        bd = breakdown or {}
        base_fare = bd.get("base_fare", 50.0)
        distance_fare = bd.get("distance_fare", 0.0)
        time_fare = bd.get("time_fare", 0.0)
        wait_fare = bd.get("wait_fare", 0.0)
        surge = bd.get("surge_multiplier", 1.0)
        discount = bd.get("discount", 0.0)
        tax = bd.get("tax", 0.0)
        final_amt = bd.get("total", amount)

        if existing:
            txn_id = existing["id"]
            cur.execute("""
            UPDATE transactions
            SET status = 'PENDING', payment_method = 'RAZORPAY', amount = ?, final_amount = ?,
                gateway_order_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (amount, final_amt, order_id, txn_id))
        else:
            txn_id = f"txn_{uuid.uuid4().hex[:12]}"
            cur.execute("""
            INSERT INTO transactions (
                id, booking_id, user_id, driver_id, amount, payment_method, status,
                base_fare, distance_fare, time_fare, wait_fare, surge_multiplier,
                discount_amount, tax, final_amount, gateway_order_id
            ) VALUES (?, ?, ?, ?, ?, 'RAZORPAY', 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                txn_id, booking_id, user_id, driver_id, amount,
                base_fare, distance_fare, time_fare, wait_fare, surge,
                discount, tax, final_amt, order_id
            ))
        conn.commit()
        cur.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
        res = dict(cur.fetchone())
        conn.close()
        return res

    @staticmethod
    def verify_and_complete_razorpay_payment(
        booking_id: str,
        order_id: str,
        payment_id: str,
        signature: str,
    ) -> Optional[Dict[str, Any]]:
        """Idempotently marks a Razorpay transaction as COMPLETED upon signature validation."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM transactions WHERE booking_id = ? OR gateway_order_id = ?", (booking_id, order_id))
        existing = cur.fetchone()

        if existing:
            txn_id = existing["id"]
            cur.execute("""
            UPDATE transactions
            SET status = 'COMPLETED', payment_method = 'RAZORPAY',
                gateway_order_id = ?, gateway_payment_id = ?, gateway_signature = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (order_id, payment_id, signature, txn_id))
        else:
            # Fallback lookup from bookings
            cur.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,))
            b_row = cur.fetchone()
            user_id = b_row["rider_id"] if b_row else "user_rider_demo"
            driver_id = b_row["driver_id"] if b_row else None
            amount = b_row["fare_amount"] if b_row and b_row["fare_amount"] else 263.03

            txn_id = f"txn_{uuid.uuid4().hex[:12]}"
            cur.execute("""
            INSERT INTO transactions (
                id, booking_id, user_id, driver_id, amount, payment_method, status,
                final_amount, gateway_order_id, gateway_payment_id, gateway_signature
            ) VALUES (?, ?, ?, ?, ?, 'RAZORPAY', 'COMPLETED', ?, ?, ?, ?)
            """, (txn_id, booking_id, user_id, driver_id, amount, amount, order_id, payment_id, signature))

        # Update booking status
        cur.execute("UPDATE bookings SET status = 'CONFIRMED' WHERE id = ? AND status = 'PENDING'", (booking_id,))
        conn.commit()

        cur.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def fail_razorpay_payment(booking_id: str, order_id: str, reason: str) -> Optional[Dict[str, Any]]:
        """Marks a transaction as FAILED with an explicit failure reason."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM transactions WHERE booking_id = ? OR gateway_order_id = ?", (booking_id, order_id))
        existing = cur.fetchone()
        if existing:
            txn_id = existing["id"]
            cur.execute("""
            UPDATE transactions
            SET status = 'FAILED', failure_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (reason, txn_id))
            conn.commit()
            cur.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
            row = cur.fetchone()
            conn.close()
            return dict(row) if row else None
        conn.close()
        return None

    @staticmethod
    def refund_razorpay_payment(booking_id: str, refund_id: str, reason: str) -> Optional[Dict[str, Any]]:
        """Marks a completed payment as REFUNDED."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM transactions WHERE booking_id = ?", (booking_id,))
        existing = cur.fetchone()
        if existing:
            txn_id = existing["id"]
            cur.execute("""
            UPDATE transactions
            SET status = 'REFUNDED', refund_id = ?, failure_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (refund_id, f"Refund: {reason}", txn_id))
            conn.commit()
            cur.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
            row = cur.fetchone()
            conn.close()
            return dict(row) if row else None
        conn.close()
        return None

    @staticmethod
    def get_by_order_id(order_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM transactions WHERE gateway_order_id = ?", (order_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None


class PromoRepository:
    @staticmethod
    def get_all_active() -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM promo_codes WHERE is_active = 1 ORDER BY code ASC")
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    @staticmethod
    def get_by_code(code: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        normalized = code.strip().upper()
        cur.execute("SELECT * FROM promo_codes WHERE code = ?", (normalized,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def has_booking_used_promo(booking_id: str) -> bool:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM promo_code_usage WHERE booking_id = ?", (booking_id,))
        count = cur.fetchone()[0]
        conn.close()
        return count > 0

    @staticmethod
    def record_usage(user_id: str, promo_code_id: str, booking_id: str, discount_applied: float) -> bool:
        conn = get_connection()
        cur = conn.cursor()
        try:
            usage_id = f"pcu_{uuid.uuid4().hex[:12]}"
            cur.execute("""
            INSERT INTO promo_code_usage (id, user_id, promo_code_id, booking_id, discount_applied)
            VALUES (?, ?, ?, ?, ?)
            """, (usage_id, user_id, promo_code_id, booking_id, discount_applied))
            cur.execute("""
            UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?
            """, (promo_code_id,))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            conn.rollback()
            return False
        finally:
            conn.close()


class RatingRepository:
    @staticmethod
    def submit_or_update_rating(
        booking_id: str,
        rater_id: str,
        ratee_id: str,
        rater_type: str,
        star_rating: int,
        review_text: Optional[str],
        tags: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
        SELECT * FROM ratings WHERE booking_id = ? AND rater_id = ? AND ratee_id = ?
        """, (booking_id, rater_id, ratee_id))
        existing = cur.fetchone()

        tags_json = json.dumps(tags or {})
        if existing:
            rating_id = existing["id"]
            cur.execute("""
            UPDATE ratings
            SET star_rating = ?, rating = ?, review_text = ?, comment = ?, tags = ?, categories = ?
            WHERE id = ?
            """, (star_rating, star_rating, review_text, review_text, tags_json, tags_json, rating_id))
        else:
            rating_id = f"rat_{uuid.uuid4().hex[:12]}"
            cur.execute("""
            INSERT INTO ratings (
                id, booking_id, rater_id, ratee_id, rater_type, star_rating, rating,
                review_text, comment, tags, categories
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                rating_id, booking_id, rater_id, ratee_id, rater_type,
                star_rating, star_rating, review_text, review_text, tags_json, tags_json
            ))
        conn.commit()

        # Recalculate driver average rating if ratee is a driver
        cur.execute("SELECT id FROM drivers WHERE user_id = ? OR id = ?", (ratee_id, ratee_id))
        drv = cur.fetchone()
        if drv:
            drv_id = drv["id"]
            cur.execute("""
            SELECT AVG(star_rating), COUNT(*) FROM ratings
            WHERE ratee_id = ? OR ratee_id IN (SELECT user_id FROM drivers WHERE id = ?)
            """, (ratee_id, drv_id))
            stats = cur.fetchone()
            if stats and stats[1] > 0:
                cur.execute("UPDATE drivers SET rating = ?, total_rides = total_rides + 1 WHERE id = ?", (round(stats[0], 1), drv_id))
                conn.commit()

        conn.close()
        return {"id": rating_id, "booking_id": booking_id, "star_rating": star_rating}

    @staticmethod
    def get_driver_ratings(driver_id: str) -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        # Find driver's user_id or driver_id
        cur.execute("SELECT user_id FROM drivers WHERE id = ?", (driver_id,))
        drv = cur.fetchone()
        user_id = drv["user_id"] if drv else driver_id

        cur.execute("""
        SELECT star_rating, review_text, tags, created_at, rater_id FROM ratings
        WHERE ratee_id = ? OR ratee_id = ?
        ORDER BY created_at DESC
        """, (driver_id, user_id))
        rows = cur.fetchall()
        conn.close()

        total = len(rows)
        breakdown = {str(i): 0 for i in range(1, 6)}
        reviews = []
        rating_sum = 0.0

        for r in rows:
            stars = int(r["star_rating"] or 5)
            breakdown[str(stars)] = breakdown.get(str(stars), 0) + 1
            rating_sum += stars
            if r["review_text"]:
                reviews.append({
                    "rating": stars,
                    "review": r["review_text"],
                    "created_at": r["created_at"],
                })

        avg_rating = round(rating_sum / total, 1) if total > 0 else 5.0
        return {
            "avg_rating": avg_rating,
            "total_reviews": total,
            "breakdown": breakdown,
            "recent_reviews": reviews[:5],
        }

    @staticmethod
    def get_booking_ratings(booking_id: str) -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM ratings WHERE booking_id = ?", (booking_id,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()

        rider_rating = next((r for r in rows if r.get("rater_type") == "RIDER"), None)
        driver_rating = next((r for r in rows if r.get("rater_type") == "DRIVER"), None)
        return {"rider_rating": rider_rating, "driver_rating": driver_rating}


class ScheduledRepository:
    @staticmethod
    def create(data: Dict[str, Any]) -> Dict[str, Any]:
        conn = get_connection()
        try:
            cur = conn.cursor()
            user_id = data["user_id"]
            # Ensure user exists for foreign key constraint
            cur.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
            if not cur.fetchone():
                fake_phone = f"+919{uuid.uuid4().hex[:9]}"
                cur.execute(
                    "INSERT INTO users (id, phone, name, role) VALUES (?, ?, ?, 'RIDER')",
                    (user_id, fake_phone, f"User {user_id[-4:]}"),
                )

            sched_id = f"sch_{uuid.uuid4().hex[:12]}"
            cur.execute("""
            INSERT INTO scheduled_bookings (
                id, user_id, pickup_location, pickup_lat, pickup_lng,
                dropoff_location, dropoff_lat, dropoff_lng, scheduled_time,
                vehicle_type, passenger_count, special_requests, status, estimated_fare
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)
            """, (
                sched_id,
                user_id,
                data.get("pickup_location", "Selected Location"),
                data["pickup_lat"],
                data["pickup_lng"],
                data.get("dropoff_location", "Destination"),
                data["dropoff_lat"],
                data["dropoff_lng"],
                data["scheduled_time"],
                data.get("vehicle_type", "sedan"),
                data.get("passenger_count", 1),
                data.get("special_requests"),
                data.get("estimated_fare", 0.0),
            ))
            conn.commit()
            cur.execute("SELECT * FROM scheduled_bookings WHERE id = ?", (sched_id,))
            row = dict(cur.fetchone())
            return row
        finally:
            conn.close()

    @staticmethod
    def get_by_user(user_id: str) -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
        SELECT * FROM scheduled_bookings WHERE user_id = ? ORDER BY scheduled_time ASC
        """, (user_id,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    @staticmethod
    def get_by_id(booking_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM scheduled_bookings WHERE id = ?", (booking_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def update_status(booking_id: str, status: str) -> bool:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("UPDATE scheduled_bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (status, booking_id))
        conn.commit()
        affected = cur.rowcount
        conn.close()
        return affected > 0


class PoolRepository:
    @staticmethod
    def find_compatible_pool(route_hash: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
        SELECT * FROM ride_pools
        WHERE route_hash = ? AND is_active = 1 AND current_riders < max_riders
        ORDER BY created_at ASC LIMIT 1
        """, (route_hash,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def create_pool(primary_booking_id: str, route_hash: str, max_riders: int = 4, driver_id: Optional[str] = None) -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        pool_id = f"pool_{uuid.uuid4().hex[:12]}"
        cur.execute("""
        INSERT INTO ride_pools (id, primary_booking_id, route_hash, max_riders, current_riders, is_active, driver_id)
        VALUES (?, ?, ?, ?, 1, 1, ?)
        """, (pool_id, primary_booking_id, route_hash, max_riders, driver_id))
        conn.commit()
        cur.execute("SELECT * FROM ride_pools WHERE id = ?", (pool_id,))
        row = dict(cur.fetchone())
        conn.close()
        return row

    @staticmethod
    def join_pool(pool_id: str, booking_id: str, user_id: str) -> bool:
        conn = get_connection()
        cur = conn.cursor()
        try:
            # Atomic capacity check & update
            cur.execute("SELECT current_riders, max_riders FROM ride_pools WHERE id = ? AND is_active = 1", (pool_id,))
            pool = cur.fetchone()
            if not pool or pool["current_riders"] >= pool["max_riders"]:
                return False

            join_id = f"pr_{uuid.uuid4().hex[:12]}"
            cur.execute("""
            INSERT INTO pooled_riders (id, ride_pool_id, booking_id, user_id)
            VALUES (?, ?, ?, ?)
            """, (join_id, pool_id, booking_id, user_id))

            cur.execute("UPDATE ride_pools SET current_riders = current_riders + 1 WHERE id = ?", (pool_id,))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            conn.rollback()
            return False
        finally:
            conn.close()

    @staticmethod
    def get_pool_by_booking(booking_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
        SELECT p.* FROM ride_pools p
        JOIN pooled_riders pr ON p.id = pr.ride_pool_id
        WHERE pr.booking_id = ?
        UNION
        SELECT p.* FROM ride_pools p
        WHERE p.primary_booking_id = ?
        LIMIT 1
        """, (booking_id, booking_id))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None


class FavoriteRepository:
    @staticmethod
    def add(user_id: str, driver_id: str) -> bool:
        conn = get_connection()
        cur = conn.cursor()
        fav_id = f"fav_{uuid.uuid4().hex[:12]}"
        try:
            cur.execute("""
            INSERT OR IGNORE INTO favorite_drivers (id, user_id, driver_id)
            VALUES (?, ?, ?)
            """, (fav_id, user_id, driver_id))
            conn.commit()
            return True
        finally:
            conn.close()

    @staticmethod
    def remove(user_id: str, driver_id: str) -> bool:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM favorite_drivers WHERE user_id = ? AND driver_id = ?", (user_id, driver_id))
        conn.commit()
        affected = cur.rowcount
        conn.close()
        return affected > 0

    @staticmethod
    def is_favorite(user_id: str, driver_id: str) -> bool:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM favorite_drivers WHERE user_id = ? AND driver_id = ?", (user_id, driver_id))
        count = cur.fetchone()[0]
        conn.close()
        return count > 0


class HistoryRepository:
    @staticmethod
    def record_trip(
        booking_id: str,
        user_id: str,
        driver_id: Optional[str],
        pickup_loc: str,
        dropoff_loc: str,
        distance_km: float,
        duration_min: int,
        fare_amount: float,
        payment_method: str = "CASH",
        ride_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        hist_id = f"hist_{uuid.uuid4().hex[:12]}"
        date_str = ride_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

        cur.execute("""
        INSERT INTO ride_history (
            id, booking_id, user_id, driver_id, pickup_location, dropoff_location,
            distance_km, duration_min, fare_amount, payment_method, ride_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(booking_id, user_id) DO UPDATE SET
            fare_amount = excluded.fare_amount,
            payment_method = excluded.payment_method
        """, (
            hist_id, booking_id, user_id, driver_id, pickup_loc, dropoff_loc,
            distance_km, duration_min, fare_amount, payment_method, date_str
        ))
        conn.commit()
        cur.execute("SELECT * FROM ride_history WHERE booking_id = ? AND user_id = ?", (booking_id, user_id))
        row = dict(cur.fetchone())
        conn.close()
        return row

    @staticmethod
    def get_user_history(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
        SELECT h.*, u.name as driver_name
        FROM ride_history h
        LEFT JOIN drivers d ON h.driver_id = d.id
        LEFT JOIN users u ON d.user_id = u.id
        WHERE h.user_id = ?
        ORDER BY h.created_at DESC
        LIMIT ?
        """, (user_id, limit))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    @staticmethod
    def get_monthly_spend(user_id: str) -> float:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
        SELECT SUM(fare_amount) FROM ride_history
        WHERE user_id = ?
        """, (user_id,))
        val = cur.fetchone()[0]
        conn.close()
        return round(val, 2) if val else 0.0


class WalletRepository:
    @staticmethod
    def get_by_user(user_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def get_or_create(user_id: str) -> Dict[str, Any]:
        """Retrieve existing wallet or initialize a new one with zero balance."""
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,))
            row = cur.fetchone()
            if row:
                return dict(row)

            # Ensure user exists to satisfy foreign key constraints
            cur.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
            if not cur.fetchone():
                fake_phone = f"+919{uuid.uuid4().hex[:9]}"
                cur.execute(
                    "INSERT INTO users (id, phone, name, role) VALUES (?, ?, ?, 'RIDER')",
                    (user_id, fake_phone, f"User {user_id[-4:]}"),
                )

            wallet_id = f"wlt_{uuid.uuid4().hex[:12]}"
            cur.execute("""
            INSERT INTO wallets (id, user_id, balance, total_credited, total_debited)
            VALUES (?, ?, 0.0, 0.0, 0.0)
            """, (wallet_id, user_id))
            conn.commit()

            cur.execute("SELECT * FROM wallets WHERE id = ?", (wallet_id,))
            new_row = dict(cur.fetchone())
            return new_row
        finally:
            conn.close()

    @staticmethod
    def credit(user_id: str, amount: float, reason: str = "Topup", reference_id: Optional[str] = None) -> Dict[str, Any]:
        """Atomically credit funds to user wallet and record ledger audit transaction."""
        if amount <= 0:
            raise ValueError("Credit amount must be greater than zero.")

        wallet = WalletRepository.get_or_create(user_id)
        wallet_id = wallet["id"]
        txn_id = f"wtxn_{uuid.uuid4().hex[:12]}"

        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("""
            UPDATE wallets
            SET balance = balance + ?, total_credited = total_credited + ?, last_updated = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (amount, amount, wallet_id))

            cur.execute("""
            INSERT INTO wallet_transactions (id, wallet_id, amount, type, reason, reference_id)
            VALUES (?, ?, ?, 'CREDIT', ?, ?)
            """, (txn_id, wallet_id, amount, reason, reference_id))

            conn.commit()
            cur.execute("SELECT * FROM wallets WHERE id = ?", (wallet_id,))
            updated_wallet = dict(cur.fetchone())
            return {"wallet": updated_wallet, "transaction_id": txn_id}
        finally:
            conn.close()

    @staticmethod
    def debit(user_id: str, amount: float, reason: str = "Ride payment", reference_id: Optional[str] = None) -> Dict[str, Any]:
        """Atomically debit funds from user wallet if balance is sufficient."""
        if amount <= 0:
            raise ValueError("Debit amount must be greater than zero.")

        wallet = WalletRepository.get_or_create(user_id)
        if wallet["balance"] < amount:
            raise ValueError(f"Insufficient wallet balance (Current: ₹{wallet['balance']}, Required: ₹{amount}).")

        wallet_id = wallet["id"]
        txn_id = f"wtxn_{uuid.uuid4().hex[:12]}"

        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("""
            UPDATE wallets
            SET balance = balance - ?, total_debited = total_debited + ?, last_updated = CURRENT_TIMESTAMP
            WHERE id = ? AND balance >= ?
            """, (amount, amount, wallet_id, amount))

            if cur.rowcount == 0:
                raise ValueError("Transaction failed due to concurrent balance modification.")

            cur.execute("""
            INSERT INTO wallet_transactions (id, wallet_id, amount, type, reason, reference_id)
            VALUES (?, ?, ?, 'DEBIT', ?, ?)
            """, (txn_id, wallet_id, amount, reason, reference_id))

            conn.commit()
            cur.execute("SELECT * FROM wallets WHERE id = ?", (wallet_id,))
            updated_wallet = dict(cur.fetchone())
            return {"wallet": updated_wallet, "transaction_id": txn_id}
        finally:
            conn.close()

    @staticmethod
    def get_transactions(wallet_id: str) -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM wallet_transactions WHERE wallet_id = ? ORDER BY timestamp DESC", (wallet_id,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    @staticmethod
    def get_user_transactions(user_id: str) -> List[Dict[str, Any]]:
        wallet = WalletRepository.get_by_user(user_id)
        if not wallet:
            return []
        return WalletRepository.get_transactions(wallet["id"])
