"""RouteMate AI — Database Restore Utility (Phase 5).

Safely restores a point-in-time database backup with pre-flight integrity
checking, automated pre-restore safety snapshots, and post-restore verification.
"""

import argparse
import datetime
import json
import logging
from pathlib import Path
import sqlite3
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("routemate.restore")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "routemate.db"
DEFAULT_BACKUP_DIR = BACKEND_DIR / "backups"


def perform_restore(
    backup_file: Path,
    target_db_path: Path = DEFAULT_DB_PATH,
    dry_run: bool = False,
) -> dict:
    """Restores database from a verified backup file."""
    if not backup_file.exists():
        logger.error("Backup file does not exist at %s", backup_file)
        return {"success": False, "error": f"Backup file not found at {backup_file}"}

    # Step 1: Verify source backup integrity
    try:
        chk_conn = sqlite3.connect(f"file:{backup_file.resolve()}?mode=ro", uri=True)
        chk_cur = chk_conn.cursor()
        chk_cur.execute("PRAGMA integrity_check;")
        check_result = chk_cur.fetchone()[0]
        chk_cur.execute("SELECT COUNT(*) FROM bookings")
        bookings_count = chk_cur.fetchone()[0]
        chk_conn.close()

        if check_result != "ok":
            logger.error("Source backup file failed integrity check: %s", check_result)
            return {"success": False, "error": f"Corrupted backup: {check_result}"}
    except Exception as exc:
        logger.error("Failed to inspect backup file: %s", str(exc))
        return {"success": False, "error": f"Failed inspecting backup: {str(exc)}"}

    if dry_run:
        logger.info("Dry-run restore verification passed for %s", backup_file)
        return {
            "success": True,
            "dry_run": True,
            "backup_file": str(backup_file),
            "integrity": "ok",
            "verified_bookings": bookings_count,
            "target_path": str(target_db_path),
        }

    # Step 2: Create pre-restore safety snapshot of the active target database if it exists
    safety_snapshot_path = None
    if target_db_path.exists():
        safety_ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
        safety_snapshot_path = target_db_path.parent / f"routemate_pre_restore_safety_{safety_ts}.db"
        try:
            logger.info("Creating safety snapshot of current database at %s", safety_snapshot_path)
            s_conn = sqlite3.connect(f"file:{target_db_path.resolve()}?mode=ro", uri=True)
            d_conn = sqlite3.connect(str(safety_snapshot_path))
            with d_conn:
                s_conn.backup(d_conn)
            d_conn.close()
            s_conn.close()
        except Exception as exc:
            logger.warning("Could not create pre-restore snapshot: %s", str(exc))

    # Step 3: Perform live restore into target database
    try:
        logger.info("Executing restore from %s to %s", backup_file, target_db_path)
        source_conn = sqlite3.connect(f"file:{backup_file.resolve()}?mode=ro", uri=True)
        dest_conn = sqlite3.connect(str(target_db_path))

        with dest_conn:
            source_conn.backup(dest_conn)

        dest_conn.close()
        source_conn.close()

        # Step 4: Post-restore verification
        verify_conn = sqlite3.connect(str(target_db_path))
        verify_cur = verify_conn.cursor()
        verify_cur.execute("PRAGMA integrity_check;")
        verify_status = verify_cur.fetchone()[0]
        verify_cur.execute("SELECT COUNT(*) FROM bookings")
        restored_bookings = verify_cur.fetchone()[0]
        verify_conn.close()

        if verify_status != "ok":
            logger.critical("Restored database failed integrity check!")
            return {"success": False, "error": f"Restored DB failed integrity: {verify_status}"}

        logger.info("Database successfully restored! Total bookings verified: %d", restored_bookings)
        return {
            "success": True,
            "restored_from": str(backup_file),
            "target_db": str(target_db_path),
            "integrity": "ok",
            "restored_bookings": restored_bookings,
            "safety_snapshot": str(safety_snapshot_path) if safety_snapshot_path else None,
        }

    except Exception as exc:
        logger.error("Restore failed: %s", str(exc), exc_info=True)
        return {"success": False, "error": str(exc)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RouteMate AI Database Restore Utility")
    parser.add_argument("backup_file", type=Path, help="Path to backup .db file to restore from")
    parser.add_argument("--target-db", type=Path, default=DEFAULT_DB_PATH, help="Destination database path")
    parser.add_argument("--dry-run", action="store_true", help="Perform integrity check without overwriting")
    args = parser.parse_args()

    result = perform_restore(args.backup_file, args.target_db, args.dry_run)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)
