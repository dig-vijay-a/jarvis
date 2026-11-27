# NOVA System API Documentation — Phase 5: NOVA 1.0 Production-Grade OS

The NOVA Backend operates on port `5000` with REST and WebSocket endpoints. The Python Local Agent operates on port `8000`.

---

## 1. Zero-Trust Security API (Module 1)
- `POST /api/mobile/auth` — Authenticates mobile pairing via PBKDF2-SHA512 hashed PIN verification:
  - Body: `{ pin: string, deviceName?: string }`
  - Returns: `{ success: true, token, refreshToken, expiresAt, sessionId, message }`
- `POST /api/mobile/rotate` — Atomically rotates session token using a valid refresh token:
  - Body: `{ token?: string, refreshToken: string }`
  - Returns: `{ success: true, token, refreshToken, expiresAt, message }`
- `POST /api/mobile/revoke` — Revokes mobile session and cuts off access:
  - Header: `Authorization: Bearer <mobile_token>`
  - Body: `{ sessionIdToRevoke?: string }`
- `GET /api/mobile/audit-logs` — Retrieves security session audit logs:
  - Query: `?limit=50`
- `GET /api/mobile/sync` — Synchronizes messages, missions, memories, and tasks (Requires mobile bearer token).
- `POST /api/mobile/sync/push` — Bidirectional sync push applying client changes with Last-Write-Wins (LWW) conflict resolution using sequence numbers.
- `GET /api/mobile/devices` — Lists paired mobile devices with last seen timestamps and permissions.
- `POST /api/mobile/devices/:id/revoke` — Revokes specific paired mobile device.
- `PUT /api/mobile/devices/:id/permissions` — Updates granular permissions for a paired device.
- `POST /api/mobile/approvals/:id/decide` — Remotely authorizes or denies a pending mission step from mobile.

---

## 2. Knowledge Graph API (Module 4)
- `GET /api/graph` — Exports full node-link graph topology for the visualizer:
  - Query: `?limit=150`
  - Returns: `{ success: true, nodes: [...], links: [...] }`
- `GET /api/graph/search` — Searches entities by keyword or type:
  - Query: `?q=React`
- `GET /api/graph/neighborhood/:id` — Multi-hop neighborhood traversal (1-hop or 2-hop):
  - Query: `?hops=2`
  - Returns: `{ success: true, neighborhood: { rootId, nodes, edges } }`
- `POST /api/graph/entities` — Upserts an entity with confidence and provenance:
  - Body: `{ name: string, entity_type: string, properties?: object, source_type?: string, confidence?: number }`
- `PUT /api/graph/entities/:id` — Corrects entity properties or confidence.
- `DELETE /api/graph/entities/:id` — Purges entity and cascades relationship cleanup.
- `POST /api/graph/relationships` — Adds a directed relationship between two entities:
  - Body: `{ source_entity_id, target_entity_id, relationship_type, weight?, source_type? }`
- `POST /api/graph/extract` — Automatically extracts entities and relationships from free-form text.

---

## 3. Personal Digital Twin API (Module 5)
- `GET /api/twin` — Retrieves user traits grouped across all 5 dimensions (`goals`, `projects`, `preferences`, `routines`, `priorities`).
- `GET /api/twin/context` — Returns formatted Markdown context ready for AI system prompt injection.
- `POST /api/twin` — Registers a new digital twin trait:
  - Body: `{ category: 'goals'|'projects'|'preferences'|'routines'|'priorities', title: string, content: string, priority?: number }`
- `PUT /api/twin/:id` — Updates trait attributes.
- `PATCH /api/twin/:id/toggle` — Toggles active/inactive state of a trait:
  - Body: `{ is_enabled: boolean }`
- `DELETE /api/twin/:id` — Deletes a trait from the digital twin.

---

## 4. AI Evaluation Engine API (Module 3)
- `GET /api/evaluation/benchmarks` — Lists all registered evaluation benchmarks.
- `GET /api/evaluation/runs` — Lists past automated evaluation runs with metrics and execution times:
  - Query: `?limit=20`
