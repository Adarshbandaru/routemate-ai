# RouteMate AI — Database Backup & Disaster Recovery Runbook

**Version:** 1.0.0-phase5  
**Audience:** Site Reliability Engineers, Database Administrators, On-Call Engineers  
**Classification:** Operational Runbook  

---

## 1. Overview & Architecture

RouteMate AI utilizes SQLite 3 in WAL (Write-Ahead Logging) mode with an active busy timeout (`5000ms`) and foreign key constraints enabled.

- **Primary Database File:** `backend/routemate.db`
- **WAL Journal Artifacts:** `backend/routemate.db-wal`, `backend/routemate.db-shm`
- **Backup Directory:** `backend/backups/`
- **Retention Policy:** 14 automated point-in-time snapshots (daily automated, with automatic pruning)

Because SQLite WAL allows concurrent readers alongside writers, backups are executed online without stopping the FastAPI server or disconnecting active riders.

---

## 2. Automated & Manual Backup Execution

### Online Backup Method:
The backup utility invokes Python's native `sqlite3.backup` API, copying database pages in small increments (`pages=100`) to eliminate locking bottlenecks.

```bash
# Execute point-in-time live backup
python -m backend.scripts.backup_db
```

### Output:
```json
{
  "success": true,
  "backup_file": "routemate_backup_20261015_125656.db",
  "backup_path": "c:\\Users\\...\\backend\\backups\\routemate_backup_20261015_125656.db",
  "size_bytes": 417792,
  "integrity": "ok",
  "timestamp": "20261015_125656",
  "duration_sec": 0.024,
  "pruned_backups": 0
}
```

### Scheduled Cron Automation (Linux / Docker VM):
To run backups daily at 02:00 UTC and retain the last 14 days of snapshots:
```cron
0 2 * * * cd /app && python -m backend.scripts.backup_db --max-retained 14 >> /var/log/routemate-backup.log 2>&1
```

---

## 3. Disaster Recovery & Restoration Procedures

### Scenario A: Dry-Run Verification (Non-Destructive)
Verify the physical structure and record counts of a backup before restoring:
```bash
python -m backend.scripts.restore_db backend/backups/routemate_backup_YYYYMMDD_HHMMSS.db --dry-run
```

### Scenario B: Emergency Production Restoration
When corruption, data loss, or server failure occurs:

1. **Gracefully stop the backend service:**
   ```bash
   docker compose stop backend
   ```
2. **Execute restoration utility:**
   ```bash
   python -m backend.scripts.restore_db backend/backups/routemate_backup_YYYYMMDD_HHMMSS.db
   ```
   > **Note:** The restore script automatically generates a pre-restore safety snapshot (`routemate_pre_restore_safety_*.db`) of the existing database before performing any writes.
3. **Verify restored data integrity:**
   The utility automatically executes `PRAGMA integrity_check;` and verifies row counts across critical tables (`bookings`, `users`, `wallets`, `transactions`).
4. **Restart backend service:**
   ```bash
   docker compose start backend
   ```
5. **Verify live system health:**
   ```bash
   curl -f http://localhost:8000/v1/health
   curl -f http://localhost:8000/v1/telemetry/stats
   ```

---

## 4. Disaster Recovery Table

| Incident Severity | RPO (Recovery Point Objective) | RTO (Recovery Time Objective) | Procedure |
|---|:---:|:---:|---|
| Minor Data Inconsistency | 24 Hours | < 5 Minutes | Dry-run verify backup -> apply restore utility to staging -> patch record. |
| Database File Corruption | 24 Hours | < 2 Minutes | Run `restore_db.py` with latest verified backup -> restart container. |
| Complete VM / Host Destruction | 24 Hours | < 15 Minutes | Spin up new VM -> clone repo -> pull offsite backup -> `docker compose up -d`. |
