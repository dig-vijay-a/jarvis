import { spawn } from 'child_process';
import path from 'path';
import http from 'http';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

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

console.log('=======================================================');
console.log('  NOVA PROCESS SUPERVISOR — LIFECYCLE CONTROLLER       ');
console.log('=======================================================');

class ProcessSupervisor {
  constructor() {
    const backendPort = process.env.PORT || 5000;
    const pythonAgentUrl = process.env.PYTHON_AGENT_URL || 'http://127.0.0.1:8000';
    this.enablePythonAgent = process.env.SUPERVISOR_DISABLE_PYTHON !== '1';

    this.processes = {
      backend: {
        name: 'Node.js Core Backend',
        command: 'node',
        args: ['server.js'],
        cwd: __dirname,
        child: null,
        restarts: 0,
        maxRestarts: 5,
        healthUrl: `http://localhost:${backendPort}/health`,
        isShuttingDown: false
      },
      pythonAgent: {
        name: 'Python Local Automation Agent',
        command: 'python',
        args: ['nova/python-agent/agent.py'],
        cwd: rootDir,
        child: null,
        restarts: 0,
        maxRestarts: 5,
        healthUrl: `${pythonAgentUrl}/health`,
        isShuttingDown: false
      }
    };

    this.checkInterval = null;
  }

  startProcess(key) {
    const config = this.processes[key];
    if (config.isShuttingDown) return;

    console.log(`[Supervisor] Spawning ${config.name} (attempt ${config.restarts + 1})...`);

    const child = spawn(config.command, config.args, {
      cwd: config.cwd,
      shell: true,
      stdio: 'pipe',
      env: { ...process.env }
    });

    config.child = child;

    child.stdout.on('data', (data) => {
      process.stdout.write(`[${key.toUpperCase()}] ${data}`);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(`[${key.toUpperCase()} ERROR] ${data}`);
    });

    child.on('exit', (code, signal) => {
      console.warn(`[Supervisor] ${config.name} exited with code ${code}, signal: ${signal}`);
      config.child = null;

      if (!config.isShuttingDown) {
        if (config.restarts < config.maxRestarts) {
          config.restarts++;
          const delay = Math.min(30000, 2000 * Math.pow(2, config.restarts - 1));
          console.log(`[Supervisor] Scheduling restart of ${config.name} in ${delay}ms...`);
          setTimeout(() => this.startProcess(key), delay);
        } else {
          console.error(`[Supervisor] FATAL: ${config.name} exceeded max restart threshold (${config.maxRestarts}).`);
        }
      }
    });

    child.on('error', (err) => {
      console.error(`[Supervisor] Failed to spawn ${config.name}:`, err.message);
    });
  }

  pingHealth(url) {
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: 3000 }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  startHealthMonitor() {
    this.checkInterval = setInterval(async () => {
      for (const [key, proc] of Object.entries(this.processes)) {
        if (proc.child && proc.healthUrl) {
          const isHealthy = await this.pingHealth(proc.healthUrl);
          if (!isHealthy) {
            console.warn(`[Supervisor Monitor] Health ping failed for ${proc.name} at ${proc.healthUrl}`);
          }
        }
      }
    }, 15000);
  }

  startAll() {
    if (this.enablePythonAgent) {
      this.startProcess('pythonAgent');
      setTimeout(() => {
        this.startProcess('backend');
        this.startHealthMonitor();
      }, 2000);
    } else {
      this.startProcess('backend');
      this.startHealthMonitor();
    }
  }

  shutdown() {
    console.log('[Supervisor] Graceful shutdown initiated...');
    if (this.checkInterval) clearInterval(this.checkInterval);

    for (const proc of Object.values(this.processes)) {
      proc.isShuttingDown = true;
      if (proc.child) {
        console.log(`[Supervisor] Terminating ${proc.name} (PID: ${proc.child.pid})...`);
        try {
          proc.child.kill('SIGINT');
        } catch (e) {}
      }
    }

    setTimeout(() => {
      console.log('[Supervisor] Shutdown complete.');
      process.exit(0);
    }, 2000);
  }
}

const supervisor = new ProcessSupervisor();
supervisor.startAll();

process.on('SIGINT', () => supervisor.shutdown());
process.on('SIGTERM', () => supervisor.shutdown());
