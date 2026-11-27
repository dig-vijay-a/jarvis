import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

export class EvolutionSandboxService {
  constructor(options = {}) {
    this.baseSandboxDir = options.baseSandboxDir || path.resolve(process.cwd(), 'nova', 'sandbox', 'experiments');
    this.defaultTimeoutMs = options.defaultTimeoutMs || 3000; // 3-second hard timeout
    this.ensureBaseDirectory();
  }

  ensureBaseDirectory() {
    try {
      if (!fs.existsSync(this.baseSandboxDir)) {
        fs.mkdirSync(this.baseSandboxDir, { recursive: true });
      }
    } catch (_) {}
  }

  /**
   * Sanitizes environment variables to isolate production credentials.
   * GUARANTEE: No API keys, database credentials, or secret tokens enter sandbox.
   */
  getIsolatedEnv() {
    return {
      NODE_ENV: 'sandbox_test',
      IS_EVOLUTION_SANDBOX: 'true',
      JARVIS_ENV: 'isolated_experimental'
      // All sensitive keys stripped: GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, etc.
    };
  }

  /**
   * Executes a skill or script in the isolated sandbox.
   */
  async runExperiment({
    proposal_id = null,
    skill_id,
    code,
    inputs = {},
    timeoutMs = null
  }) {
    if (!skill_id || !code) {
      throw new Error('skill_id and code are required for sandbox experiment.');
    }

    // 1. Duplicate Experiment Prevention (Invariant 16)
    const activeExp = await get(
      `SELECT id FROM evolution_experiments WHERE skill_id = ? AND status = 'RUNNING'`,
      [skill_id]
    );
    if (activeExp) {
      throw new Error(`DUPLICATE_EXPERIMENT: An experiment is already actively running for skill '${skill_id}' (Experiment: ${activeExp.id}).`);
    }

    const experimentId = `exp-${uuidv4().substring(0, 8)}`;
    const experimentDir = path.join(this.baseSandboxDir, experimentId);
    fs.mkdirSync(experimentDir, { recursive: true });

    const timeout = timeoutMs || this.defaultTimeoutMs;
    const nowIso = new Date().toISOString();

    await run(
      `INSERT INTO evolution_experiments
        (id, proposal_id, skill_id, sandbox_dir, status, resource_usage_json, execution_logs, started_at)
       VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?)`,
      [
        experimentId,
        proposal_id,
        skill_id,
        experimentDir,
        JSON.stringify({ memory_mb_start: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) }),
        'Experiment started.',
        nowIso
      ]
    );

    const logs = [];
    const log = (msg) => logs.push(`[${new Date().toISOString()}] ${msg}`);
    log(`Initialized sandbox in: ${experimentDir}`);

    let executionResult = null;
    let executionError = null;
    let resourceUsage = {};

