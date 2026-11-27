# JARVIS OS 2.0 — PROJECT SENTINEL (STAGE 3)
# RESOURCE PRESSURE & CEILING REPORT

**Generated:** 2026-11-25T06:39:05.841Z  
**Subsystem:** Group 6: CPU/Memory Pressure, Queue Backlog & Post-Stress Recovery  
**Summary:** `6 PASS` | `0 FAIL` | `0 PARTIALLY_VERIFIED` | `0 NOT_TESTED` (Total: 6)  

---

## Scenario Execution & Postcondition Audit

| ID | Scenario | Operations | Observed Postconditions | Latency / Duration | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `RES-01` | Controlled CPU pressure burst | Run bounded 800ms SHA-256 hashing burst, then verify event loop & latency return to nominal. | Executed 430864 SHA-256 hashes (CPU user=734ms); post-burst event loop lag=16ms. | 841ms | **`PASS`** |
| `RES-02` | Controlled memory pressure within hardware bounds | Allocate 32MB temporary Buffer chunk cleanly within 450MB ceiling, then release reference. | Allocated & released 32MB safely; peak RSS=125.65MB, post-release heap=20.12MB (< 450MB). | 80ms | **`PASS`** |
| `RES-03` | Growing mission queue observability under backlog | Seed 25 PENDING missions in DB, capture sample, transition to COMPLETED, capture post-drain sample. | Queue tracked +25 PENDING growth (1 -> 26 -> 1). | 29ms | **`PASS`** |
| `RES-04` | Notification backlog spike & recovery | Seed 30 unread unified_notifications, sample telemetry, acknowledge all, sample recovery. | Notification backlog tracked +30 (0 -> 30 -> 0). | 43ms | **`PASS`** |
| `RES-05` | Worker saturation pressure (9 missions / 4 slots) | Launch 9 concurrent missions under 4-worker ceiling and confirm bounded concurrency & complete drain. | Peak active=4/4, peak queue=5; drained active=0; 9/9 completed. | 196ms | **`PASS`** |
| `RES-06` | System recovery after all pressure removed | Sample post-stress DB integrity, heap bounds, scheduler active state, and fast query latency. | Post-stress DB integrity=ok (2ms), heap=21.76MB, scheduler active=true. | 6ms | **`PASS`** |

---

## Detailed Resource & Telemetry Records
### `RES-01` — Controlled CPU pressure burst (`PASS`)
- **Window:** 2026-11-25T06:39:04.608Z $\to$ 2026-11-25T06:39:05.449Z (841ms)
- **Expected:** Completed within bounded ceiling; post-burst async timer lag < 50ms.
- **Observed:** Executed 430864 SHA-256 hashes (CPU user=734ms); post-burst event loop lag=16ms.
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `-1.57 MB` (After: `20.43 MB` / RSS: `93.35 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `RES-02` — Controlled memory pressure within hardware bounds (`PASS`)
- **Window:** 2026-11-25T06:39:05.454Z $\to$ 2026-11-25T06:39:05.534Z (80ms)
- **Expected:** Allocation stays below ceiling without crash or OOM.
- **Observed:** Allocated & released 32MB safely; peak RSS=125.65MB, post-release heap=20.12MB (< 450MB).
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `-0.31 MB` (After: `20.13 MB` / RSS: `93.68 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `RES-03` — Growing mission queue observability under backlog (`PASS`)
- **Window:** 2026-11-25T06:39:05.537Z $\to$ 2026-11-25T06:39:05.566Z (29ms)
- **Expected:** Telemetry observes queued_missions jump by +25 and cleanly drop back by -25.
- **Observed:** Queue tracked +25 PENDING growth (1 -> 26 -> 1).
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.42 MB` (After: `20.56 MB` / RSS: `93.76 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `RES-04` — Notification backlog spike & recovery (`PASS`)
- **Window:** 2026-11-25T06:39:05.571Z $\to$ 2026-11-25T06:39:05.614Z (43ms)
- **Expected:** Telemetry tracks +30 unread backlog growth and returns to baseline cleanly.
- **Observed:** Notification backlog tracked +30 (0 -> 30 -> 0).
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.3 MB` (After: `20.87 MB` / RSS: `93.78 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `RES-05` — Worker saturation pressure (9 missions / 4 slots) (`PASS`)
- **Window:** 2026-11-25T06:39:05.616Z $\to$ 2026-11-25T06:39:05.812Z (196ms)
- **Expected:** Active workers capped <= 4; queue absorbs overflow; 9/9 complete.
- **Observed:** Peak active=4/4, peak queue=5; drained active=0; 9/9 completed.
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.87 MB` (After: `21.75 MB` / RSS: `93.79 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

### `RES-06` — System recovery after all pressure removed (`PASS`)
- **Window:** 2026-11-25T06:39:05.815Z $\to$ 2026-11-25T06:39:05.821Z (6ms)
- **Expected:** SQLite integrity=ok, scheduler alive, query < 50ms, heap well below ceiling.
- **Observed:** Post-stress DB integrity=ok (2ms), heap=21.76MB, scheduler active=true.
- **PIDs Recorded:** `{}`
- **Resources:** Heap Delta `0.01 MB` (After: `21.77 MB` / RSS: `93.21 MB`)
- **DB Integrity:** Before=`ok`, After=`ok`

