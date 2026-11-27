# NOVA 1.0 — PERSONAL AI OPERATING SYSTEM (JARVIS)

NOVA (Neural Operative Virtual Assistant) is a dependable, production-grade personal AI operating system inspired by Tony Stark's JARVIS from Iron Man. It combines real-time voice interaction, continuous contextual memory, multi-agent autonomous mission execution, Windows desktop automation, distributed request observability, intelligent model routing, cross-device sync with conflict resolution, and zero-trust security.

---

## ⚡ Key Highlights & Capabilities

- **Futuristic Iron Man HUD**: Dynamic Arc Reactor AI core, real-time waveform audio visualizer, holographic glassmorphic panels, system telemetry monitors, and responsive desktop/mobile layout.
- **Global Command Palette (`Ctrl+K`)**: Instant action dispatching across tasks, tools, memory, research, missions, and system controls.
- **Natural & Bilingual Interaction**: Continuous voice conversations with Voice Activity Detection (VAD), speech interruption on TTS playback, and native bilingual **Tamil (`ta-IN`) & English (`en-US`)** support.
- **Autonomous Mission Mode**: High-level objective planning into multi-agent DAGs with automatic dependency management, failure classification, exponential retries, checkpoints, and restart recovery.
- **Intelligent Model Routing**: Dynamic tiering between Gemini 2.5 Pro (complex reasoning), Gemini 2.5 Flash (standard), Local Ollama, and Smart Reflex (instant local commands), with strict local-only privacy guarantees.
- **Complete End-to-End Observability**: Microservice-grade distributed span tracing across intent detection, context retrieval, planning, agent delegation, tool execution, and response generation, with token cost tracking.
- **Cross-Device Continuity**: Seamless mobile-to-desktop synchronization with Last-Write-Wins (LWW) conflict resolution, device pairing, and remote approval authorization.
- **Contextual Proactive Intelligence**: Context-driven notifications for upcoming deadlines (<24h), project inactivity (>72h), and time-based routine triggers with strict anti-spam throttling.
- **Windows Desktop Automation**: Sandboxed local automation agent on loopback (`127.0.0.1:8000`) for window management, mouse/keyboard input, clipboard control, and file operations.
- **Zero-Trust Security**: PBKDF2-SHA512 hashed PIN authentication, 24-hour expiring sessions with token rotation, instant session revocation, AES-256-GCM data encryption at rest, and mandatory human approval gates for sensitive actions.
- **Non-Blocking Hot Backups**: Automated online SQLite snapshots via `VACUUM INTO` with SHA-256 checksums and `PRAGMA integrity_check` verification.

---

## 🏗️ Architecture Overview

```
                               +------------------------------------------+
                               |        REACT + VITE FUTURISTIC HUD       |
                               |  - Arc Reactor Central Core & Waveform   |
                               |  - Global Command Bar (Ctrl + K)         |
                               |  - Bilingual Voice HUD (EN / தமிழ்)     |
                               |  - Onboarding Tour & Telemetry Widgets   |
                               +--------------------+---------------------+
                                                    |
                                          REST & WebSockets
                                                    |
                                                    v
+---------------------------------------------------------------------------------------------------------+
|                                    NODE.JS + EXPRESS BACKEND (:5000)                                    |
|                                                                                                         |
|  +--------------------+  +--------------------+  +--------------------+  +----------------------------+ |
|  | Observability Svc  |  | Model Router Svc   |  | Proactive Engine   |  | Cross-Device Sync (LWW)    | |
|  | - Request Traces   |  | - Gemini Pro/Flash |  | - Deadline < 24h   |  | - Sequence Number Conflict | |
|  | - Granular Spans   |  | - Local Ollama     |  | - Inactivity > 72h |  | - Remote Step Approvals   | |
|  | - Token/Cost Model |  | - Strict Privacy   |  | - Routine Triggers |  | - Paired Devices Registry  | |
|  +--------------------+  +--------------------+  +--------------------+  +----------------------------+ |
|                                                                                                         |
|  +--------------------+  +--------------------+  +--------------------+  +----------------------------+ |
|  | Mission DAG Engine |  | Multi-Agent Mesh   |  | Knowledge Graph    |  | Zero-Trust Security        | |
|  | - Checkpoints      |  | - 7 Scoped Agents  |  | - Entity Extraction|  | - PBKDF2 Hashed PIN        | |
|  | - Auto-Recovery    |  | - Dynamic Skills   |  | - Multi-hop Search |  | - AES-256-GCM Encryption   | |
|  | - Failure Classify |  | - Benchmarks Eval  |  | - Provenance Track |  | - Token Rotation & Revoke | |
|  +--------------------+  +--------------------+  +--------------------+  +----------------------------+ |
|                                                    |                                                    |
|                                                    v                                                    |
|                                      SQLite Database (nova.sqlite)                                      |
+----------------------------------------------------+----------------------------------------------------+
                                                     | Loopback HMAC-Auth Bearer
                                                     v
+---------------------------------------------------------------------------------------------------------+
|                                PYTHON LOCAL AUTOMATION AGENT (:8000)                                    |
|  - Windows win32gui & desktop controls (mouse, keyboard, clipboard, window management)                 |
|  - Local offline wake-word detector ("Hey Nova")                                                        |
|  - Strictly bound to 127.0.0.1; protected by path traversal validator & emergency kill switch         |
+---------------------------------------------------------------------------------------------------------+
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: 3.10+ (with `pywin32`, `psutil`, `fastapi`, `uvicorn`)
- **Git**

### 1. Installation
Clone the repository and install all dependencies:

```bash
# 1. Backend dependencies
cd nova/backend
npm install

