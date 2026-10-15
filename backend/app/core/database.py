"""Database connection and initialization module for RouteMate AI."""

import json
import sqlite3
from typing import Optional
from .config import DB_PATH


def get_connection(db_file: Optional[str] = None) -> sqlite3.Connection:
    target_path = str(db_file or DB_PATH)
    conn = sqlite3.connect(target_path, check_same_thread=False, timeout=10.0)
    conn.row_factory = sqlite3.Row
    # Configure production SQLite busy timeout and foreign key constraints
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(db_file: Optional[str] = None):
    conn = get_connection(db_file)
    cur = conn.cursor()

    # Enable WAL mode persistently in database header
    cur.execute("PRAGMA journal_mode = WAL;")

    # Users & Auth
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        name TEXT,
        photo_url TEXT,
        role TEXT DEFAULT 'RIDER', -- 'RIDER', 'DRIVER', 'ADMIN'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_addresses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        label TEXT, -- 'home', 'work', 'other'
        lat REAL,
        lng REAL,
        address_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)

    # Drivers
    cur.execute("""
    CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        license_number TEXT UNIQUE,
        vehicle_id TEXT,
        rating REAL DEFAULT 5.0,
        total_rides INTEGER DEFAULT 0,
        total_earnings REAL DEFAULT 0,
        available INTEGER DEFAULT 1,
        latitude REAL,
        longitude REAL,
        heading INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)

    # Vehicles
    cur.execute("""
    CREATE TABLE IF NOT EXISTS vehicles (
        id TEXT PRIMARY KEY,
        driver_id TEXT NOT NULL,
        type TEXT DEFAULT 'SEDAN', -- 'SEDAN', 'BIKE', 'AUTO', 'TEMPO'
        color TEXT,
        plate_number TEXT UNIQUE,
        capacity INTEGER DEFAULT 4,
        registration_number TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Bookings
    cur.execute("""
    CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        booking_number TEXT UNIQUE NOT NULL,
        rider_id TEXT NOT NULL,
        driver_id TEXT,
        pickup_lat REAL NOT NULL,
        pickup_lng REAL NOT NULL,
        pickup_address TEXT,
        dropoff_lat REAL NOT NULL,
        dropoff_lng REAL NOT NULL,
        dropoff_address TEXT,
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scheduled_for TIMESTAMP,
        pickup_at TIMESTAMP,
        dropoff_at TIMESTAMP,
        distance_km REAL,
        duration_sec INTEGER,
        seats INTEGER DEFAULT 1,
        base_fare REAL,
        distance_fare REAL,
        time_fare REAL,
        surge_multiplier REAL DEFAULT 1.0,
        total_fare REAL,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'REQUESTED',
        notes TEXT,
        is_shared INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(rider_id) REFERENCES users(id),
        FOREIGN KEY(driver_id) REFERENCES drivers(id)
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS booking_routes (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        polyline TEXT, -- JSON array of [lat, lng]
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(booking_id) REFERENCES bookings(id)
    );
    """)

    # Transactions & Wallets
    cur.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'INR',
        method TEXT DEFAULT 'UPI', -- 'CARD', 'UPI', 'WALLET', 'CASH'
        status TEXT DEFAULT 'SUCCESSFUL', -- 'PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'
        payment_gateway_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(booking_id) REFERENCES bookings(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS ratings (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        rater_id TEXT NOT NULL,
        ratee_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        categories TEXT, -- JSON string
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        recipient_id TEXT,
        content TEXT NOT NULL,
        is_automated INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Default Punjab Routes & Favorites
    cur.execute("""
    CREATE TABLE IF NOT EXISTS default_routes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL, -- 'commute', 'long_distance', 'local', 'airport', 'business'
        group_key TEXT NOT NULL, -- 'lpu', 'jalandhar', 'ludhiana'
        pickup_name TEXT NOT NULL,
        pickup_address TEXT NOT NULL,
        pickup_lat REAL NOT NULL,
        pickup_lng REAL NOT NULL,
        dropoff_name TEXT NOT NULL,
        dropoff_address TEXT NOT NULL,
        dropoff_lat REAL NOT NULL,
        dropoff_lng REAL NOT NULL,
        distance_km REAL NOT NULL,
        duration_min INTEGER NOT NULL,
        avg_fare INTEGER NOT NULL,
        frequency TEXT DEFAULT 'frequent',
        icon TEXT,
        polyline TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_favorite_routes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        default_route_id TEXT,
        custom_pickup_lat REAL,
        custom_pickup_lng REAL,
        custom_dropoff_lat REAL,
        custom_dropoff_lng REAL,
        saved_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)

    # Phase 2: Driver Sessions & Real-Time Tracking Tables
    cur.execute("""
    CREATE TABLE IF NOT EXISTS driver_sessions (
        id TEXT PRIMARY KEY,
        driver_id TEXT NOT NULL,
        status TEXT DEFAULT 'OFFLINE', -- 'ONLINE', 'OFFLINE', 'ON_TRIP'
        latitude REAL,
        longitude REAL,
        heading INTEGER DEFAULT 0,
        vehicle_battery INTEGER DEFAULT 100,
        active_booking_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
        FOREIGN KEY(active_booking_id) REFERENCES bookings(id)
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS driver_location_history (
        id TEXT PRIMARY KEY,
        driver_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        heading INTEGER DEFAULT 0,
        speed_kmh INTEGER DEFAULT 0,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS booking_driver_requests (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        driver_id TEXT NOT NULL,
        status TEXT DEFAULT 'SENT', -- 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP,
        response_duration_sec INTEGER,
        FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE
    );
    """)

    # Indexes (Driver sessions & requests)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_driver_sessions_status ON driver_sessions(status);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_driver_sessions_driver_id ON driver_sessions(driver_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_driver_location_history_driver_id ON driver_location_history(driver_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_booking_driver_requests_booking_id ON booking_driver_requests(booking_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_booking_driver_requests_driver_id ON booking_driver_requests(driver_id);")

    # -----------------------------------------------------------------
    # Phase 3: Advanced Features Tables
    # -----------------------------------------------------------------
    # 1. Wallets
    cur.execute("""
    CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        balance REAL NOT NULL DEFAULT 0,
        total_credited REAL NOT NULL DEFAULT 0,
        total_debited REAL NOT NULL DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 2. Wallet Transactions (Reserved for future Phase 3.5/4 real wallets)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL, -- 'CREDIT', 'DEBIT'
        reason TEXT,
        reference_id TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );
    """)

    # 3. Ride History
    cur.execute("""
    CREATE TABLE IF NOT EXISTS ride_history (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        driver_id TEXT,
        pickup_location TEXT,
        dropoff_location TEXT,
        distance_km REAL,
        duration_min INTEGER,
        fare_amount REAL,
        payment_method TEXT DEFAULT 'CASH',
        ride_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(booking_id) REFERENCES bookings(id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(driver_id) REFERENCES drivers(id),
        UNIQUE (booking_id, user_id)
    );
    """)

    # 4. Promo Codes
    cur.execute("""
    CREATE TABLE IF NOT EXISTS promo_codes (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        discount_type TEXT NOT NULL, -- 'FLAT', 'PERCENTAGE'
        discount_value REAL NOT NULL,
        max_discount REAL,
        min_ride_amount REAL NOT NULL DEFAULT 0,
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        max_uses INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
    );
    """)

    # 5. Promo Code Usage
    cur.execute("""
    CREATE TABLE IF NOT EXISTS promo_code_usage (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        promo_code_id TEXT NOT NULL,
        booking_id TEXT NOT NULL,
        discount_applied REAL NOT NULL,
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(promo_code_id) REFERENCES promo_codes(id),
        FOREIGN KEY(booking_id) REFERENCES bookings(id),
        UNIQUE (promo_code_id, booking_id)
    );
    """)

    # 6. Scheduled Bookings
    cur.execute("""
    CREATE TABLE IF NOT EXISTS scheduled_bookings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        pickup_location TEXT NOT NULL,
        pickup_lat REAL NOT NULL,
        pickup_lng REAL NOT NULL,
        dropoff_location TEXT NOT NULL,
        dropoff_lat REAL NOT NULL,
        dropoff_lng REAL NOT NULL,
        scheduled_time TIMESTAMP NOT NULL,
        vehicle_type TEXT DEFAULT 'sedan',
        passenger_count INTEGER NOT NULL DEFAULT 1,
        special_requests TEXT,
        status TEXT NOT NULL DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'
        estimated_fare REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)

    # 7. Ride Pools
    cur.execute("""
    CREATE TABLE IF NOT EXISTS ride_pools (
        id TEXT PRIMARY KEY,
        primary_booking_id TEXT NOT NULL,
        route_hash TEXT NOT NULL,
        max_riders INTEGER NOT NULL DEFAULT 4,
        current_riders INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        driver_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(primary_booking_id) REFERENCES bookings(id),
        FOREIGN KEY(driver_id) REFERENCES drivers(id),
        CHECK (max_riders >= 1),
        CHECK (current_riders >= 1),
        CHECK (current_riders <= max_riders)
    );
    """)

    # 8. Pooled Riders
    cur.execute("""
    CREATE TABLE IF NOT EXISTS pooled_riders (
        id TEXT PRIMARY KEY,
        ride_pool_id TEXT NOT NULL,
        booking_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(ride_pool_id) REFERENCES ride_pools(id),
        FOREIGN KEY(booking_id) REFERENCES bookings(id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE (ride_pool_id, booking_id)
    );
    """)

    # 9. Favorite Drivers
    cur.execute("""
    CREATE TABLE IF NOT EXISTS favorite_drivers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        driver_id TEXT NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
        UNIQUE (user_id, driver_id)
    );
    """)

    # Run schema column migrations for pre-existing tables
    _run_migrations(cur)

    # Required Phase 3 Indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_transactions_driver_id ON transactions(driver_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ratings_booking_id ON ratings(booking_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ratings_rater_id ON ratings(rater_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ratings_ratee_id ON ratings(ratee_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_promo_code_usage_user_id ON promo_code_usage(user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_user_id ON scheduled_bookings(user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_status ON scheduled_bookings(status);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ride_pools_route_hash ON ride_pools(route_hash);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pooled_riders_ride_pool_id ON pooled_riders(ride_pool_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_favorite_drivers_user_id ON favorite_drivers(user_id);")

    # Seed Default Punjab Routes if empty
    cur.execute("SELECT COUNT(*) FROM default_routes")
    if cur.fetchone()[0] == 0:
        seed_default_routes(conn)

    # Seed initial test demo user & driver (idempotent with INSERT OR IGNORE)
    seed_demo_entities(conn)

    # Seed Promo Codes
    cur.execute("SELECT COUNT(*) FROM promo_codes")
    if cur.fetchone()[0] == 0:
        seed_promo_codes(conn)

    conn.commit()
    conn.close()


def seed_default_routes(conn: sqlite3.Connection):
    cur = conn.cursor()
    routes = [
        (
            "route_lpu_001",
            "Jalandhar Stn ↔ LPU Campus",
            "commute",
            "lpu",
            "Jalandhar Railway Station",
            "Jalandhar Railway Station, Jalandhar, Punjab",
            31.3260,
            75.5762,
            "LPU Campus Main Gate",
            "Lovely Professional University, NH-44, Phagwara, Punjab",
            31.2536,
            75.7037,
            21.4,
            24,
            320,
            "daily",
            "train-to-university",
            json.dumps([[31.3260, 75.5762], [31.2950, 75.6320], [31.2536, 75.7037]]),
        ),
        (
            "route_lpu_002",
            "LPU Campus → Ludhiana Stn",
            "long_distance",
            "lpu",
            "LPU Campus Main Gate",
            "Lovely Professional University, NH-44, Phagwara, Punjab",
            31.2536,
            75.7037,
            "Ludhiana Railway Station",
            "Ludhiana Railway Station, Ludhiana, Punjab",
            30.9010,
            75.8573,
            42.5,
            45,
            480,
            "frequent",
            "university-to-station",
            json.dumps([[31.2536, 75.7037], [31.2230, 75.7710], [30.9010, 75.8573]]),
        ),
        (
            "route_lpu_003",
            "Phagwara Bus Stand → LPU",
            "short",
            "lpu",
            "Phagwara Bus Stand",
            "Phagwara Interstate Bus Stand, GT Road, Phagwara, Punjab",
            31.2230,
            75.7710,
            "LPU Campus Law Gate",
            "Lovely Professional University Law Gate, Phagwara, Punjab",
            31.2536,
            75.7037,
            7.8,
            12,
            120,
            "hourly",
            "bus-to-university",
            json.dumps([[31.2230, 75.7710], [31.2400, 75.7350], [31.2536, 75.7037]]),
        ),
        (
            "route_jal_001",
            "Jalandhar City Center ↔ Phagwara",
            "commute",
            "jalandhar",
            "Jalandhar City Center",
            "BMC Chowk / Model Town, Jalandhar, Punjab",
            31.3150,
            75.5800,
            "Phagwara Sugar Mill Chowk",
            "Sugar Mill Crossing, GT Road, Phagwara, Punjab",
            31.2230,
            75.7710,
            24.2,
            28,
            380,
            "frequent",
            "city-to-hub",
            json.dumps([[31.3150, 75.5800], [31.2950, 75.6320], [31.2230, 75.7710]]),
        ),
        (
            "route_jal_002",
            "Jalandhar Stn → Bus Stand",
            "local",
            "jalandhar",
            "Jalandhar Railway Station",
            "Jalandhar Railway Station, Jalandhar, Punjab",
            31.3260,
            75.5762,
            "Jalandhar Interstate Bus Terminal",
            "ISBT Jalandhar, Punjab",
            31.3180,
            75.5850,
            2.4,
            8,
            60,
            "very_frequent",
            "station-to-bus",
            json.dumps([[31.3260, 75.5762], [31.3180, 75.5850]]),
        ),
        (
            "route_jal_003",
            "Adampur Airport → Jalandhar City",
            "airport",
            "jalandhar",
            "Adampur Airport (AIP)",
            "Adampur Air Force Station & Civil Terminal, Jalandhar, Punjab",
            31.4330,
            75.7580,
            "Jalandhar City Center",
            "BMC Chowk, Jalandhar, Punjab",
            31.3150,
            75.5800,
            23.5,
            32,
            450,
            "occasional",
            "airport-to-city",
            json.dumps([[31.4330, 75.7580], [31.3600, 75.6700], [31.3150, 75.5800]]),
        ),
        (
            "route_lud_001",
            "Ludhiana Focal Point → Phagwara",
            "business",
            "ludhiana",
            "Ludhiana Focal Point",
            "Focal Point Phase V, Ludhiana, Punjab",
            30.8850,
            75.9120,
            "Phagwara Hub",
            "Phagwara Industrial Area, GT Road, Punjab",
            31.2230,
            75.7710,
            46.0,
            48,
            550,
            "daily",
            "industry-to-hub",
            json.dumps([[30.8850, 75.9120], [30.9010, 75.8573], [31.2230, 75.7710]]),
        ),
        (
            "route_lud_002",
            "Ludhiana Stn ↔ Clock Tower",
            "local",
            "ludhiana",
            "Ludhiana Railway Station",
            "Ludhiana Railway Station, Ludhiana, Punjab",
            30.9010,
            75.8573,
            "Ludhiana Clock Tower",
            "Ghanta Ghar, Ludhiana, Punjab",
            30.9120,
            75.8450,
            3.0,
            10,
            80,
            "very_frequent",
            "station-to-city",
            json.dumps([[30.9010, 75.8573], [30.9120, 75.8450]]),
        ),
        (
            "route_lud_003",
            "Ludhiana → Amritsar Golden Temple",
            "long_distance",
            "ludhiana",
            "Ludhiana Station",
            "Ludhiana Railway Station, Ludhiana, Punjab",
            30.9010,
            75.8573,
            "Amritsar Golden Temple Corridor",
            "Golden Temple Road, Amritsar, Punjab",
            31.6200,
            74.8765,
            140.0,
            135,
            1850,
            "occasional",
            "highway",
            json.dumps([[30.9010, 75.8573], [31.2536, 75.7037], [31.3260, 75.5762], [31.6200, 74.8765]]),
        ),
    ]

    cur.executemany("""
    INSERT INTO default_routes (
        id, name, category, group_key,
        pickup_name, pickup_address, pickup_lat, pickup_lng,
        dropoff_name, dropoff_address, dropoff_lat, dropoff_lng,
        distance_km, duration_min, avg_fare, frequency, icon, polyline
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, routes)


def seed_demo_entities(conn: sqlite3.Connection):
    cur = conn.cursor()
    rider_id = "user_rider_demo"
    cur.execute("""
    INSERT OR IGNORE INTO users (id, phone, email, name, role)
    VALUES (?, ?, ?, ?, ?)
    """, (rider_id, "+91 98765 43210", "rider@routemate.ai", "Adarsh Bandaru", "RIDER"))

    cur.execute("""
    INSERT OR IGNORE INTO user_addresses (id, user_id, label, lat, lng, address_text)
    VALUES (?, ?, ?, ?, ?, ?)
    """, ("addr_home", rider_id, "Home", 31.3260, 75.5762, "Jalandhar City Center"))

    cur.execute("""
    INSERT OR IGNORE INTO user_addresses (id, user_id, label, lat, lng, address_text)
    VALUES (?, ?, ?, ?, ?, ?)
    """, ("addr_work", rider_id, "Campus", 31.2536, 75.7037, "Lovely Professional University"))

    driver_user_id = "user_driver_priya"
    cur.execute("""
    INSERT OR IGNORE INTO users (id, phone, email, name, role)
    VALUES (?, ?, ?, ?, ?)
    """, (driver_user_id, "+91 98123 45678", "priya@routemate.ai", "Priya Sharma", "DRIVER"))

    driver_id = "drv_priya"
    vehicle_id = "veh_priya"
    cur.execute("""
    INSERT OR IGNORE INTO vehicles (id, driver_id, type, color, plate_number, capacity)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (vehicle_id, driver_id, "SEDAN", "Glacier White", "PB 08 BG 1290", 4))

    cur.execute("""
    INSERT OR IGNORE INTO drivers (id, user_id, license_number, vehicle_id, rating, total_rides, available, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (driver_id, driver_user_id, "PB-08-2022-00451", vehicle_id, 4.9, 312, 1, 31.3190, 75.5890))


def _run_migrations(cur: sqlite3.Cursor):
    """Run non-destructive column migrations for existing SQLite tables."""
    # 1. Transactions columns
    cur.execute("PRAGMA table_info(transactions);")
    existing_txn_cols = {row[1] for row in cur.fetchall()}
    txn_cols_to_add = [
        ("driver_id", "TEXT"),
        ("payment_method", "TEXT NOT NULL DEFAULT 'CASH'"),
        ("base_fare", "REAL NOT NULL DEFAULT 0"),
        ("distance_fare", "REAL NOT NULL DEFAULT 0"),
        ("time_fare", "REAL NOT NULL DEFAULT 0"),
        ("wait_fare", "REAL NOT NULL DEFAULT 0"),
        ("surge_multiplier", "REAL NOT NULL DEFAULT 1.0"),
        ("discount_amount", "REAL NOT NULL DEFAULT 0"),
        ("tax", "REAL NOT NULL DEFAULT 0"),
        ("final_amount", "REAL NOT NULL DEFAULT 0"),
        ("gateway_order_id", "TEXT"),
        ("gateway_payment_id", "TEXT"),
        ("gateway_signature", "TEXT"),
        ("refund_id", "TEXT"),
        ("failure_reason", "TEXT"),
        ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
    ]
    for col_name, col_def in txn_cols_to_add:
        if col_name not in existing_txn_cols:
            try:
                cur.execute(f"ALTER TABLE transactions ADD COLUMN {col_name} {col_def};")
            except sqlite3.OperationalError:
                pass

    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_transactions_gateway_order_id ON transactions(gateway_order_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_transactions_gateway_payment_id ON transactions(gateway_payment_id);")
    except sqlite3.OperationalError:
        pass

    # 2. Ratings columns
    cur.execute("PRAGMA table_info(ratings);")
    existing_rating_cols = {row[1] for row in cur.fetchall()}
    rating_cols_to_add = [
        ("rater_type", "TEXT NOT NULL DEFAULT 'RIDER'"),
        ("star_rating", "INTEGER NOT NULL DEFAULT 5"),
        ("review_text", "TEXT"),
        ("tags", "TEXT"),
        ("helpful_count", "INTEGER NOT NULL DEFAULT 0"),
    ]
    for col_name, col_def in rating_cols_to_add:
        if col_name not in existing_rating_cols:
            try:
                cur.execute(f"ALTER TABLE ratings ADD COLUMN {col_name} {col_def};")
            except sqlite3.OperationalError:
                pass

    # Unique index for ratings (one rating per eligible rater/ratee/booking)
    try:
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_unique_triple ON ratings(booking_id, rater_id, ratee_id);")
    except sqlite3.OperationalError:
        pass


def seed_promo_codes(conn: sqlite3.Connection):
    """Seed default active promo codes for the Punjab mobility service."""
    cur = conn.cursor()
    promos = [
        ("promo_welcome50", "WELCOME50", "FLAT", 50.0, None, 100.0, "2024-01-01 00:00:00", "2030-12-31 23:59:59", 1000, 0, 1),
        ("promo_summer20", "SUMMER20", "PERCENTAGE", 20.0, 200.0, 150.0, "2024-01-01 00:00:00", "2030-12-31 23:59:59", 500, 0, 1),
        ("promo_punjab10", "PUNJAB10", "PERCENTAGE", 10.0, 100.0, 80.0, "2024-01-01 00:00:00", "2030-12-31 23:59:59", 2000, 0, 1),
    ]
    cur.executemany("""
    INSERT OR IGNORE INTO promo_codes (
        id, code, discount_type, discount_value, max_discount, min_ride_amount,
        valid_from, valid_until, max_uses, used_count, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, promos)

