/**
 * JARVIS OS 2.0 — PHASE 21: PROJECT AEGIS SERVICE
 *
 * Guided, human-authorized, AI-executed production readiness programme.
 * Manages Gates 0-7 definitions, beginner-friendly preparation guides,
 * automated readiness checks, operator approvals, and live evidence loading.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';

const DELIVERABLES_DIR = path.resolve('nova/deliverables');

export const AEGIS_GATES = [
  {
    id: 'gate-0',
    number: 0,
    title: 'Environment & Safety Preparation',
    purpose: 'Create a clean Git checkpoint, back up production data, and verify runtimes before any test runs.',
    requires_physical: false,
    steps: [
      { step: 1, title: 'Create Git checkpoint', what: 'Initialize Git in Jarvis and commit baseline', why: 'Allows instant rollback if anything breaks', where: 'PowerShell in Jarvis folder', command: 'git init && git add . && git commit -m "Gate 0 baseline"', expected: 'Clean working tree on main', on_fail: 'Configure git user.name and user.email first', automatable: true },
      { step: 2, title: 'Create Phase 21 branch', what: 'Switch to phase-21-aegis branch', why: 'Isolates Phase 21 work from main', where: 'PowerShell', command: 'git checkout -b phase-21-aegis', expected: 'Switched to branch phase-21-aegis', on_fail: 'Check git status for uncommitted conflicts', automatable: true },
      { step: 3, title: 'Back up production database', what: 'Copy nova.sqlite to nova/data/backups/', why: 'Protects your real memories and missions', where: 'PowerShell', command: 'Copy-Item nova\\data\\nova.sqlite nova\\data\\backups\\nova_pre_phase21_backup.sqlite', expected: 'Backup SHA-256 matches production DB', on_fail: 'Close programs locking nova.sqlite', automatable: true },
      { step: 4, title: 'Start Ollama & verify qwen3.5:4b', what: 'Ensure local AI engine is running', why: 'Zero-cost local-only inference', where: 'Start Menu -> Ollama or PowerShell', command: 'ollama list', expected: 'qwen3.5:4b appears in model list', on_fail: 'Run ollama pull qwen3.5:4b', automatable: true },
      { step: 5, title: 'Windows power & background apps', what: 'Disable sleep on AC power and close heavy apps', why: 'Prevents sleep interruptions and RAM contention', where: 'Windows Settings -> Power & battery', command: 'Set Sleep when plugged in = Never', expected: 'PC stays awake during testing', on_fail: 'Plug in charger first', automatable: false }
    ]
  },
  {
    id: 'gate-1',
    number: 1,
    title: 'System Baseline',
    purpose: 'Verify Ollama, Node backend, Python agent, SQLite/WAL, WebSockets, scheduler, and hardware baseline.',
    requires_physical: false,
    steps: [
      { step: 1, title: 'Verify local services', what: 'Confirm Ollama (11434), Node (5000), and Python Agent (8000) respond', why: 'All subsystems must be healthy before stress testing', where: 'Automated by AEGIS runner', command: 'Invoke-RestMethod http://127.0.0.1:11434/api/tags', expected: 'HTTP 200 and qwen3.5:4b listed', on_fail: 'Start stopped service and re-check', automatable: true }
    ]
  },
  {
    id: 'gate-2',
    number: 2,
    title: 'Resource Resilience',
    purpose: 'Test bounded concurrency (1, 3, 5, 10 missions), backpressure, CPU/RAM safety thresholds, and model reload.',
    requires_physical: false,
    steps: [
      { step: 1, title: 'Ensure free RAM headroom', what: 'Keep heavy browser tabs closed', why: 'Prevents host memory exhaustion during concurrency tests', where: 'Windows Task Manager', command: 'Close unused apps', expected: 'At least 2 GB free RAM', on_fail: 'AEGIS automatically halts load before exhaustion', automatable: false }
    ]
  },
  {
    id: 'gate-3',
    number: 3,
    title: 'Autonomous Computer Intelligence',
    purpose: 'Verify desktop window detection, Notepad/Calculator/Explorer interaction, screenshots, OCR, and recovery.',
    requires_physical: true,
    steps: [
      { step: 1, title: 'Prepare disposable desktop folder', what: 'Use only nova/data/sentinel_disposable_test/aegis_workspace', why: 'Never touch personal documents', where: 'File Explorer', command: 'Open aegis_workspace', expected: 'Sample test files visible', on_fail: 'Re-run workspace preparation', automatable: true }
    ]
  },
  {
    id: 'gate-4',
    number: 4,
    title: 'Security & Self-Evolution',
    purpose: 'Run OS-isolated adversarial tests: prompt injection, sandbox escape, credential/network isolation, and rollback.',
    requires_physical: false,
    steps: [
      { step: 1, title: 'Verify isolated sandbox', what: 'Confirm tests run in isolated VM/process', why: 'Host and production files must never be touched', where: 'Automated by AEGIS', command: 'Run Gate 4 isolated suite', expected: 'All hostile payloads blocked; production SHA-256 unchanged', on_fail: 'Inspect AEGIS_FAILURES.md', automatable: true }
    ]
  },
  {
    id: 'gate-5',
    number: 5,
    title: 'Android Device Pairing & Testing',
    purpose: 'Connect a physical Android phone via USB/ADB, build/install Companion APK, and test live sync & handoffs.',
    requires_physical: true,
    steps: [
      { step: 1, title: 'Enable USB Debugging on phone', what: 'Settings -> About phone -> Tap Build number 7x -> Developer options -> USB debugging ON', why: 'Allows ADB to install and verify the companion app', where: 'Physical Android phone', command: 'Enable USB debugging & tap Allow on RSA popup', expected: 'Phone shows USB debugging connected', on_fail: 'Try a data-capable USB cable and switch USB mode to File Transfer', automatable: false },
      { step: 2, title: 'Verify ADB connection', what: 'Check phone appears as authorized device', why: 'Cannot test physical hardware without authorized ADB device', where: 'PowerShell', command: 'C:\\Users\\digvi\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe devices', expected: '<serial>  device', on_fail: 'If unauthorized, unlock phone and accept RSA prompt. If empty, Gate 5 physical tests remain NOT_TESTED.', automatable: true }
    ]
  },
  {
    id: 'gate-6',
    number: 6,
    title: 'Unfamiliar Real-World Objectives',
    purpose: 'Execute unhardcoded multi-step objectives and verify actual deliverables on disk.',
    requires_physical: false,
    steps: [
      { step: 1, title: 'Authorize disposable real-world objectives', what: 'Approve running unfamiliar objectives in aegis_workspace', why: 'Proves real planning and independent verification', where: 'AEGIS Testing Centre', command: 'Authorize Gate 6', expected: 'Deliverables verified on disk', on_fail: 'Review mission provenance & failure log', automatable: true }
    ]
  },
  {
    id: 'gate-7',
    number: 7,
    title: 'Independent Final Audit',
    purpose: 'Audit evidence across Gates 0-6, classify every scenario truthfully, and generate all 13 AEGIS deliverables.',
    requires_physical: false,
    steps: [
      { step: 1, title: 'Generate final audit & evidence manifest', what: 'Compile PASS / FAIL / PARTIALLY_VERIFIED / NOT_TESTED / BLOCKED verdicts', why: 'Ensures untested items are never hidden as PASS', where: 'Automated by AEGIS', command: 'Compile AEGIS_FINAL_AUDIT_REPORT.md', expected: 'All 13 deliverables written and verified', on_fail: 'Check missing gate reports', automatable: true }
    ]
  }
];

export class AegisService {
  constructor() {
    this.approvals = {};
    this.checklist = {};
  }

  loadJsonSafe(filePath, fallback = null) {
    try {
      if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {}
    return fallback;
  }

  loadJsonlSafe(filePath, limit = 50) {
    try {
      if (!fs.existsSync(filePath)) return [];
      const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
    } catch (_) {
      return [];
    }
  }

  async checkReadiness(gateId) {
    const checks = [];
    let ollamaOk = false;
    try {
      const r = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 1500 });
      ollamaOk = r.status === 200;
    } catch (_) {}
    checks.push({ name: 'Ollama Local AI (127.0.0.1:11434)', ok: ollamaOk, detail: ollamaOk ? 'Online' : 'Offline — start ollama serve' });

    const backupExists = fs.existsSync(path.resolve('nova/data/backups/nova_pre_phase21_backup.sqlite'));
    checks.push({ name: 'Production DB Backup', ok: backupExists, detail: backupExists ? 'Verified' : 'Missing backup' });

    const isoExists = fs.existsSync(path.resolve('nova/data/sentinel_disposable_test/aegis_isolated'));
    checks.push({ name: 'Isolated Test Workspace', ok: isoExists, detail: isoExists ? 'Ready' : 'Missing folder' });

    const ready = checks.every(c => c.ok);
    return { gate_id: gateId, ready, verdict: ready ? 'READY' : 'NOT_READY', checks, checked_at: new Date().toISOString() };
  }

  approveGate(gateId, operator = 'Operator') {
    this.approvals[gateId] = { approved: true, approved_by: operator, approved_at: new Date().toISOString() };
    return this.approvals[gateId];
  }

  toggleChecklistItem(itemId, checked) {
    this.checklist[itemId] = !!checked;
    return { item_id: itemId, checked: this.checklist[itemId] };
  }

  getStatus() {
    const testResults = this.loadJsonSafe(path.join(DELIVERABLES_DIR, 'AEGIS_TEST_RESULTS.json'), null);
    const manifest = this.loadJsonSafe(path.join(DELIVERABLES_DIR, 'AEGIS_EVIDENCE_MANIFEST.json'), null);
    const telemetry = this.loadJsonlSafe(path.join(DELIVERABLES_DIR, 'AEGIS_TELEMETRY.jsonl'), 40);
    const events = this.loadJsonlSafe(path.join(DELIVERABLES_DIR, 'AEGIS_EVENTS.jsonl'), 40);
    let failuresMd = '';
    try {
      const fp = path.join(DELIVERABLES_DIR, 'AEGIS_FAILURES.md');
      if (fs.existsSync(fp)) failuresMd = fs.readFileSync(fp, 'utf8');
    } catch (_) {}

    return {
      programme: 'JARVIS OS 2.0 — Phase 21: Project AEGIS',
      gates: AEGIS_GATES,
      approvals: this.approvals,
      checklist: this.checklist,
      test_results: testResults,
      evidence_manifest: manifest,
      telemetry,
      events,
      failures_md: failuresMd
    };
  }
}

let instance = null;
export function getAegisService() {
  if (!instance) instance = new AegisService();
  return instance;
}
export default AegisService;
