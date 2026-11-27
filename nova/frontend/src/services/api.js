import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Chat
export const getConversations = () => api.get('/chat/conversations');
export const createConversation = (title) => api.post('/chat/conversations', { title });
export const getMessages = (conversationId) => api.get(`/chat/conversations/${conversationId}/messages`);
export const sendMessage = (conversationId, content, preferredProvider) =>
  api.post('/chat/message', { conversationId, content, preferredProvider });
export const deleteConversation = (conversationId) => api.delete(`/chat/conversations/${conversationId}`);

// Memory Intelligence
export const getMemories = (params) => api.get('/memory', { params });
export const getMemoryStats = () => api.get('/memory/stats');
export const createMemory = (data) => api.post('/memory', data);
export const updateMemory = (id, data) => api.put(`/memory/${id}`, data);
export const deleteMemory = (id) => api.delete(`/memory/${id}`);
export const checkMemoryDuplicate = (key, value) => api.post('/memory/check-duplicate', { key, value });
export const retrieveMemoryContext = (prompt, limit) => api.post('/memory/retrieve-context', { prompt, limit });

// Tasks & Productivity
export const getTasks = (params) => api.get('/tasks', { params });
export const createTask = (data) => api.post('/tasks', data);
export const updateTask = (id, data) => api.put(`/tasks/${id}`, data);
export const deleteTask = (id) => api.delete(`/tasks/${id}`);

export const getReminders = () => api.get('/tasks/reminders/all');
export const createReminder = (data) => api.post('/tasks/reminders', data);
export const deleteReminder = (id) => api.delete(`/tasks/reminders/${id}`);

export const startFocusSession = (duration, title) => api.post('/tasks/focus/start', { duration, title });
export const stopFocusSession = () => api.post('/tasks/focus/stop');

// Autonomous Task Planner & Workflows
export const getWorkflows = () => api.get('/automation/workflows');
export const createWorkflow = (data) => api.post('/automation/workflows', data);
export const runWorkflow = (id) => api.post(`/automation/workflows/${id}/run`);
export const triggerEmergencyStop = () => api.post('/automation/emergency-stop');

export const createTaskPlan = (instruction) => api.post('/automation/plan', { instruction });
export const getPlannedTasks = () => api.get('/automation/tasks');
export const executePlannedTask = (id) => api.post(`/automation/tasks/${id}/execute`);
export const approvePlannedTaskStep = (id, stepIndex) => api.post(`/automation/tasks/${id}/approve`, { stepIndex });
export const pausePlannedTask = (id) => api.post(`/automation/tasks/${id}/pause`);
export const resumePlannedTask = (id) => api.post(`/automation/tasks/${id}/resume`);
export const cancelPlannedTask = (id) => api.post(`/automation/tasks/${id}/cancel`);
export const retryPlannedTaskStep = (id, stepIndex) => api.post(`/automation/tasks/${id}/retry`, { stepIndex });

// Screen Intelligence & Vision
export const getVisionModes = () => api.get('/vision/modes');
export const analyzeScreen = (imageBase64, mode, customPrompt) =>
  api.post('/vision/analyze', { imageBase64, mode, customPrompt });

// Background Scheduler & Notifications
export const getScheduledJobs = () => api.get('/scheduler/jobs');
export const createScheduledJob = (data) => api.post('/scheduler/jobs', data);
export const deleteScheduledJob = (id) => api.delete(`/scheduler/jobs/${id}`);
export const getNotifications = () => api.get('/scheduler/notifications');
export const markNotificationRead = (id) => api.put(`/scheduler/notifications/${id}/read`);
export const clearNotifications = () => api.delete('/scheduler/notifications');

// Multi-Agent Architecture
export const getAgents = () => api.get('/agents');
export const classifyDirective = (directive) => api.post('/agents/classify', { directive });

// Computer Control
export const getSystemStatus = () => api.get('/computer/status');
export const getSystemProcesses = () => api.get('/computer/processes');
export const getAllowedApps = () => api.get('/computer/allowed-apps');
export const openApplication = (app_name) => api.post('/computer/open-app', { app_name });
export const openWebsite = (url) => api.post('/computer/open-url', { url });
export const searchFiles = (directory, pattern, limit) => api.post('/computer/search-files', { directory, pattern, limit });
export const readFileContent = (file_path) => api.post('/computer/read-file', { file_path });
export const createFolder = (folder_path) => api.post('/computer/create-folder', { folder_path });

