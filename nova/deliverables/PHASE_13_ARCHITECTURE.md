# JARVIS OS 2.0 — PHASE 13 ARCHITECTURE
## General Intelligence & Strategic Autonomy Core

### 1. Architectural Overview

Phase 13 elevates JARVIS OS 2.0 from an autonomous execution engine into a strategic intelligence system. Rather than merely executing discrete, pre-planned tasks, JARVIS interprets ambiguous user directives, decomposes objectives into hierarchical initiatives, explores multi-domain knowledge graphs, conducts rigorous evidence-backed investigations, performs Multi-Criteria Decision Analysis (MCDA), simulates counterfactual scenarios without mutating production state, executes self-critique reviews, and enforces autonomy governance boundaries.

```
+---------------------------------------------------------------------------------------------------+
|                                      USER AMBIGUOUS DIRECTIVE                                     |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                           P0: STRATEGIC INTELLIGENCE SERVICE (Strategic Core)                     |
|  - Objective Interpretation & Decomposition into Initiatives (ANALYZED -> PLANNED -> ACTIVE)      |
|  - Missing Information & Knowledge Gap Detection                                                  |
|  - Invariant: Inferred preferences strictly capped at <= 0.70 confidence; never self-promote     |
+---------------------------------------------------------------------------------------------------+
       |                          |                             |                        |
       v                          v                             v                        v
+---------------+      +--------------------+      +--------------------+      +--------------------+
|  P1: DEEP     |      |  P2: CROSS-DOMAIN  |      |  P3: RESEARCH &    |      |  P4: DECISION      |
|  REASONING    |      |  KNOWLEDGE GRAPH   |      |  INVESTIGATION     |      |  INTELLIGENCE      |
|  ENGINE       |      |  (Knowledge Graph) |      |  SERVICE           |      |  (MCDA Engine)     |
|  - 10-Stage   |      |  - Cross-domain    |      |  - Subquestion     |      |  - Multi-Criteria  |
|    Reasoning  |      |    graph traversal |        decomposition      |        Matrix (6 crits)   |
|  - Correlation|      |  - Confidence cap  |      |  - Anti-fabrication|      |  - Objective vs.   |
|    vs Causation|      |    (<= 0.70)       |      |    provenance check|        Subjective scoring|
|  - Contradict-|      |  - TTL Stale data  |      |  - Prompt injection|      |  - DecisionMemory  |
|    ion Handling|      |    filter (>30 d) |        sanitization       |        persistence        |
+---------------+      +--------------------+      +--------------------+      +--------------------+
       \                          |                             |                        /
        \                         |                             |                       /
         v                        v                             v                      v
+---------------------------------------------------------------------------------------------------+
|                         P6: COUNTERFACTUAL & SCENARIO INTELLIGENCE                               |
|  - Isolated Read-Only Projections: Best Case, Expected Case, Worst Case Adversarial               |
|  - Invariant: ZERO mutations to active missions, goals, or production state                       |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                         P7: CRITICAL REVIEW & GOVERNANCE GATEWAY                                  |
|  - Pre-Execution Review: Challenges assumptions, flags unjustified certainty, detects gates       |
|  - Autonomy Governance: Enforces mandatory human approval for high-impact/destructive actions     |
|  - Post-Execution Review: Compares predicted vs actual variance; records empirical lessons        |
|  - Invariant: Self-evaluation CANNOT mark outputs correct without independent verification       |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                         P5: STRATEGIC GOAL ORCHESTRATION (MissionControl)                         |
|  - Objective -> Initiative -> Mission -> Task DAG Linkage                                         |
|  - Invariant 17: Constituent mission completion does NOT mark parent objective ACHIEVED           |
|  - State transitions to OUTCOME_VERIFICATION_PENDING until independent postconditions verify      |
+---------------------------------------------------------------------------------------------------+
```

---

### 2. Core Service Components & Invariants

