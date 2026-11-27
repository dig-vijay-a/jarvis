# NOVA 1.0 — Secure Deployment & Operations Guide

## 1. System Architecture Overview

NOVA is a production-grade personal AI operating system inspired by JARVIS. It operates with a four-tier distributed local architecture:

1. **Futuristic HUD Frontend:** React 19, Vite, Tailwind CSS, Lucide icons, Framer Motion (`http://localhost:3000`).
2. **Node.js Core Backend:** Express, SQLite3, WebSocket Server (`http://localhost:5000`). Manages memory, DAG missions, skills, graph relationships, observability tracing, and model routing.
3. **Python Automation Agent:** FastAPI / Uvicorn agent (`http://127.0.0.1:8000`). Handles Windows desktop automation, keyboard/mouse hooks, system telemetry, and window manipulation.
4. **NOVA Process Supervisor:** Node.js supervisor (`nova/backend/supervisor.js`) that monitors, health-checks, and auto-restarts failed worker processes with exponential backoff.

---

## 2. Windows Startup Integration

NOVA can be configured to start automatically on Windows boot.

### Method A: Interactive Startup
Double-click `nova\scripts\start-nova.bat`. This verifies Node.js and Python environments, launches the supervisor, and starts the HUD frontend.

### Method B: Headless / Silent Windows Startup
To launch NOVA silently on user login without popup terminal windows:
1. Press `Win + R`, type `shell:startup`, and press Enter.
2. Create a shortcut to `nova\scripts\start-nova-silent.vbs` inside the Startup folder.
3. On your next Windows login, the supervisor and frontend will spin up in the background.

---

## 3. Zero-Trust Security & Remote Access Architecture

### Critical Security Rule: Never Expose Python Agent to Public Internet
> [!CAUTION]
> The Python local automation agent has direct operating system privileges (desktop control, mouse, keyboard, file access). It binds **strictly to loopback `127.0.0.1:8000`** and enforces a local bearer token. **NEVER** expose port 8000 to the WAN, router port forwards, or public IP addresses.

### Secure Mobile & Remote Access via Tailscale / WireGuard
For remote access from mobile devices or external laptops:
1. **Private Overlay Network (Recommended):** Use **Tailscale** or **WireGuard** to create a zero-trust encrypted mesh VPN connecting your mobile device and Windows host.
2. **Authenticated Gateway:** Point the mobile companion client to the Node.js backend's private Tailscale IP (e.g. `http://100.x.y.z:5000/api/mobile`).
3. **Zero-Trust Token Rotation:** Mobile clients authenticate with PBKDF2-salted hashed PIN verification. Sessions are issued a short-lived token and a refresh token with automatic 24-hour expiration and remote revocation.
4. **Rate Limiting:** The Node.js gateway enforces IP-based rate limiting (150 requests/minute) to defeat brute-force attempts.

---

## 4. Environment Configuration (`.env`)

Create or update `.env` in `nova/backend/`:

```env
PORT=5000
NODE_ENV=production
GEMINI_API_KEY=your_gemini_api_key_here
PYTHON_AGENT_URL=http://localhost:8000
PYTHON_AGENT_TOKEN=nova-local-agent-secure-token-2026
MOBILE_PIN=2026
```

---

## 5. Automated Backup Scheduling

NOVA features automated non-blocking SQLite hot backups via `VACUUM INTO`:
- Backups are generated in `nova/data/backups/`.
- Configured by default in database settings: `auto_backup_enabled = 'true'`, `auto_backup_interval_hours = 12`.
- Every backup records SHA-256 checksum and file metadata in `backups_meta`.

---

## 6. Process Supervisor Operations

To run the supervisor manually:
```bash
node nova\backend\supervisor.js
```
The supervisor:
- Performs continuous health checks on `:5000/health` and `:8000/api/system/info`.
- Detects unhandled exceptions or crashes.
- Automatically respawns child processes using exponential backoff (2s, 4s, 8s, 16s, up to 30s).
- Gracefully terminates all children upon `Ctrl+C` or `SIGINT`.