- `POST /api/evaluation/run` — Triggers an automated evaluation benchmark suite:
  - Body: `{ suiteType: 'smoke'|'full', runName?: string }`
  - Returns: `{ success: true, result: { runId, totalTests, passedCount, metrics: { tool_selection_accuracy, mission_completion_rate, output_quality_score, citation_accuracy, recovery_success_rate, total_estimated_tokens, estimated_cost_usd, avg_latency_ms } } }`

---

## 5. Skills Ecosystem API (Module 7)
- `GET /api/skills` — Lists all registered agent skills with schemas and permission tags.
- `GET /api/skills/:skillKey` — Retrieves details for a specific skill.
- `POST /api/skills` — Registers a new reusable agent skill:
  - Body: `{ skill_key, name, description, version, schema_definition, permissions, author }`
- `PUT /api/skills/:id` — Updates skill definition.
- `PATCH /api/skills/:id/toggle` — Enables or disables a skill.
- `POST /api/skills/:skillKey/execute` — Executes a skill with input arguments and schema validation:
  - Body: `{ args: object, callingAgent?: string }`
- `POST /api/skills/:skillKey/test` — Runs an automated self-test on skill schema and handler.

---

## 6. Production Reliability & Hot Backups API (Module 8)
- `GET /api/system/health` — Executes deep subsystem health audit (Database integrity, Python agent status, process uptime, memory RSS/heap).
- `GET /api/system/backups` — Lists all SQLite hot backups with file sizes and SHA-256 checksums.
- `POST /api/system/backups` — Performs an atomic online SQLite hot backup via `VACUUM INTO`.
- `POST /api/system/backups/:id/verify` — Mounts backup snapshot and verifies integrity via `PRAGMA integrity_check`.
- `DELETE /api/system/backups/:id` — Removes a backup archive.
- `GET /api/system/errors` — Retrieves structured system error logs with subsystem breakdown and severity counts.
- `POST /api/system/errors` — Logs a structured subsystem error.
- `PUT /api/system/errors/:id/resolve` — Marks an error resolved with resolution status.

---

## 7. Autonomous Mission Control API (Phases 3 & 4 Extended)
- `POST /api/missions/create` — Decomposes mission directive into multi-agent DAG with idempotency hashes.
- `GET /api/missions` — Lists missions.
- `GET /api/missions/:id` — Retrieves mission details, DAG steps, checkpoints, and deliverables.
- `POST /api/missions/:id/start` — Starts DAG execution with adaptive retries and checkpoint saving.
- `POST /api/missions/:id/pause` / `resume` / `cancel`.
- `POST /api/missions/:id/approve` — Grants human authorization for sensitive steps.
- `POST /api/missions/:id/retry` — Retries a failed step.
- `GET /api/missions/:id/checkpoints` — Retrieves execution checkpoints for a mission.
- `GET /api/missions/metrics/agents` — Retrieves performance metrics per agent (actions, success rate, retries, latency).

---

## 8. Complete Observability API (Phase 5)
- `GET /api/observability/traces` — Lists distributed traces with pagination, status filters, and latency breakdowns.
  - Query: `?limit=50&status=all`
- `GET /api/observability/traces/:traceId` — Retrieves full span execution tree for a specific request trace.
- `GET /api/observability/stats` — Returns aggregated observability metrics: total traces, average latency, total tokens, total API costs, and span-level breakdown.

---

## 9. Intelligent Model Routing API (Phase 5)
- `GET /api/routing/providers` — Lists registered AI providers and their live health status (`gemini-pro`, `gemini-flash`, `ollama-local`, `smart-reflex`).
- `POST /api/routing/route` — Evaluates user prompt complexity and privacy constraints, returning optimal route decision.
  - Body: `{ prompt: string, privacyTag?: string }`
- `POST /api/routing/configure` — Dynamically updates global model routing policies and privacy modes.
  - Body: `{ policy: 'cost_optimized'|'balanced'|'performance'|'privacy_first', privacyMode?: 'standard'|'strict_local' }`

---

## 10. Contextual Proactive Intelligence API (Phase 5)
- `GET /api/proactive/recommendations` — Retrieves non-intrusive, explainable recommendations with urgency scoring and context attribution.
- `POST /api/proactive/recommendations/:id/action` — Executes the recommended action (e.g. starts focus session, creates task).
- `POST /api/proactive/recommendations/:id/dismiss` — Dismisses a recommendation, updating learning feedback weights.