#### P0 — Strategic Intelligence Service (`strategicIntelligenceService.js`)
- **Purpose:** Contextualizes and structures raw, ambiguous, or high-level human directives.
- **Decomposition:** Automatically decomposes high-level strategic objectives into structured, measurable `strategic_initiatives`.
- **Knowledge Gap Detection:** Evaluates whether target deadlines, environments, resource budgets, or rollback policies are absent.
- **Invariant:** Inferred facts or preferences from Digital Twin or Knowledge Graph are never converted silently into confirmed user objectives.

#### P1 — Deep Reasoning Engine (`deepReasoningService.js`)
- **10-Stage Process:**
  1. `UNDERSTAND`: Formalize core inquiry and intent type (`CAUSAL_ANALYSIS`, `DECISION_EVALUATION`, `STRATEGIC_PLANNING`).
  2. `CONTEXTUALIZE`: Anchor in operational host parameters.
  3. `IDENTIFY KNOWLEDGE GAPS`: Flag missing empirical traces.
  4. `GENERATE HYPOTHESES`: Generate competing candidate explanations distinguishing causality from correlation.
  5. `EVALUATE EVIDENCE`: Catalog supporting vs. contradictory evidence; flag unsupported assumptions.
  6. `COMPARE ALTERNATIVES`: Compute relative evidence scores and plausibility tiers.
  7. `ASSESS RISKS`: Explicitly identify operational bottlenecks and risk of confusing correlation with causation.
  8. `FORM CONCLUSION`: Formulate conclusion; track uncertainty score and epistemic bounds.
  9. `VERIFY`: Assign verification status (`VERIFIED`, `PARTIALLY_VERIFIED`, `DISPUTED`).
  10. `COMMUNICATE`: Produce concise, explainable summaries without exposing private Chain-of-Thought (CoT) tokens.

#### P2 — Cross-Domain Knowledge Intelligence (`knowledgeGraphService.js`)
- **Cross-Domain Traversal (`discoverCrossDomainConnections`):** Connects disparate entities across projects, skills, research, goals, missions, decisions, files, agents, and workflows.
- **Confidence Invariant:** Inferred relationships strictly capped at $\le 0.70$ weight.
- **Freshness Invariant:** Entities and relationships older than 30 days without re-confirmation flagged as `STALE`.

#### P3 — Research & Investigation Intelligence (`investigationService.js`)
- **Structured Inquiry:** Decomposes complex unfamiliar questions into actionable subquestions.
- **Anti-Fabrication:** Requires valid traceable source URIs or file paths; rejects fabricated citations (`FABRICATED_CITATION_DETECTED`).
- **Prompt Injection Defense:** Regex pattern scanning sanitizes adversarial payloads (e.g. `ignore all previous instructions`, `bypass all security`) and replaces them with `[REDACTED_ADVERSARIAL_INJECTION]`.

#### P4 — Decision Intelligence Engine (`strategicDecisionService.js`)
- **MCDA Framework:** Evaluates $\ge 2$ alternatives across 6 weighted criteria (expected benefit, cost/resources, complexity, security profile, reversibility, execution uncertainty).
- **Subjectivity Invariant:** Distinguishes objective measurable criteria from subjective estimates.
- **Decision Memory Mirror:** Automatically persists decision contexts, options, and recommended rationale into `DecisionMemoryService`.

#### P5 — Strategic Goal Orchestration (`missionControlService.js`)
- **Hierarchical Tree:** `Strategic Objective -> Strategic Initiative -> Mission -> Task Step`.
- **Decoupled Completion Invariant (Invariant 17):** Constituent mission completion does NOT mark parent strategic objective `ACHIEVED`. Instead, status transitions to `OUTCOME_VERIFICATION_PENDING`.
- **Restart Recovery (Invariant 18):** Interrupted strategic missions are safely recovered to `PENDING` upon backend reboot.
- **Stalled Initiative Detection (Invariant 19):** Initiatives with failed or blocked constituent missions are flagged `STALLED` with diagnostic reasons.

