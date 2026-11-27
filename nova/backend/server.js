import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase } from './database/db.js';
import { initScheduler } from './services/schedulerService.js';
import { initOrchestrator } from './ai/orchestrator.js';
import { initTaskPlanner } from './services/taskPlannerService.js';
import { initMissionControl } from './services/missionControlService.js';
import { initGoalManagement } from './services/goalManagementService.js';
import { initEnvironmentalPerception } from './services/environmentalPerceptionService.js';
import { initAutonomousInitiative } from './services/autonomousInitiativeEngine.js';
import { initPredictiveIntelligence } from './services/predictiveIntelligenceService.js';

import chatRoutes from './routes/chat.js';
import memoryRoutes from './routes/memory.js';
import taskRoutes from './routes/tasks.js';
import automationRoutes from './routes/automation.js';
import computerRoutes from './routes/computer.js';
import researchRoutes from './routes/research.js';
import settingsRoutes from './routes/settings.js';
import visionRoutes from './routes/vision.js';
import schedulerRoutes from './routes/scheduler.js';
import agentsRoutes from './routes/agents.js';
import missionsRoutes from './routes/missions.js';
import knowledgeRoutes from './routes/knowledge.js';
import integrationsRoutes from './routes/integrations.js';
import mobileRoutes from './routes/mobile.js';
import proactiveRoutes from './routes/proactive.js';
import graphRoutes from './routes/graph.js';
import twinRoutes from './routes/twin.js';
import skillsRoutes from './routes/skills.js';
import evaluationRoutes from './routes/evaluation.js';
import systemHealthRoutes from './routes/systemHealth.js';
import observabilityRoutes from './routes/observability.js';
import routingRoutes from './routes/routing.js';
import operationsRoutes from './routes/operations.js';
import ambientRoutes from './routes/ambient.js';
import evolutionRoutes from './routes/evolution.js';
import strategicRoutes from './routes/strategic.js';
import sentinelRoutes from './routes/sentinel.js';
import aegisRoutes from './routes/aegis.js';
import ObservabilityService from './services/observabilityService.js';
import { getSentinelEnduranceService } from './services/sentinelEnduranceService.js';
import ComputerControlService from './services/computerControlService.js';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env and nova/.env, preserving any non-empty values without blank overwrites
for (const envPath of [path.resolve(__dirname, '.env'), path.resolve(__dirname, '../.env')]) {
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    for (const [k, v] of Object.entries(parsed)) {
      if (v && (!process.env[k] || process.env[k].trim() === '')) {
        process.env[k] = v;
      }
    }
  }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Zero-Trust Rate Limiting Helper (Module 1)
const rateLimitMap = new Map();
const rateLimiter = (limit = 120, windowMs = 60000) => (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const clientData = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };

  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + windowMs;
  } else {
    clientData.count++;
  }

  rateLimitMap.set(ip, clientData);

  if (clientData.count > limit) {
    return res.status(429).json({
      success: false,
      error: 'Security alert: Rate limit exceeded. Please back off.'
    });
  }

  next();
};

// Middlewares with support for base64 screenshots and rate limiting
app.use(cors());
app.use(rateLimiter(150, 60000));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Database & Core Services
await initDatabase();
const scheduler = initScheduler(wss);
const orchestrator = initOrchestrator(wss);
const taskPlanner = initTaskPlanner(wss);
const missionControl = initMissionControl(wss);
const goalManagement = initGoalManagement(wss);
const perception = initEnvironmentalPerception(wss);
const initiative = initAutonomousInitiative(perception, wss);
scheduler.setAutonomousInitiativeEngine(initiative);
const predictive = initPredictiveIntelligence(wss);
ObservabilityService.setWebSocketServer(wss);
ComputerControlService.setWebSocketServer(wss);
const enduranceService = getSentinelEnduranceService();
enduranceService.setWebSocketServer(wss);
enduranceService.resumeOnServerStartup();

// WebSocket event handling
wss.on('connection', (ws) => {
  console.log('[NOVA WebSocket] HUD Client linked.');

  // Send immediate welcome handshake
  ws.send(JSON.stringify({
    event: 'HANDSHAKE',
    data: {
      status: 'ONLINE',
      system: 'JARVIS OS Core v2.0',
      timestamp: new Date().toISOString()
    }
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ event: 'PONG', timestamp: new Date().toISOString() }));
      }
    } catch (e) {
      console.warn('[NOVA WebSocket] Unhandled message format:', message.toString());
    }
  });

  ws.on('close', () => {
    console.log('[NOVA WebSocket] HUD Client unlinked.');
  });
});

// API Routes
app.use('/api/chat', chatRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/computer', computerRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/vision', visionRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/missions', missionsRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api/proactive', proactiveRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/twin', twinRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/evaluation', evaluationRoutes);
app.use('/api/system', systemHealthRoutes);
app.use('/api/observability', observabilityRoutes);
app.use('/api/routing', routingRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/ambient', ambientRoutes);
app.use('/api/evolution', evolutionRoutes);
app.use('/api/strategic', strategicRoutes);
app.use('/api/sentinel', sentinelRoutes);
app.use('/api/aegis', aegisRoutes);

// Environmental perception events endpoint
app.get('/api/perception/events', async (req, res) => {
  try {
    const events = await perception.getRecentEvents(Number(req.query.limit) || 30);
    res.json({ success: true, count: events.length, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'JARVIS Personal AI OS',
    version: '2.0.0',
    pid: process.pid,
    uptime_seconds: parseFloat(process.uptime().toFixed(1)),
    scheduler_active: !!scheduler.intervalId,
    endurance_status: enduranceService.status,
    endurance_timers_active: !!enduranceService.timer,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  JARVIS PERSONAL AI OPERATING SYSTEM — CORE           `);
  console.log(`  Backend Server active on: http://localhost:${PORT}   `);
  console.log(`  WebSocket Server active on: ws://localhost:${PORT}   `);
  console.log(`=======================================================`);
});