// Research
export const searchWeb = (query, limit) => api.post('/research/search', { query, limit });
export const conductDeepResearch = (topic, depth) => api.post('/research/deep', { topic, depth });

// Settings & Logs
export const getSettings = () => api.get('/settings');
export const updateSettings = (data) => api.post('/settings', data);
export const testAiConnection = (provider) => api.post('/settings/test-ai', { provider });
export const getActivityLogs = (limit) => api.get('/settings/logs', { params: { limit } });
export const getSystemHealth = () => api.get('/settings/health');
export const getAiUsage = () => api.get('/settings/ai-usage');
export const getProviderStatus = () => api.get('/routing/providers');

// ==========================================
// PHASE 3: AUTONOMOUS MISSION CONTROL API
// ==========================================
export const createMission = (objective) => api.post('/missions/create', { objective });
export const getMissions = (limit) => api.get('/missions', { params: { limit } });
export const getMission = (id) => api.get(`/missions/${id}`);
export const startMission = (id) => api.post(`/missions/${id}/start`);
export const pauseMission = (id) => api.post(`/missions/${id}/pause`);
export const resumeMission = (id) => api.post(`/missions/${id}/resume`);
export const cancelMission = (id) => api.post(`/missions/${id}/cancel`);
export const approveMissionStep = (id, stepId) => api.post(`/missions/${id}/approve`, { stepId });
export const retryMissionStep = (id, stepId) => api.post(`/missions/${id}/retry`, { stepId });

// Document Knowledge Engine
export const ingestKnowledgeDocument = (data) => api.post('/knowledge/ingest', data);
export const getKnowledgeDocuments = () => api.get('/knowledge/documents');
export const searchKnowledge = (query, limit) => api.post('/knowledge/search', { query, limit });
export const deleteKnowledgeDocument = (id) => api.delete(`/knowledge/documents/${id}`);

// External Integrations
export const getIntegrations = () => api.get('/integrations');
export const configureIntegration = (provider, data) => api.post(`/integrations/${provider}/configure`, data);
export const disconnectIntegration = (provider) => api.post(`/integrations/${provider}/disconnect`);
export const getIntegrationAuditLogs = (limit) => api.get('/integrations/audit-logs', { params: { limit } });

// Proactive Intelligence
export const getProactiveBriefing = () => api.get('/proactive/briefing');
export const getProactiveInsights = () => api.get('/proactive/insights');

// Advanced Desktop Automation
export const getOpenWindows = () => api.get('/computer/windows');
export const manageDesktopWindow = (hwnd, action, confirmed) => api.post('/computer/window-action', { hwnd, action, confirmed });
export const executeMouseAction = (action, x, y, button) => api.post('/computer/mouse-action', { action, x, y, button });
export const executeKeyboardAction = (action, text, hotkey, confirmed) => api.post('/computer/keyboard-action', { action, text, hotkey, confirmed });
export const getClipboardText = () => api.get('/computer/clipboard');
export const setClipboardText = (text) => api.post('/computer/clipboard', { text });
export const inspectAppState = (app_name) => api.post('/computer/inspect-app', { app_name });

// ==========================================
// PHASE 4: PRODUCTION-GRADE INTELLIGENCE API
// ==========================================

// Knowledge Graph
export const getKnowledgeGraph = (limit) => api.get('/graph', { params: { limit } });
export const searchGraphEntities = (q) => api.get('/graph/search', { params: { q } });
export const getGraphNeighborhood = (id, hops) => api.get(`/graph/neighborhood/${id}`, { params: { hops } });
export const createGraphEntity = (data) => api.post('/graph/entities', data);
export const correctGraphEntity = (id, data) => api.put(`/graph/entities/${id}`, data);
export const deleteGraphEntity = (id) => api.delete(`/graph/entities/${id}`);
export const createGraphRelationship = (data) => api.post('/graph/relationships', data);
export const extractGraphEntities = (text) => api.post('/graph/extract', { text });

