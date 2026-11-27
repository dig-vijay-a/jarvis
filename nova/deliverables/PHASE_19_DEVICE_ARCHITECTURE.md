# JARVIS OS 2.0 — Phase 19: Universal Device Architecture

## 1. Overview
Phase 19 evolves JARVIS's Phase 11 ambient/mobile companion foundation into a unified, security-hardened, capability-aware multi-device ecosystem without replacing existing services.

## 2. Database Schema Extensions (`nova/backend/database/db.js`)
- **`trusted_devices`** extended with:
  - `trust_level` (`FULL_TRUST` | `TRUSTED` | `LIMITED` | `READ_ONLY` | `GUEST`)
  - `health_score` (0–100 composite score)
  - `battery_level`, `storage_available_mb`, `cpu_load_percent`, `network_type`, `last_health_at`
- **`offline_operation_queue`** extended with `max_retries` (default 5)
- **`consumed_nonces`**: `nonce` (PK), `device_id`, `consumed_at`, `expires_at` for per-request replay prevention
- **`device_routing_decisions`**: `id` (PK), `task_type`, `selected_device_id`, `candidate_scores`, `reason`, `score`, `created_at`

## 3. Backend Services
- **Extended Phase 11 Services** (preserved intact):
  - `DeviceIdentityService` (`nova/backend/services/deviceIdentityService.js`)
  - `CrossDeviceSyncService` (`nova/backend/services/crossDeviceSyncService.js`)
  - `CrossDeviceConversationService` (`nova/backend/services/crossDeviceConversationService.js`)
  - `DeviceOrchestrationService` (`nova/backend/services/deviceOrchestrationService.js`)
  - `ConnectivityManagerService` (`nova/backend/services/connectivityManagerService.js`)
  - `AmbientContextService` (`nova/backend/services/ambientContextService.js`)
- **New Phase 19 Extension Services**:
  - `Phase19DeviceTrustService` (`nova/backend/services/phase19DeviceTrustService.js`): Trust hierarchy, composite health scoring, nonce registry, HMAC-SHA256 signing/verification, device quarantine.
  - `Phase19IntelligentOrchestrationService` (`nova/backend/services/phase19IntelligentOrchestrationService.js`): Capability-based task routing (`coding` → desktop, `voice`/`approval` → mobile/android, `web_research` → browser), mission-level workflow handoff (`transferWorkflowContext`), expired approval auto-cleanup.
  - `Phase19SyncExtensionService` (`nova/backend/services/phase19SyncExtensionService.js`): Targeted mission sync (`syncMissionState`), three-way LWW conflict resolution, expired queue pruning, cross-device duplicate detection.

## 4. Unified Device Dashboard UI
- `nova/frontend/src/pages/DeviceDashboardPage.jsx` wired into `App.jsx` (`devices` tab) and `Sidebar.jsx` (`Device Ecosystem`), backed by `/api/ambient/dashboard/summary`.
