# NOVA — Autonomous Personal AI Operating System (JARVIS)

An advanced, voice-controlled personal AI operating system inspired by Tony Stark's **JARVIS** from Iron Man. 

NOVA operates as a personal command center that communicates naturally with voice synthesis, remembers your preferences and facts across sessions with semantic intelligence, controls your computer through a secure Python automation daemon, conducts multimodal screen intelligence, orchestrates multi-agent operations, executes multi-step autonomous plans with human-in-the-loop approval gating, and operates with **Production-Grade Autonomous Intelligence**: Zero-Trust Security, Adaptive Mission Intelligence, AI Evaluation Engine, Knowledge Graph, Personal Digital Twin, Skills Ecosystem, and SQLite Hot Backups.

---

## 🌟 Key Capabilities Across Phases 1, 2, 3 & 4

### 1. Zero-Trust Security (Phase 4 — Module 1)
- **Hashed PIN Verification**: PBKDF2-SHA512 derivation with 100,000 iterations and cryptographic salts. Constant-time timingSafeEqual comparison.
- **Session Expiry & Token Rotation**: 24-hour expiration window on mobile sessions, atomic token rotation with refresh tokens.
- **Session Revocation**: Real-time session invalidation cutting off access immediately. Comprehensive `session_audit_logs`.
- **AES-256-GCM Credentials at Rest**: All sensitive credentials encrypted in database with authenticated AES-256-GCM (IV, AuthTag, Ciphertext) and tamper detection.
- **Rate Limiting & Boundary Guards**: In-memory rate limiting and origin verification preventing brute-force and untrusted origin attacks.

### 2. Adaptive Mission Intelligence (Phase 4 — Module 2)
- **Failure Classification**: Automatic categorization into `TRANSIENT_NETWORK`, `TIMEOUT`, `PERMISSION_DENIED`, `INVALID_ARGUMENTS`, `RESOURCE_NOT_FOUND`, `SYSTEM_FAULT`.
- **Context-Aware Exponential Retries**: Backoff retries for transient errors while immediately halting permanent permission/schema violations.
- **Alternative Tool Fallback**: Automatically tries registered alternative tools (e.g. `conduct_deep_research` -> `search_web`).
- **Dynamic DAG Replanning**: Re-routes DAG execution when a step encounters unrecoverable conditions.
- **Execution Checkpoints & Crash Recovery**: Snapshot states persisted in `mission_checkpoints`; automatic restart scan recovers interrupted missions safely.
- **Action Idempotency Hashes**: Computes SHA-256 action hash (`tool + args`) to prevent duplicate or conflicting execution.
- **Agent Performance Metrics**: Real-time tracking of agent actions, success rate, retries, and average latency.

### 3. AI Evaluation Engine (Phase 4 — Module 3)
- **Automated Benchmark Runner**: Measures tool selection accuracy, mission completion rate, output quality score, citation accuracy, recovery success rate, latency, and estimated token/API costs.
- **Benchmark Catalog**: Pre-registered test scenarios covering orchestration, DAG planning, zero-trust auth, and graph traversal.
- **Evaluation History**: Persists evaluation run results in `evaluation_runs` with detailed pass/fail breakdowns.

### 4. Knowledge Graph (Phase 4 — Module 4)
- **Entity Extraction & Linkage**: Automatically extracts entities (`technology`, `project`, `role`, `topic`, `concept`) from directives and conversations.
- **Multi-Hop Traversal**: 1-hop and 2-hop neighborhood exploration.
- **Source Attribution & Memory Correction**: Clear provenance distinction (`user_explicit` vs `ai_inferred`), confidence adjustment, and cascading relationship cleanup.
- **Visual Graph Topology Export**: Interactive cluster visualizer in the Intelligence Hub HUD.

### 5. Personal Digital Twin (Phase 4 — Module 5)
- **5 User Dimensions**: Manages `Goals`, `Projects`, `Preferences`, `Routines`, and `Priorities`.
- **Context-Aware Prompt Injection**: Dynamically compiles enabled digital twin traits into active system prompts for mission formulation.
- **Fine-Grained Controls**: Toggle enable/disable, edit, and delete learned traits.

### 6. Skills Ecosystem Matrix (Phase 4 — Module 7)
- **Reusable Agent Skills**: Pre-built skills with strict JSON schema definitions and scoped permissions:
  - `code_repository_analyzer`: AST and repository architecture inspection.
  - `web_dossier_synthesizer`: Multi-source intelligence dossier compiler with citations.
  - `system_resource_optimizer`: CPU, RAM, and process handle optimization.
  - `executive_presentation_summarizer`: Executive bullet briefing from long texts.
  - `meeting_calendar_planner`: Conflict-free schedule coordinator.
- **Automated Self-Tests**: Verifies skill schemas and execution handlers on demand with live sample output.

### 7. Production Reliability & SQLite Hot Backups (Phase 4 — Module 8)
- **Atomic Hot Backups**: Non-blocking `VACUUM INTO` backups generated with SHA-256 verification checksums.
- **Database Integrity Auditing**: Mounts backup snapshots and executes `PRAGMA integrity_check` to verify database health.
- **Structured Error Tracking**: Subsystem error tracking in `system_errors` with severity levels and recovery status.
- **Graceful Degradation**: Offline fallback when external AI or Python agent is unavailable.

### 8. Futuristic Stark HUD Interface & Intelligence Hub (Phase 4 — Frontend)
- **Intelligence Hub Page**: 5 sub-tabs (Knowledge Graph Visualizer, Digital Twin Console, AI Evaluation Dashboard, Skills Matrix, Reliability & Backups).
- Animated SVG **Arc Reactor Core** reacting to voice, thinking, and speaking states.
- Dedicated pages: **Command HUD**, **Mission Control**, **Intelligence Hub**, **Neural Chat**, **Memory Banks**, **Workflows**, **Computer Link**, **Web Research**, and **Core Settings**.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- Python (3.10+) with `win32gui`, `psutil`, `fastapi`, `uvicorn`
- SQLite 3

### 1. Launch Backend Server (:5000)
```bash
cd nova/backend
npm install
node server.js
```

### 2. Launch Python Local Agent (:8000)
```bash
python nova/python-agent/agent.py
```

### 3. Launch Frontend HUD (:3000)
```bash
cd nova/frontend
npm install
npm run dev
```

### 4. Run Automated QA Test Suites
```bash
# Phase 2 Suite (35 tests)
node nova/backend/tests/run_all_tests.js

# Phase 3 Suite (44 tests)
node nova/backend/tests/run_phase3_tests.js

# Phase 4 Suite (37 scenarios/tests)
node nova/backend/tests/run_phase4_tests.js
```
*Total: 116 / 116 automated tests passing with 100% success rate.*

---

## 🔒 Security Principles
- Zero hardcoded credentials in application source code.
- Credentials at rest encrypted using AES-256-GCM.
- Sensitive computer and communication actions require explicit human confirmation.
- Subsystem permissions strictly immutable by autonomous agents.
