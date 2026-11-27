# PHASE 16 ARCHITECTURE REPORT — AUTONOMOUS COMPUTER INTELLIGENCE

- **System:** JARVIS OS 2.0 (Local-First Windows Desktop Operator)
- **Primary Model / Endpoint:** `qwen3.5:4b` at `http://127.0.0.1:11434` (`$0.00` cloud inference)
- **Architecture Rule:** Reuses existing Windows Python agent (`nova/python-agent`), `ToolRegistry`, `Orchestrator`, `ModelRouterService`, approval gates, and SQLite persistence.

## 1. Closed-Loop Control Pipeline

```
OBSERVE ──► UNDERSTAND ──► PLAN ──► APPROVE IF REQUIRED ──► ACT ──► OBSERVE AGAIN ──► VERIFY ──► CONTINUE
```

Every action emitted by [computerControlService.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/computerControlService.js) must capture a pre-action real screenshot + UIA tree, resolve the control or ambiguity state, enforce permission/security/approval gates, execute on the live desktop, wait for UI repaint, capture a post-action screenshot + UIA tree, and verify actual state/pixel/text change before returning `VERIFIED_COMPLETED`.

## 2. Subsystem Layers & Reused Services

| Layer | Module | Role & Existing Service Integration |
|---|---|---|
| **Native OS Perception** | [perception.py](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/python-agent/automation/perception.py), [ocr_winrt.ps1](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/python-agent/automation/ocr_winrt.ps1) | Calls `ensure_interactive_desktop()` cleanly so `PIL.ImageGrab.grab()` captures real `1920x1080` screen pixels and `win32gui.PrintWindow(hwnd, dc, 2)` captures full window content without synthetic mocks; extracts UIA element/dialog trees via `pywinauto`; extracts local text via Windows native `Windows.Media.Ocr.OcrEngine`; computes pixel SHA-256 + `cv2` changed-region diffs. |
| **Native Input & Browser** | [desktop.py](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/python-agent/automation/desktop.py), [browser.py](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/python-agent/automation/browser.py), [agent.py](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/python-agent/agent.py) | Adds `AttachThreadInput` foreground focus reliability, `move`/`resize` window actions, mouse `scroll`, `click_ui_element` live coordinate re-resolution, foreground password/financial window blocking, and local Playwright DOM/screenshot automation (`browser_interact`). |
| **Backend Perception & Understanding** | [visualPerceptionService.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/visualPerceptionService.js), [computerUnderstandingService.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/computerUnderstandingService.js), [visionService.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/visionService.js) | Enforces explicit `screen_observation_permitted` opt-in setting, isolates untrusted OCR/window text inside `[UNTRUSTED_SCREEN_CONTENT]`, maintains a 25-frame ring buffer + SQLite `computer_observations`, maps directives to UIA controls/OCR hits, detects ambiguous controls (`NEEDS_CLARIFICATION`), and uses `ModelRouterService` + `qwen3.5:4b` locally when free-form reasoning is needed. |
| **Closed-Loop Control & Recovery** | [computerControlService.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/computerControlService.js) | Orchestrates the 7-stage loop, bounded recovery (stale coordinate re-acquisition up to `maxRecoveryAttempts=3`, unexpected dialog halt, crash detection), `WAITING_FOR_APPROVAL`, and `computer_action_audit` + `computer_control_state` persistence + WebSocket broadcasts (`COMPUTER_INTELLIGENCE_UPDATE`). |
| **Routes, Tools & UI Dashboard** | [db.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/database/db.js), [computer.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/routes/computer.js), [registry.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/tools/registry.js), [orchestrator.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/ai/orchestrator.js), [ComputerIntelligenceCard.jsx](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/frontend/src/components/dashboard/ComputerIntelligenceCard.jsx) | Adds 3 SQLite tables, 5 closed-loop tools (`computer_observe_screen`, `computer_understand_ui`, `computer_operate_closed_loop`, `computer_click_element`, `browser_interact`), REST `/api/computer/intelligence/*` endpoints, and live Computer Intelligence dashboard integrated in both `DashboardPage` and `ComputerControlPage`. |
