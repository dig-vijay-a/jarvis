# NOVA 1.0 — Rollback & Disaster Recovery Guide

## 1. Overview

This document provides definitive operational recovery procedures in the event of database corruption, faulty skill deployments, or failed upgrades.

---

## 2. Database Snapshot Rollback

NOVA maintains atomic SQLite hot snapshots in `nova/data/backups/`.

### Emergency Database Restoration Protocol:
1. **Stop all active NOVA services:**
   ```bash
   # Terminate any running supervisor or backend processes
   taskkill /F /IM node.exe
   taskkill /F /IM python.exe
   ```

2. **Inspect available backup snapshots:**
   Navigate to `nova\data\backups` and select the most recent verified backup file (e.g. `nova-backup-2026-11-22T17-44-00-000Z.sqlite`).

3. **Verify backup snapshot integrity:**
   Run an offline integrity check against the chosen backup:
   ```bash
   sqlite3 nova\data\backups\<selected_backup_filename> "PRAGMA integrity_check;"
   ```
   Ensure the output is `ok`.

4. **Replace current database:**
   ```powershell
   # Move the degraded database to archive
   Move-Item nova\data\nova.sqlite nova\data\nova.sqlite.corrupt-backup
   # Copy clean snapshot to active database location
   Copy-Item nova\data\backups\<selected_backup_filename> nova\data\nova.sqlite
   ```

5. **Restart supervisor:**
   ```bash
   node nova\backend\supervisor.js
   ```

---

## 3. Codebase / Git Rollback

If an unverified code change causes regressions:
1. Identify the last verified commit or release tag:
   ```bash
   git log --oneline -n 10
   ```
2. Roll back working tree cleanly:
   ```bash
   git checkout <verified_commit_hash>
   ```
3. Re-install dependencies if `package.json` changed:
   ```bash
   cd nova\backend && npm install
   cd ..\frontend && npm install
   ```

---

## 4. Emergency Subsystem Bypass (Safe Mode)

If a specialized agent or registered skill causes repetitive crashes:
1. Set emergency stop in database:
   ```bash
   sqlite3 nova\data\nova.sqlite "UPDATE settings SET value = 'true' WHERE key = 'emergency_stop';"
   ```
2. Disable faulty dynamic skills:
   ```bash
   sqlite3 nova\data\nova.sqlite "UPDATE agent_skills SET is_enabled = 0 WHERE skill_key = '<faulty_skill>';"
   ```
3. Restart supervisor. NOVA will boot into strict Safe Mode with standard reflex tools only.