    try {
      // 2. Sandboxed Virtual Machine Context with Restricted APIs
      const sandboxFs = {
        // Filesystem Isolation Guard (Invariant 5)
        writeFileSync: (fileName, content) => {
          const resolved = path.resolve(experimentDir, fileName);
          if (!resolved.startsWith(experimentDir)) {
            throw new Error(`SANDBOX_FILESYSTEM_VIOLATION: Attempted path escape to '${fileName}'. Access restricted to sandbox.`);
          }
          return fs.writeFileSync(resolved, content, 'utf8');
        },
        readFileSync: (fileName) => {
          const resolved = path.resolve(experimentDir, fileName);
          if (!resolved.startsWith(experimentDir)) {
            throw new Error(`SANDBOX_FILESYSTEM_VIOLATION: Attempted read path escape to '${fileName}'. Access restricted to sandbox.`);
          }
          return fs.readFileSync(resolved, 'utf8');
        },
        existsSync: (fileName) => {
          const resolved = path.resolve(experimentDir, fileName);
          return resolved.startsWith(experimentDir) && fs.existsSync(resolved);
        }
      };

      // Network Restriction Guard (Invariant 6)
      const restrictedNetwork = {
        fetch: () => {
          throw new Error('SANDBOX_NETWORK_VIOLATION: Direct outbound HTTP networking is disabled in the evolution sandbox.');
        },
        connect: () => {
          throw new Error('SANDBOX_NETWORK_VIOLATION: Raw socket connections are disabled in the evolution sandbox.');
        }
      };

      const contextObj = {
        console: {
          log: (...args) => log(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
          warn: (...args) => log(`[WARN] ${args.join(' ')}`),
          error: (...args) => log(`[ERROR] ${args.join(' ')}`)
        },
        env: this.getIsolatedEnv(), // Isolated Credentials (Invariant 7)
        fs: sandboxFs,
        network: restrictedNetwork,
        inputs: inputs || {},
        result: null,
        executionError: null,
        setTimeout: (fn, delay) => {
          if (delay > timeout) throw new Error('TIMER_EXCEEDED: Sandbox timer exceeds permitted execution window.');
          return setTimeout(fn, delay);
        }
      };

      const vmContext = vm.createContext(contextObj);

      // Wrapper script ensuring result assignment and safe error capture
      const wrappedScript = `
        (async function run() {
          try {
            ${code}
          } catch (err) {
            executionError = err ? (err.message || String(err)) : 'Unknown sandbox error';
          }
        })().then(res => {
          if (res !== undefined) result = res;
        }).catch(err => {
          executionError = err ? (err.message || String(err)) : 'Unknown promise rejection';
        });
      `;

      const startMem = process.memoryUsage().heapUsed;
      const startTime = Date.now();

      // Resource and Execution Limit Guard (Invariant 8)
      const script = new vm.Script(wrappedScript);
      script.runInContext(vmContext, { timeout });

      // Allow microtasks to complete within timeout
      await new Promise(r => setTimeout(r, 100));

      if (contextObj.executionError) {
        throw new Error(contextObj.executionError);
      }

      const durationMs = Date.now() - startTime;
      const endMem = process.memoryUsage().heapUsed;
      const memDeltaMb = ((endMem - startMem) / 1024 / 1024).toFixed(3);

      resourceUsage = {
        duration_ms: durationMs,
        memory_delta_mb: parseFloat(memDeltaMb),
        timeout_limit_ms: timeout
      };

      executionResult = contextObj.result !== null ? contextObj.result : { status: 'EXECUTION_SUCCESS' };
      log(`Experiment completed in ${durationMs}ms with result: ${JSON.stringify(executionResult)}`);

      const endIso = new Date().toISOString();
      await run(
        `UPDATE evolution_experiments 
         SET status = 'COMPLETED', resource_usage_json = ?, execution_logs = ?, completed_at = ?
         WHERE id = ?`,
        [JSON.stringify(resourceUsage), logs.join('\n'), endIso, experimentId]
      );

      return {
        success: true,
        experiment_id: experimentId,
        sandbox_dir: experimentDir,
        status: 'COMPLETED',
        resource_usage: resourceUsage,
        result: executionResult,
        logs
      };

    } catch (err) {
      executionError = err.message;
      log(`Experiment execution failed: ${err.message}`);

      const endIso = new Date().toISOString();
      await run(
        `UPDATE evolution_experiments 
         SET status = 'FAILED', error = ?, resource_usage_json = ?, execution_logs = ?, completed_at = ?
         WHERE id = ?`,
        [executionError, JSON.stringify(resourceUsage), logs.join('\n'), endIso, experimentId]
      );

      return {
        success: false,
        experiment_id: experimentId,
        sandbox_dir: experimentDir,
        status: 'FAILED',
        error: executionError,
        logs
      };
    }
  }

  /**
   * Cleans up experiment sandbox directory and resources.
   */
  async cleanupExperiment(experimentId) {
    const experimentDir = path.join(this.baseSandboxDir, experimentId);
    try {
      if (fs.existsSync(experimentDir)) {
        fs.rmSync(experimentDir, { recursive: true, force: true });
      }
      return { success: true, experiment_id: experimentId, cleaned: true };
    } catch (err) {
      return { success: false, experiment_id: experimentId, error: err.message };
    }
  }

  /**
   * Retrieves experiment details.
   */
  async getExperiment(experimentId) {
    const row = await get('SELECT * FROM evolution_experiments WHERE id = ?', [experimentId]);
    if (!row) return null;

    return {
      ...row,
      resource_usage: JSON.parse(row.resource_usage_json || '{}')
    };
  }
}

let instance = null;
export function getEvolutionSandboxService() {
  if (!instance) {
    instance = new EvolutionSandboxService();
  }
  return instance;
}

export default EvolutionSandboxService;
