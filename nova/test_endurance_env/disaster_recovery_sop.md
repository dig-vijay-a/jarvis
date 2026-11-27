# JARVIS OS 2.0 — Disaster Recovery Standard Operating Procedure
## 1. Crash Resumption Protocol
- Node daemon restarts on port 5000.
- Boot scanner invokes recoverInterruptedMissions().
- SQLite WAL journal replays uncommitted transactions.
## 2. Verification Gate
- Bit-for-bit physical disk content hash verified.
## 3. Human Approval Escapes
- Sensitive tools require confirmed=true.
