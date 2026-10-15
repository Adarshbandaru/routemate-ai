"""RouteMate AI — Database Backup Utility (Phase 5).

Performs safe, live online backups of the RouteMate SQLite database using the
sqlite3.backup API with integrity verification and retention pruning.
"""

import argparse
import datetime
import json
import logging
import os
from pathlib import Path
import sqlite3
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("routemate.backup")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "routemate.db"
DEFAULT_BACKUP_DIR = BACKEND_DIR / "backups"


def perform_backup(
    db_path: Path = DEFAULT_DB_PATH,
    backup_dir: Path = DEFAULT_BACKUP_DIR,
    max_retained: int = 14,
) -> dict:
    """Creates a point-in-time snapshot of the database using sqlite3.backup()."""
    if not db_path.exists():
        logger.error("Source database does not exist at %s", db_path)
        return {"success": False, "error": f"Source database not found at {db_path}"}

    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_filename = f"routemate_backup_{timestamp}.db"
    backup_path = backup_dir / backup_filename

    logger.info("Starting live online backup from %s to %s", db_path, backup_path)
    start_time = datetime.datetime.now(datetime.timezone.utc)

    try:
        # Open source in read-only mode to prevent write contention
        source_uri = f"file:{db_path.resolve()}?mode=ro"
        source_conn = sqlite3.connect(source_uri, uri=True)
        dest_conn = sqlite3.connect(str(backup_path))

        with dest_conn:
            source_conn.backup(dest_conn, pages=100)

        dest_conn.close()
        source_conn.close()

        # Run integrity check on backup
        chk_conn = sqlite3.connect(str(backup_path))
        chk_cur = chk_conn.cursor()
        chk_cur.execute("PRAGMA integrity_check;")
        check_result = chk_cur.fetchone()[0]
        chk_conn.close()

        if check_result != "ok":
            logger.error("Backup failed integrity check: %s", check_result)
            return {
                "success": False,
                "error": f"Integrity check failed: {check_result}",
                "backup_path": str(backup_path),
            }

        size_bytes = backup_path.stat().st_size
        duration_sec = round((datetime.datetime.now(datetime.timezone.utc) - start_time).total_seconds(), 3)
        logger.info("Backup successfully completed in %ss (%s bytes)", duration_sec, size_bytes)

        # Retention pruning
        pruned_count = prune_old_backups(backup_dir, max_retained)

        return {
            "success": True,
            "backup_file": backup_filename,
            "backup_path": str(backup_path),
            "size_bytes": size_bytes,
            "integrity": "ok",
            "timestamp": timestamp,
            "duration_sec": duration_sec,
            "pruned_backups": pruned_count,
        }

    except Exception as exc:
        logger.error("Backup failed with exception: %s", str(exc), exc_info=True)
        return {"success": False, "error": str(exc)}


def prune_old_backups(backup_dir: Path, max_retained: int) -> int:
    """Removes oldest backups beyond the retention limit."""
    backups = sorted(
        backup_dir.glob("routemate_backup_*.db"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    pruned = 0
    if len(backups) > max_retained:
        for old_file in backups[max_retained:]:
            try:
                old_file.unlink()
                pruned += 1
                logger.info("Pruned old backup: %s", old_file.name)
            except OSError as exc:
                logger.warning("Failed to delete old backup %s: %s", old_file.name, str(exc))
    return pruned


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RouteMate AI Database Backup Utility")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH, help="Path to database")
    parser.add_argument("--backup-dir", type=Path, default=DEFAULT_BACKUP_DIR, help="Destination directory")
    parser.add_argument("--max-retained", type=int, default=14, help="Maximum retained backups")
    args = parser.parse_args()

    result = perform_backup(args.db, args.backup_dir, args.max_retained)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)
