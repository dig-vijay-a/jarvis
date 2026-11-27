# NOVA System Architecture — Phase 5: NOVA 1.0 Production-Grade OS

NOVA (Neural Operative Virtual Assistant) is a full-stack, voice-driven personal AI operating system inspired by Tony Stark's JARVIS.

```
                           +---------------------------------------------------------------------------------+
                           |                           REACT + VITE FUTURISTIC HUD                           |
                           |  - Command Center HUD (Arc Reactor, Dynamic Waveforms, Audio Diagnostics)       |
                           |  - Global Command Bar (Ctrl + K) & First-Time Onboarding Tour                   |
                           |  - Bilingual Interaction Engine (English 'en-US' & Tamil 'ta-IN')              |
                           |  - Mission Control Page (Real-Time DAG Execution, Multi-Agent Step Pipeline)   |
                           |  - Intelligence Hub Page (Knowledge Graph, Digital Twin, Benchmarks, Skills)    |
                           |  - Hardware Privacy Mute & Local Wake-Word Indicators ("Hey Nova" / "ஹே நோவா")  |
                           |  - Mobile Touch Companion Bar & Responsive Layout (< 768px Viewports)          |
                           |  - Screen Intelligence WebRTC Frame Capture Modal                               |
                           +----------------------------------------+----------------------------------------+
                                                                    |  REST & WebSockets
                                                                    v
+--------------------------------------------------------------------------------------------------------------------+
|                                              NODE.JS + EXPRESS BACKEND (:5000)                                     |
|                                                                                                                    |
|   +----------------------------+   +-------------------------------+   +---------------------------------------+   |
|   |   Observability Service    |   |   Zero-Trust Security Gateway |   |   Intelligent Model Router            |   |
|   |   - Distributed Traces     |-->|   - PBKDF2-SHA512 Hashed PIN  |-->|   - Gemini 2.5 Pro (Deep Reasoning)   |   |
|   |   - Span Latency Trees     |   |   - 24h Expiry & Token Rotate |   |   - Gemini 2.5 Flash (Standard)       |   |
|   |   - Token Cost Accounting  |   |   - AES-256-GCM At Rest       |   |   - Local Ollama (Offline)            |   |
|   |   - Error Root Cause Logs  |   |   - Remote Approval Signing   |   |   - Smart Reflex (Instant Tool Exec)  |   |
|   +----------------------------+   +---------------+---------------+   +-------------------+-------------------+   |
|                                                    |                                       |                       |
|   +----------------------------+                   v                                       v                       |
|   |   Contextual Proactive Svc |   +-------------------------------+   +---------------------------------------+   |
|   |   - Deadlines (<24h Scan)  |   |   Cross-Device Continuity Svc |   |   Adaptive Mission DAG Engine         |   |
|   |   - Inactive Projects >72h |-->|   - Last-Write-Wins (LWW)     |-->|   - Checkpoints & Resumption          |   |
|   |   - Routine Time Triggers  |   |   - Sequence Num Verification |   |   - Failure Classification (Transient)|   |
|   |   - Throttled Reminders    |   |   - Paired Device Management  |   |   - Alternative Tool Selection        |   |
|   +----------------------------+   +---------------+---------------+   +-------------------+-------------------+   |
|                                                    |                                       |                       |
|   +----------------------------+                   v                                       v                       |
|   |   Knowledge Graph Service  |   +-------------------------------+   +---------------------------------------+   |
|   |   - Entities & Relations   |   |   Multi-Agent Mesh (7 Agents) |   |   Supervisor Process Monitor          |   |
|   |   - Multi-Hop Traversal    |-->|   - Coordinator, Research,    |-->|   - Node.js & Python Auto-Restart     |   |
|   |   - Document Vector RAG    |   |     Coding, Content, etc.     |   |   - Exponential Backoff Health Checks |   |
|   +----------------------------+   +---------------+---------------+   +-------------------+-------------------+   |
|                                                    |                                       |                       |
|                                                    v                                       v                       |
|                                    +-----------------------------------------------------------------------+       |
|                                    |                    SQLite Relational Storage                          |       |
|                                    |  request_traces, proactive_recommendations, paired_devices,           |       |
|                                    |  missions, mission_steps, mission_checkpoints, agent_metrics          |       |
|                                    |  graph_entities, graph_relationships, digital_twin_profiles           |       |
|                                    |  agent_skills, evaluation_runs, backups_meta, system_errors           |       |
|                                    +-----------------------------------------------------------------------+       |
+--------------------------------------------------------------------+-----------------------------------------------+
                                                                     | Constant-Time HMAC Bearer Token (Localhost Only)
                                                                     v
+--------------------------------------------------------------------------------------------------------------------+
|                                      PYTHON LOCAL AUTOMATION AGENT (Port 8000)                                     |
|                                                                                                                    |
|   +--------------------------------+   +---------------------------------+   +---------------------------------+   |
|   |   Windows Desktop Automation   |   |   Local Wake-Word Engine        |   |   Security Sandbox              |   |
|   |   - win32gui Window Enum/State |   |   - Local Phrase Detection      |   |   - 127.0.0.1 Strict Binding    |   |
|   |   - Cursor Positioning & Click |   |   - "Hey Nova" & "ஹே நோவா"      |   |   - Sandboxed Directory Paths   |   |
|   |   - Unicode Text Typing        |   |   - Zero External Audio Upload  |   |   - Constant-Time Token Compare |   |
|   |   - Safe Hotkey Combinations   |   |   - Privacy Hardware Mute State |   |   - Confirmation on File/Window |   |
|   |   - Clipboard Read/Write Check |   |   - Interruption on TTS Playback|   |   - Emergency Kill Switch       |   |
|   +--------------------------------+   +---------------------------------+   +---------------------------------+   |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## Architectural Pillars of Phase 4

### 1. Zero-Trust Security Architecture
- **Cryptographic PIN Storage**: Master PIN hashed using PBKDF2 with HMAC-SHA512 and random 16-byte salt across 100,000 iterations. Verification uses `timingSafeEqual`.
- **Session Lifecycle**: 24-hour expiration window; rotation issues new bearer and refresh tokens while invalidating previous credentials.
- **Immediate Revocation**: Blocked sessions immediately reject incoming requests.
- **Data Protection at Rest**: Sensitive data encrypted via AES-256-GCM with independent 96-bit IVs and authentication tags.
- **Defense in Depth**: In-memory rate limiting and origin verification.

### 2. Adaptive Mission Intelligence
- **Failure Classification Engine**: Distinguishes transient network errors from permanent schema/permission faults.
- **Exponential Backoff**: Transient errors retry up to 3 times with exponentially scaling delays (1s, 2s, 4s).
- **Alternative Tool Selection & Dynamic Replanning**: Automatically switches to registered fallback tools when primary tools encounter failures.
- **Execution Checkpoints**: State snapshots stored in `mission_checkpoints` after each DAG step.
- **Application Restart Recovery**: Automatically detects interrupted missions on startup, resets uncommitted steps, and safely transitions to `PAUSED` for operator review.
- **Action Idempotency Hashes**: Generates SHA-256 action hash (`tool + args`) to prevent duplicate or conflicting execution.
- **Agent Performance Metrics**: Tracks cumulative action counts, success ratios, retries, and latency averages per agent.

### 3. AI Evaluation Engine
- **Repeatable Automated Benchmarks**: Tests tool selection precision, mission DAG dependency execution, and error recovery.
- **Telemetry & Cost Accounting**: Estimates token consumption and calculates API cost metrics based on active models.
- **Historical Analysis**: Tracks evaluation runs over time to identify regressions.

### 4. Knowledge Graph
- **Entity Identification**: Automatic extraction of technology, project, role, topic, and concept nodes.
- **Relationship Linking**: Directed links with assigned weights and relationship semantics (`integrates_with`, `controls`, `associated_with`).
- **Neighborhood Traversal**: 1-hop and 2-hop graph queries.
- **Provenance Separation**: Strictly maintains source attribution (`user_explicit` vs `ai_inferred`).
- **Memory Correction**: Updates confidence scores and cascades relationship cleanups when entities are pruned.

### 5. Personal Digital Twin
- **5 User Dimensions**: Manages Goals, Projects, Preferences, Routines, and Priorities.
- **Prompt Formulation Context**: Formats active traits into structured Markdown sections for AI planning prompts.
- **User Control**: Full inspection, toggle, and deletion capabilities.

### 6. Skills Ecosystem Matrix
- **Reusable Micro-Modules**: Defines discrete capabilities with formal JSON schema contracts.
- **Permission Boundaries**: Skills explicitly declare required permission scopes (`read_files`, `web_search`, `system_metrics`).
- **Validation Self-Tests**: On-demand self-tests ensure schema validity and handler dispatch.

### 7. Production Reliability & Hot Backups
- **Non-Blocking Hot Backups**: Uses SQLite `VACUUM INTO` for atomic, non-locking snapshots while the database is actively in use.
- **Integrity Auditing**: Mounts snapshot copies and executes `PRAGMA integrity_check` to guarantee zero corruption.
- **Structured Error Logging**: Subsystem tracking in `system_errors` with automated resolution states.