// Personal Digital Twin
export const getDigitalTwinProfile = () => api.get('/twin');
export const getDigitalTwinContext = () => api.get('/twin/context');
export const createDigitalTwinEntry = (data) => api.post('/twin', data);
export const updateDigitalTwinEntry = (id, data) => api.put(`/twin/${id}`, data);
export const toggleDigitalTwinEntry = (id, is_enabled) => api.patch(`/twin/${id}/toggle`, { is_enabled });
export const deleteDigitalTwinEntry = (id) => api.delete(`/twin/${id}`);

// AI Evaluation Engine
export const getEvaluationBenchmarks = () => api.get('/evaluation/benchmarks');
export const getEvaluationRuns = (limit) => api.get('/evaluation/runs', { params: { limit } });
export const runEvaluationSuite = (suiteType, runName) => api.post('/evaluation/run', { suiteType, runName });

// Skills Ecosystem
export const getSkills = () => api.get('/skills');
export const getSkillByKey = (key) => api.get(`/skills/${key}`);
export const registerSkill = (data) => api.post('/skills', data);
export const toggleSkill = (id, is_enabled) => api.patch(`/skills/${id}/toggle`, { is_enabled });
export const executeSkill = (key, args) => api.post(`/skills/${key}/execute`, { args });
export const testSkill = (key) => api.post(`/skills/${key}/test`);

// System Reliability & Diagnostics
export const getDeepSystemHealth = () => api.get('/system/health');
export const getSystemBackups = () => api.get('/system/backups');
export const createSystemBackup = () => api.post('/system/backups');
export const verifySystemBackup = (id) => api.post(`/system/backups/${id}/verify`);
export const deleteSystemBackup = (id) => api.delete(`/system/backups/${id}`);
export const getSystemErrors = (limit) => api.get('/system/errors', { params: { limit } });

// Operations & Predictive Intelligence (Phase 7-9)
export const getOperationsDashboard = () => api.get('/operations/dashboard');
export const getPredictions = (limit) => api.get('/operations/predictions', { params: { limit } });
export const getPatterns = (params) => api.get('/operations/patterns', { params });
export const getPredictiveRecommendations = (params) => api.get('/operations/recommendations', { params });
export const acceptPredictiveRecommendation = (id, feedback) => api.post(`/operations/recommendations/${id}/accept`, { feedback });
export const rejectPredictiveRecommendation = (id, feedback) => api.post(`/operations/recommendations/${id}/reject`, { feedback });
export const executePredictiveRecommendation = (id, isExplicitlyApproved) => api.post(`/operations/recommendations/${id}/execute`, { isExplicitlyApproved });
export const getPredictionEvaluation = () => api.get('/operations/evaluation');
export const triggerPredictiveCycle = () => api.post('/operations/predictive/cycle');

// ==========================================
// PHASE 10: PERSONAL DIGITAL TWIN & SIMULATION API
// ==========================================
export const getPersonalTwinSnapshot = (params) => api.get('/twin/snapshot', { params });
export const getPersonalTwinPromptContext = (params) => api.get('/twin/prompt-context', { params });
export const getStaleTwinFacts = () => api.get('/twin/stale');
export const getTwinConflicts = () => api.get('/twin/conflicts');
export const correctTwinFact = (id, data) => api.post(`/twin/correct/${id}`, data);
export const confirmTwinFact = (id) => api.post(`/twin/confirm/${id}`);
export const reconcileTwinFact = (id, data) => api.post(`/twin/reconcile/${id}`, data);
export const triggerTwinSync = () => api.post('/twin/sync');
export const getDecisionHistory = (params) => api.get('/twin/decisions', { params });
export const recordDecision = (data) => api.post('/twin/decisions', data);
export const recordDecisionOutcome = (id, data) => api.put(`/twin/decisions/${id}/outcome`, data);
export const simulateTwinDeadline = (data) => api.post('/twin/simulate/deadline', data);
export const simulateTwinResource = (data) => api.post('/twin/simulate/resource', data);
export const getTwinTimelineConflicts = () => api.get('/twin/simulate/conflicts');
export const findGraphPath = (startId, targetId, maxDepth) => api.get('/graph/path', { params: { startId, targetId, maxDepth } });
export const getGraphDownstreamImpact = (id, maxDepth) => api.get(`/graph/impact/${id}`, { params: { maxDepth } });
export const getGraphMissingDependencies = (projectId) => api.get(`/graph/missing-dependencies/${projectId}`);
export const getGraphContradictions = () => api.get('/graph/contradictions');