#### P6 — Counterfactual & Scenario Intelligence (`twinSimulationService.js`)
- **Projections:** Computes Best Case, Realistic Expected Case, and Adversarial Worst Case outcomes.
- **Read-Only Invariant:** Computations are purely mathematical models stored in `strategic_scenario_simulations` with `is_read_only = 1`. Zero rows in `missions`, `strategic_objectives`, or filesystem files are modified.

#### P7 — Self-Critique and Governance Gateway (`criticalReviewService.js`)
- **Pre-Execution Review:** Identifies overconfident or flawed assumptions (e.g. `always`, `never`, `guaranteed`).
- **Independent Verification Invariant (Invariant 24):** Self-evaluation score $\ge 0.8$ cannot validate success if independent verification failed or is absent; marks `VERIFICATION_FAILED`.
- **Autonomy Governance (P9):** High-impact actions (`financial_transaction`, `destructive_file_op`, `production_code_deploy`, `permission_escalation`, `sensitive_data_sharing`) strictly require human approval.

---

### 3. Database Schema Extensions (`data/nova.sqlite`)

```sql
-- Strategic Objectives Table
CREATE TABLE IF NOT EXISTS strategic_objectives (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  intended_outcomes TEXT NOT NULL,
  constraints TEXT NOT NULL,
  assumptions TEXT NOT NULL,
  dependencies TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  risks TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence TEXT NOT NULL,
  status TEXT DEFAULT 'ANALYZED',
  progress REAL DEFAULT 0.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

-- Strategic Initiatives Table
CREATE TABLE IF NOT EXISTS strategic_initiatives (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'MEDIUM',
  status TEXT DEFAULT 'PLANNED',
  allocated_resources TEXT DEFAULT '{}',
  measurable_outcomes TEXT NOT NULL,
  stalled_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (objective_id) REFERENCES strategic_objectives(id)
);

-- Strategic Investigations Table
CREATE TABLE IF NOT EXISTS strategic_investigations (
  id TEXT PRIMARY KEY,
  objective_id TEXT,
  research_question TEXT NOT NULL,
  subquestions TEXT NOT NULL,
  retrieved_sources TEXT NOT NULL,
  conflicting_claims TEXT NOT NULL,
  outdated_information TEXT NOT NULL,
  unanswered_questions TEXT NOT NULL,
  synthesis_report TEXT NOT NULL,
  status TEXT DEFAULT 'COMPLETED',
  created_at TEXT NOT NULL
);

-- Strategic Decisions Table
CREATE TABLE IF NOT EXISTS strategic_decisions (
  id TEXT PRIMARY KEY,
  objective_id TEXT,
  decision_context TEXT NOT NULL,
  options TEXT NOT NULL,
  evaluation_criteria TEXT NOT NULL,
  scores_matrix TEXT NOT NULL,
  trade_offs TEXT NOT NULL,
  recommended_option TEXT NOT NULL,
  confidence REAL NOT NULL,
  conditions_changing_recommendation TEXT NOT NULL,
  status TEXT DEFAULT 'RECOMMENDED',
  created_at TEXT NOT NULL
);

-- Strategic Scenario Simulations Table
CREATE TABLE IF NOT EXISTS strategic_scenario_simulations (
  id TEXT PRIMARY KEY,
  objective_id TEXT,
  scenario_name TEXT NOT NULL,
  simulation_type TEXT NOT NULL,
  scenario_parameters TEXT NOT NULL,
  best_case TEXT NOT NULL,
  expected_case TEXT NOT NULL,
  worst_case TEXT NOT NULL,
  is_read_only INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Strategic Critical Reviews Table
CREATE TABLE IF NOT EXISTS strategic_critical_reviews (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  supporting_evidence TEXT NOT NULL,
  contradictory_evidence TEXT NOT NULL,
  challenged_assumptions TEXT NOT NULL,
  alternative_approaches TEXT NOT NULL,
  failure_conditions TEXT NOT NULL,
  requires_human_approval INTEGER DEFAULT 0,
  approval_reasons TEXT,
  unresolved_uncertainty TEXT,
  planning_errors_identified TEXT,
  lessons_learned TEXT,
  verdict TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```
