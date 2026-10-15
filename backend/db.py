"""Database compatibility facade forwarding to app.core.database."""

import sys
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.database import get_connection, init_db, seed_default_routes, seed_demo_entities, DB_PATH

__all__ = [
    "get_connection",
    "init_db",
    "seed_default_routes",
    "seed_demo_entities",
    "DB_PATH",
]