// ==========================================
// PHASE 11: AMBIENT PERSONAL INTELLIGENCE API
// ==========================================
export const generateDeviceEnrollment = (data) => api.post('/ambient/devices/enroll', data);
export const pairTrustedDevice = (data) => api.post('/ambient/devices/pair', data);
export const getTrustedDevices = () => api.get('/ambient/devices');
export const getTrustedDeviceById = (id) => api.get(`/ambient/devices/${id}`);
export const revokeTrustedDevice = (id, reason) => api.post(`/ambient/devices/${id}/revoke`, { reason });
export const rotateDeviceCredential = (id) => api.post(`/ambient/devices/${id}/rotate`);

export const getAmbientSyncPayload = (params) => api.get('/ambient/sync', { params });
export const pushAmbientSync = (data) => api.post('/ambient/sync/push', data);
export const queueAmbientOfflineOp = (data) => api.post('/ambient/sync/queue', data);
export const drainAmbientOfflineQueue = (deviceId) => api.post('/ambient/sync/drain', { device_id: deviceId });
export const getAmbientSyncCheckpoints = (deviceId) => api.get('/ambient/sync/checkpoints', { params: { device_id: deviceId } });

export const getAmbientContexts = () => api.get('/ambient/context');
export const getDeviceAmbientContext = (deviceId) => api.get(`/ambient/context/${deviceId}`);
export const updateDeviceAmbientContext = (deviceId, data) => api.post(`/ambient/context/${deviceId}`, data);
export const setDevicePrivacyPermissions = (deviceId, data) => api.put(`/ambient/context/${deviceId}/privacy`, data);
export const recordDeviceAmbientSignal = (deviceId, data) => api.post(`/ambient/context/${deviceId}/signals`, data);

export const getUnifiedNotifications = (params) => api.get('/ambient/notifications', { params });
export const dispatchUnifiedNotification = (data) => api.post('/ambient/notifications', data);
export const acknowledgeUnifiedNotification = (id, deviceId) => api.post(`/ambient/notifications/${id}/ack`, { device_id: deviceId });
export const configureQuietHours = (data) => api.post('/ambient/notifications/quiet-hours', data);

export const initiateDeviceHandoff = (data) => api.post('/ambient/handoff/initiate', data);
export const acceptDeviceHandoff = (id, deviceId) => api.post(`/ambient/handoff/${id}/accept`, { device_id: deviceId });
export const acquireVoiceCommandLock = (commandText, deviceId) => api.post('/ambient/voice/lock', { commandText, deviceId });

export const routeRemoteApproval = (data) => api.post('/ambient/orchestration/route-approval', data);
export const processRemoteApproval = (stepId, data) => api.post(`/ambient/approvals/${stepId}/decide`, data);
export const dispatchDeliverableToDevice = (data) => api.post('/ambient/orchestration/dispatch-deliverable', data);
export const sendDeviceHeartbeat = (deviceId) => api.post('/ambient/connectivity/heartbeat', { device_id: deviceId });

// Phase 12: Self-Evolving Intelligence Engine
export const runEvolutionAnalysis = (data) => api.post('/evolution/analysis/run', data || {});
export const getEvolutionWeaknesses = (params) => api.get('/evolution/weaknesses', { params });
export const resolveEvolutionWeakness = (id, data) => api.post(`/evolution/weaknesses/${id}/resolve`, data || {});

export const detectCapabilityGaps = (data) => api.post('/evolution/gaps/detect', data || {});
export const createCapabilityProposal = (data) => api.post('/evolution/proposals', data);
export const getCapabilityProposals = (params) => api.get('/evolution/proposals', { params });

export const designEvolvingSkill = (data) => api.post('/evolution/skills/design', data);
export const getEvolvingSkills = (params) => api.get('/evolution/skills', { params });
export const getEvolvingSkillById = (id) => api.get(`/evolution/skills/${id}`);