# 2. Frontend dependencies
cd ../frontend
npm install

# 3. Python agent dependencies
cd ../python-agent
pip install -r requirements.txt
```

### 2. Environment Configuration
Copy `.env.example` in `nova/backend` to `.env`:

```env
PORT=5000
PYTHON_AGENT_URL=http://127.0.0.1:8000
PYTHON_AGENT_TOKEN=nova-secure-token-change-in-production
GEMINI_API_KEY=your_gemini_api_key_here
SESSION_SECRET=your_cryptographically_secure_random_string_here
ENCRYPTION_KEY=64_character_hex_key_for_aes_256_gcm
```

### 3. Launching NOVA 1.0

#### Option A: Production Process Supervisor (Recommended)
NOVA includes an automated Node.js process supervisor that orchestrates both the backend and Python agent with automatic health monitoring and crash recovery:

```bash
cd nova/backend
node supervisor.js
```

#### Option B: Windows Background Launcher
Run the silent Windows script to launch NOVA in the background:
```bat
nova\scripts\start-nova-silent.vbs
```

#### Option C: Manual Launch (Development Mode)
```bash
# Terminal 1: Python Local Agent
cd nova/python-agent
python agent.py

# Terminal 2: Node.js Backend
cd nova/backend
node server.js

# Terminal 3: React Frontend HUD
cd nova/frontend
npm run dev
```

Visit `http://localhost:5173` to open the NOVA HUD.

---

## 🧪 Automated Testing Laboratory & Regression Suites

NOVA features an extensive automated test laboratory covering all system layers:

```bash
# Run NOVA 1.0 Autonomous Testing Laboratory (57 Scenarios)
node nova/backend/tests/run_nova1_laboratory_tests.js

# Run Phase 2 Test Suite (35 Tests)
node nova/backend/tests/run_all_tests.js

# Run Phase 3 Test Suite (44 Tests)
node nova/backend/tests/run_phase3_tests.js

# Run Phase 4 Test Suite (37 Tests)
node nova/backend/tests/run_phase4_tests.js
```

**Total Test Coverage**: **173 out of 173 automated tests passing with 100% success rate.**

---

## 🛡️ Security & Privacy Boundaries

1. **Loopback Isolation**: The Python automation agent is strictly bound to `127.0.0.1` and is never exposed directly to external networks.
2. **Path Traversal Protection**: System directories (`C:\Windows`, `System32`, `Program Files`) are blocked by security validators.
3. **Zero Cloud Leakage in Strict Privacy Mode**: When `privacy_mode` is set to `strict_local`, sensitive user context is exclusively handled by local models (Local Ollama or Smart Reflex) with zero external API calls.
4. **Mandatory Human-in-the-Loop**: High-risk actions (file deletion, process termination, external scripts) halt execution until explicitly approved by the operator.
5. **Session Revocation**: Compromised or decommissioned devices can be revoked immediately, invalidating both bearer and refresh tokens.

---

## 📚 Documentation Links

- [System Architecture](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/docs/ARCHITECTURE.md)
- [API Reference Manual](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/docs/API.md)
- [Deployment & Remote Access Guide](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/docs/DEPLOYMENT.md)
- [Rollback & Disaster Recovery Runbook](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/docs/ROLLBACK.md)
- [User Guide & Voice Controls](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/docs/USER_GUIDE.md)
