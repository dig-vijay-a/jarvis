# JARVIS OS 2.0 — PROJECT SENTINEL (STAGE 3)
# SQLITE DATABASE STRESS REPORT

**Generated:** 2026-11-25T06:39:05.841Z  
**Subsystem:** Group 3: Concurrency, BEGIN IMMEDIATE Lock, Busy Exhaustion, Rollback & WAL Checkpoints  
**Summary:** `7 PASS` | `0 FAIL` | `0 PARTIALLY_VERIFIED` | `0 NOT_TESTED` (Total: 7)  

---

## Scenario Execution & Postcondition Audit

| ID | Scenario | Operations | Observed Postconditions | Latency / Duration | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DB-01` | Concurrent SQLite reads and writes | Execute 50 concurrent SELECT queries alongside 30 concurrent INSERT memory writes under WAL mode. | 80 concurrent ops finished; 30/30 rows persisted; integrity=ok. | 18ms | **`PASS`** |
| `DB-02` | Multiple BEGIN IMMEDIATE lock contenders | Open 3 independent SQLite connections (busy_timeout=5000); run 3 simultaneous BEGIN IMMEDIATE write transactions. | 3 concurrent BEGIN IMMEDIATE contenders committed 3/3 rows without lock drops. | 462ms | **`PASS`** |
| `DB-03` | Busy timeout exhaustion handling | Conn A holds BEGIN IMMEDIATE lock for 500ms; Conn B with busy_timeout=50ms attempts write -> hits SQLITE_BUSY cleanly, then retries after unlock. | Caught real SQLITE_BUSY (true) after 50ms exhaustion; post-unlock retry succeeded (true). | 482ms | **`PASS`** |
| `DB-04` | Transaction rollback atomicity | Execute BEGIN -> INSERT canary memory -> ROLLBACK on dedicated connection. | Rollback atomicity preserved; canary row present = false. | 11ms | **`PASS`** |
| `DB-05` | Interrupted writes recovery | Simulate uncommitted SQLite write before forced connection close + atomic file write temp cleanup check. | Uncommitted dirty row absent=true; atomic file write verified=true. | 29ms | **`PASS`** |
| `DB-06` | WAL growth and TRUNCATE checkpointing | Write 150 rows to grow WAL log, then execute PRAGMA wal_checkpoint(TRUNCATE). | WAL size 4124152B -> 0B after TRUNCATE checkpoint; integrity=ok. | 50ms | **`PASS`** |
| `DB-07` | Concurrent mission state transitions & telemetry reconciliation | Transition 10 missions concurrently PENDING->RUNNING->COMPLETED; reconcile DB counts vs telemetry sample. | Telemetry observed active=10 during transitions, reconciled to 0 (DB=0) after. | 34ms | **`PASS`** |

---

## Detailed Resource & Telemetry Records
### `DB-01` — Concurrent SQLite reads and writes (`PASS`)
- **Window:** 2026-11-25T06:38:54.881Z $\to$ 2026-11-25T06:38:54.899Z (18ms)
- **Expected:** All 80 operations succeed with 0 errors and all 30 writes persisted.
- **Observed:** 80 concurrent ops finished; 30/30 rows persisted; integrity=ok.
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.15 MB` (After: `20.61 MB` / RSS: `72.17 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `DB-02` — Multiple BEGIN IMMEDIATE lock contenders (`PASS`)
- **Window:** 2026-11-25T06:38:54.902Z $\to$ 2026-11-25T06:38:55.363Z (462ms)
- **Expected:** WAL busy_timeout arbitrates contention so all 3 transactions serialize and commit cleanly.
- **Observed:** 3 concurrent BEGIN IMMEDIATE contenders committed 3/3 rows without lock drops.
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.05 MB` (After: `20.67 MB` / RSS: `72.03 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `DB-03` — Busy timeout exhaustion handling (`PASS`)
- **Window:** 2026-11-25T06:38:55.367Z $\to$ 2026-11-25T06:38:55.849Z (482ms)
- **Expected:** Conn B catches real SQLITE_BUSY cleanly without crashing, preserves DB integrity, succeeds on retry.
- **Observed:** Caught real SQLITE_BUSY (true) after 50ms exhaustion; post-unlock retry succeeded (true).
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.03 MB` (After: `20.71 MB` / RSS: `71.95 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `DB-04` — Transaction rollback atomicity (`PASS`)
- **Window:** 2026-11-25T06:38:55.855Z $\to$ 2026-11-25T06:38:55.866Z (11ms)
- **Expected:** Canary row count == 0 after ROLLBACK.
- **Observed:** Rollback atomicity preserved; canary row present = false.
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.02 MB` (After: `20.74 MB` / RSS: `72.2 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `DB-05` — Interrupted writes recovery (`PASS`)
- **Window:** 2026-11-25T06:38:55.870Z $\to$ 2026-11-25T06:38:55.898Z (29ms)
- **Expected:** Uncommitted row is absent from DB; atomic file write leaves zero partial artifacts.
- **Observed:** Uncommitted dirty row absent=true; atomic file write verified=true.
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.02 MB` (After: `20.77 MB` / RSS: `72.24 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `DB-06` — WAL growth and TRUNCATE checkpointing (`PASS`)
- **Window:** 2026-11-25T06:38:55.903Z $\to$ 2026-11-25T06:38:55.953Z (50ms)
- **Expected:** WAL file truncates cleanly; PRAGMA integrity_check remains ok.
- **Observed:** WAL size 4124152B -> 0B after TRUNCATE checkpoint; integrity=ok.
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `-0.1 MB` (After: `20.68 MB` / RSS: `72.54 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `DB-07` — Concurrent mission state transitions & telemetry reconciliation (`PASS`)
- **Window:** 2026-11-25T06:38:55.955Z $\to$ 2026-11-25T06:38:55.989Z (34ms)
- **Expected:** DB counts match telemetry snapshot 100%.
- **Observed:** Telemetry observed active=10 during transitions, reconciled to 0 (DB=0) after.
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.27 MB` (After: `20.96 MB` / RSS: `72.63 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