export const runSandboxExperiment = (data) => api.post('/evolution/sandbox/run', data);
export const getSandboxExperiment = (id) => api.get(`/evolution/experiments/${id}`);

export const runEvolutionValidation = (data) => api.post('/evolution/validation/run', data);
export const getEvolutionValidation = (skillId) => api.get(`/evolution/validations/${skillId}`);

export const optimizeWorkflowDag = (data) => api.post('/evolution/workflow/optimize', data);
export const getWorkflowOptimizations = (params) => api.get('/evolution/workflow/optimizations', { params });

export const submitSkillForApproval = (data) => api.post('/evolution/pipeline/submit', data);
export const grantDeploymentApproval = (id, data) => api.post(`/evolution/pipeline/${id}/approve`, data || {});
export const revokeDeploymentApproval = (id, data) => api.post(`/evolution/pipeline/${id}/revoke`, data || {});
export const deployEvolvingSkill = (id) => api.post(`/evolution/pipeline/${id}/deploy`);
export const rollbackEvolvingDeployment = (id, data) => api.post(`/evolution/pipeline/${id}/rollback`, data || {});
export const recoverCorruptedSkill = (key) => api.post(`/evolution/skills/${key}/recover`);
export const getEvolutionDeployments = () => api.get('/evolution/deployments');

export const recordEvolutionMetric = (data) => api.post('/evolution/metrics/record', data);
export const getEvolutionMetricsSummary = () => api.get('/evolution/metrics/summary');

// Phase 13: General Intelligence & Strategic Autonomy
export const createStrategicObjective = (data) => api.post('/strategic/objectives', data);
export const getStrategicObjectives = (params) => api.get('/strategic/objectives', { params });
export const getStrategicObjectiveById = (id) => api.get(`/strategic/objectives/${id}`);
export const updateStrategicObjectiveProgress = (id, data) => api.patch(`/strategic/objectives/${id}/progress`, data);
export const getStrategicConflicts = () => api.get('/strategic/conflicts');

export const performDeepReasoning = (data) => api.post('/strategic/reasoning', data);

export const getCrossDomainKnowledge = (id, params) => api.get(`/strategic/knowledge/cross-domain/${id}`, { params });
export const getKnowledgeFreshness = (id, params) => api.get(`/strategic/knowledge/freshness/${id}`, { params });
export const getKnowledgeContradictions = () => api.get('/strategic/knowledge/contradictions');

export const conductStrategicInvestigation = (data) => api.post('/strategic/investigations', data);
export const getStrategicInvestigation = (id) => api.get(`/strategic/investigations/${id}`);

export const evaluateStrategicDecision = (data) => api.post('/strategic/decisions', data);
export const getStrategicDecision = (id) => api.get(`/strategic/decisions/${id}`);

export const runStrategicSimulation = (data) => api.post('/strategic/simulations', data);

export const runPreExecutionReview = (data) => api.post('/strategic/reviews/pre', data);
export const runPostExecutionReview = (data) => api.post('/strategic/reviews/post', data);
export const getStrategicReview = (id) => api.get(`/strategic/reviews/${id}`);

export const checkAutonomyGovernance = (data) => api.post('/strategic/governance/check', data);
export const cancelStrategicExecution = (id, data) => api.post(`/strategic/objectives/${id}/cancel`, data || {});

// Phase 14: Project Sentinel (Autonomous Reliability & Readiness)
export const getSentinelTelemetry = () => api.get('/sentinel/telemetry');
export const getSentinelBaseline = () => api.get('/sentinel/baseline');
export const getSentinelReadiness = () => api.get('/sentinel/readiness');

// Phase 14 Stage 1: Sentinel Two-Hour Endurance & Observability
export const getSentinelEnduranceStatus = () => api.get('/sentinel/endurance/status');
export const getSentinelEnduranceHistory = () => api.get('/sentinel/endurance/history');
export const getSentinelEnduranceEvents = (params) => api.get('/sentinel/endurance/events', { params });
export const startSentinelEndurance = (data) => api.post('/sentinel/endurance/start', data || {});
export const pauseSentinelEndurance = () => api.post('/sentinel/endurance/pause');
export const resumeSentinelEndurance = () => api.post('/sentinel/endurance/resume');
export const stopSentinelEndurance = (confirmed = true) => api.post('/sentinel/endurance/stop', { confirmed });
export const exportSentinelEndurance = () => api.get('/sentinel/endurance/export');

// Phase 15: Local AI Performance & Intelligence Telemetry
export const getRoutingTelemetryMetrics = () => api.get('/routing/telemetry-metrics');

// Phase 16: Autonomous Computer Intelligence
export const getComputerIntelligenceState = () => api.get('/computer/intelligence/state');
export const setScreenObservationPermission = (granted) => api.post('/computer/intelligence/permission', { granted });
export const observeDesktopScreen = (data = {}) => api.post('/computer/intelligence/observe', data);
export const executeClosedLoopComputerTask = (data) => api.post('/computer/intelligence/execute', data);

// Phase 17: Advanced Personal Intelligence
export const getUnifiedPersonalContext = () => api.get('/twin/unified-context');
export const getCrossStoreContradictions = () => api.get('/twin/cross-contradictions');
export const getPersonalProactiveIntelligence = () => api.get('/twin/personal-intelligence');
export const evaluatePersonalDecision = (data) => api.post('/twin/decisions/evaluate', data);

// Phase 18: Autonomous Workflow Ecosystem
export const createStructuredWorkflow = (payload) => api.post('/missions/create', payload);
export const getWorkflowDashboard = () => api.get('/missions/dashboard/summary');
export const getMissionProvenance = (id) => api.get(`/missions/${id}/provenance`);
export const rollbackMissionWorkflow = (id, reason) => api.post(`/missions/${id}/rollback`, { reason });
export const resolveMissionEscalation = (id, data) => api.post(`/missions/${id}/resolve-escalation`, data);
export const getAgentExecutionLogs = (agentKey, limit = 30) =>
  agentKey ? api.get(`/agents/${agentKey}/logs`, { params: { limit } }) : api.get('/agents/logs/all', { params: { limit } });
export const getRepeatedWorkflowPatterns = (params) => api.get('/evolution/workflows/patterns', { params });
export const convertWorkflowToSkill = (data) => api.post('/evolution/workflows/convert', data);
export const benchmarkWorkflowSkill = (data) => api.post('/evolution/workflows/benchmark', data);
export const getOutdatedWorkflowSkills = (params) => api.get('/evolution/workflows/outdated', { params });

// Phase 19: Universal Device Intelligence
export const getDeviceDashboardSummary = () => api.get('/ambient/dashboard/summary');
export const updateDeviceTrustLevel = (id, trustLevel) => api.patch(`/ambient/devices/${id}/trust`, { trustLevel });
export const updateDeviceHealth = (id, health) => api.post(`/ambient/devices/${id}/health`, health);
export const quarantineDevice = (id, reason) => api.post(`/ambient/devices/${id}/quarantine`, { reason });
export const getConsumedNonces = () => api.get('/ambient/security/nonces');
export const getRoutingDecisions = (limit = 50) => api.get('/ambient/routing/decisions', { params: { limit } });
export const selectBestDeviceForTask = (data) => api.post('/ambient/orchestration/select-device', data);
export const transferWorkflowContext = (data) => api.post('/ambient/orchestration/transfer-workflow', data);

// Phase 20: Self-Evolving Intelligence
export const getEvolutionDashboardSummary = () => api.get('/evolution/dashboard/summary');
export const runPhase20Assessment = (data = {}) => api.post('/evolution/phase20/assess', data);
export const createEvolutionHypothesis = (data) => api.post('/evolution/phase20/hypotheses', data);
export const runPhase20Experiment = (data) => api.post('/evolution/phase20/experiments/run', data);

// Phase 21: Project AEGIS Testing Centre
export const getAegisStatus = () => api.get('/aegis/status');
export const runAegisReadinessCheck = (gateId) => api.post(`/aegis/gates/${gateId}/readiness`);
export const approveAegisGate = (gateId, operator = 'Operator') => api.post(`/aegis/gates/${gateId}/approve`, { operator });
export const toggleAegisChecklist = (itemId, checked) => api.post(`/aegis/checklist/${itemId}`, { checked });

export default api;
