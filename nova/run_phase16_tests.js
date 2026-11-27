import os from 'os';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import axios from 'axios';
import express from 'express';
import { spawn, spawnSync } from 'child_process';

const WORK_ROOT = path.resolve('nova/data/sentinel_disposable_test/phase16_workspace');
const ISOLATED_DB_DIR = path.resolve('nova/data/sentinel_disposable_test/phase16_isolated');
const ISOLATED_DB_PATH = path.join(ISOLATED_DB_DIR, 'phase16.sqlite');
const PROD_DB_PATH = path.resolve('nova/data/nova.sqlite');
const DELIVERABLES_DIR = path.resolve('nova/deliverables');

fs.mkdirSync(WORK_ROOT, { recursive: true });
fs.mkdirSync(ISOLATED_DB_DIR, { recursive: true });
for (const ext of ['', '-wal', '-shm']) {
  const f = ISOLATED_DB_PATH + ext;
  if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (_) {}
}

process.env.NOVA_DB_PATH = ISOLATED_DB_PATH;
process.env.ZERO_COST_LOCAL_ONLY = 'true';
process.env.OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
process.env.OLLAMA_MODEL = 'qwen3.5:4b';
process.env.JARVIS_AGENT_TOKEN = process.env.JARVIS_AGENT_TOKEN || 'nova-local-agent-secure-token-2026';

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function killPidForce(pid) {
  if (!pid) return;
  try { spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true }); } catch (_) {}
}

async function ensureOllama() {
  try {
    const r = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 2000 });
    if (r.status === 200) return { proc: null, started: false };
  } catch (_) {}
  const proc = spawn('ollama', ['serve'], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 20; i++) {
    try {
      const r = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 1000 });
      if (r.status === 200) return { proc, started: true };
    } catch (_) {}
    await new Promise(r => setTimeout(r, 400));
  }
  return { proc, started: true };
}

async function ensurePythonAgent() {
  const healthUrl = 'http://127.0.0.1:8000/health';
  // Always restart cleanly during Phase 16 validation so latest perception.py / desktop.py changes are active
  try {
    spawnSync('powershell', ['-NoProfile', '-Command', "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"], { windowsHide: true });
    await new Promise(r => setTimeout(r, 700));
  } catch (_) {}

  const pyProc = spawn('python', ['nova/python-agent/agent.py'], {
    cwd: path.resolve('.'),
    env: { ...process.env, JARVIS_AGENT_TOKEN: process.env.JARVIS_AGENT_TOKEN },
    stdio: 'ignore',
    windowsHide: true
  });
  for (let i = 0; i < 30; i++) {
    try {
      const r = await axios.get(healthUrl, { timeout: 1000 });
      if (r.status === 200) return { proc: pyProc, started: true };
    } catch (_) {}
    await new Promise(r => setTimeout(r, 350));
  }
  throw new Error('Failed to start Phase 16 Python Automation Agent on 127.0.0.1:8000');
}

async function spawnTestApp(mode = 'normal', title = 'JARVIS Phase16 Real Test App') {
  const statePath = path.join(WORK_ROOT, `state_${mode}_${Date.now()}.json`);
  const scriptPath = path.join(WORK_ROOT, 'test_desktop_app.py');
  const proc = spawn('python', [scriptPath, statePath, title, mode], {
    cwd: WORK_ROOT,
    detached: true,
    stdio: 'ignore'
  });
  const token = process.env.JARVIS_AGENT_TOKEN;
  let win = null;
  for (let i = 0; i < 25; i++) {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/desktop/windows', {
        headers: { Authorization: `Bearer ${token}` }, timeout: 2500
      });
      win = (res.data?.windows || []).find(w => w.title === title || w.pid === proc.pid);
      if (win) break;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return { proc, win, statePath, title, pids: [proc.pid, win?.pid].filter(Boolean) };
}

function readAppState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch (_) { return {}; }
}

const CLOUD_LLM_HOSTS = ['api.groq.com', 'generativelanguage.googleapis.com', 'openrouter.ai', 'api.mistral.ai', 'api.openai.com', 'api.anthropic.com', 'ollama.com'];

function installNetworkMonitor() {
  const reqs = [];
  const iId = axios.interceptors.request.use(cfg => {
    try {
      const u = new URL(cfg.url);
      reqs.push({ host: u.hostname, url: cfg.url, ts: new Date().toISOString() });
    } catch (_) {}
    return cfg;
  });
  return { reqs, restore: () => axios.interceptors.request.eject(iId) };
}

async function main() {
  const prodHashBefore = sha256File(PROD_DB_PATH);
  const netMon = installNetworkMonitor();
  const children = [];

  console.log('================================================================================');
  console.log('JARVIS OS 2.0 — PHASE 16 AUTONOMOUS COMPUTER INTELLIGENCE SUITE (28 REAL TESTS)');
  console.log('================================================================================');

  let pyAgent = { proc: null, started: false };
  let mainApp = null;
  let webSrv = null;
  let webPort = null;

  try {
    const { initDatabase, run, query, get } = await import('./backend/database/db.js');
    const { default: VisualPerceptionService, sanitizeUntrustedScreenText } = await import('./backend/services/visualPerceptionService.js');
    const { default: ComputerUnderstandingService } = await import('./backend/services/computerUnderstandingService.js');
    const { default: ComputerControlService } = await import('./backend/services/computerControlService.js');
    const { default: VisionService } = await import('./backend/services/visionService.js');
    const { default: ToolRegistry } = await import('./backend/tools/registry.js');
    const { default: computerRouter } = await import('./backend/routes/computer.js');

    await initDatabase();
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('python_agent_url', 'http://127.0.0.1:8000', ?)", [new Date().toISOString()]);
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('python_agent_token', ?, ?)", [process.env.JARVIS_AGENT_TOKEN, new Date().toISOString()]);

    const ollama = await ensureOllama();
    if (ollama.proc) children.push(ollama.proc.pid);

    pyAgent = await ensurePythonAgent();
    if (pyAgent.proc) children.push(pyAgent.proc.pid);

    // Local real HTML test page for Playwright browser interaction
    webSrv = http.createServer((req, res) => {
      if (req.url === '/submitted') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><title>Submitted OK</title><body><h1 id="done">PHASE16_BROWSER_SUBMITTED</h1></body></html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><head><title>Phase 16 Local Portal</title></head><body>
        <h1>JARVIS Browser Console</h1>
        <input id="note" type="text" placeholder="Note" />
        <input id="secret_pw" type="password" placeholder="Password" />
        <button id="go" onclick="document.getElementById('status').innerText='BROWSER_CLICK_VERIFIED'">Execute Query</button>
        <p id="status">IDLE</p>
      </body></html>`);
    });
    await new Promise(res => webSrv.listen(0, '127.0.0.1', res));
    webPort = webSrv.address().port;

    const results = [];
    async function runTest(id, category, name, fn) {
      const t0 = Date.now();
      try {
        const out = await fn();
        const entry = {
          id, category, name,
          status: out.passed ? 'PASS' : 'FAIL',
          duration_ms: Date.now() - t0,
          evidence: out.evidence || {},
          failure_reason: out.passed ? null : (out.failure_reason || 'Assertion failed')
        };
        results.push(entry);
        console.log(`[${entry.status}] ${id} (${entry.duration_ms}ms) — ${name}${entry.failure_reason ? ' | ' + entry.failure_reason : ''}`);
        return entry;
      } catch (err) {
        const entry = { id, category, name, status: 'FAIL', duration_ms: Date.now() - t0, evidence: {}, failure_reason: err.message };
        results.push(entry);
        console.log(`[FAIL] ${id} (${entry.duration_ms}ms) — ${name} | ${err.message}`);
        return entry;
      }
    }

    // Spawn main real desktop app for tests
    mainApp = await spawnTestApp('normal', 'JARVIS Phase16 Real Test App');
    if (!mainApp.win) throw new Error('Test desktop WinForms window did not render');
    mainApp.pids.forEach(p => children.push(p));
    const mainHwnd = mainApp.win.hwnd;

    // Focus main test app once cleanly
    await axios.post('http://127.0.0.1:8000/api/desktop/window-action', { hwnd: mainHwnd, action: 'focus' }, {
      headers: { Authorization: `Bearer ${process.env.JARVIS_AGENT_TOKEN}` }
    });
    await new Promise(r => setTimeout(r, 250));

    // T01: Default permission denied cleanly before opt-in
    await runTest('T01_PERMISSION_DEFAULT_DENIED', 'Security & Permission', 'Screen observation blocks cleanly when explicit permission is false', async () => {
      await VisualPerceptionService.setScreenPermission(false, 't01');
      const obs = await VisualPerceptionService.observe({ hwnd: mainHwnd, sessionId: 'p16-t01' });
      return { passed: !obs.success && obs.permission_denied === true, evidence: { status: obs.permission_denied } };
    });

    // T02: Permission audit logging
    await runTest('T02_PERMISSION_OPT_IN_AND_AUDIT', 'Security & Permission', 'Granting explicit permission enables observation and logs audit trail', async () => {
      const g = await VisualPerceptionService.setScreenPermission(true, 't02_operator');
      const logs = await query("SELECT * FROM activity_logs WHERE action = 'Screen Observation Permission' ORDER BY timestamp DESC LIMIT 2");
      return { passed: g.screen_permission_granted === true && logs.length >= 2, evidence: { count: logs.length } };
    });

    // T03: Real desktop + window screenshot capture (anti-mock verification)
    let firstObs = null;
    await runTest('T03_REAL_SCREENSHOT_NO_MOCK', 'Visual Perception', 'Captures genuine desktop and window pixels with non-synthetic verification', async () => {
      const obs = await VisualPerceptionService.observe({ hwnd: mainHwnd, mode: 'window', sessionId: 'p16-t03', includeImage: true });
      firstObs = obs;
      const valid = obs.success && obs.synthetic === false && obs.width >= 400 && obs.height >= 300 && obs.non_black_pixels > 50000 && !String(obs.capture_method || '').includes('diagnostic');
      return { passed: valid, evidence: { method: obs.capture_method, width: obs.width, height: obs.height, non_black_pixels: obs.non_black_pixels, sha256: obs.pixel_sha256 } };
    });

    // T04: Full desktop screenshot capture
    await runTest('T04_REAL_FULL_DESKTOP_CAPTURE', 'Visual Perception', 'Full desktop ImageGrab captures genuine 1920x1080 interactive screen', async () => {
      const obs = await VisualPerceptionService.observe({ mode: 'desktop', sessionId: 'p16-t04', includeOcr: false, includeUiTree: true });
      return { passed: obs.success && obs.synthetic === false && obs.width >= 1024 && obs.height >= 720, evidence: { method: obs.capture_method, size: `${obs.width}x${obs.height}` } };
    });

    // T05: OCR extraction from live GUI window
    await runTest('T05_WINRT_OCR_REAL_EXTRACTION', 'Visual Perception', 'Windows WinRT OCR extracts real visible text from GUI application window', async () => {
      const txt = firstObs?.ocr?.full_text_sanitized || '';
      const hit = /STATUS|READY_IDLE|Execute Alpha|JARVIS|Computer Intelligence/i.test(txt);
      return { passed: hit && (firstObs?.ocr?.line_count || 0) > 0, evidence: { engine: firstObs?.ocr?.engine, lines: firstObs?.ocr?.line_count, sample: txt.slice(0, 140) } };
    });

    // T06: Window identification & active app state
    await runTest('T06_WINDOW_IDENTIFICATION_AND_STATE', 'Visual Perception', 'Detects active window HWND, rect, state, and application name accurately', async () => {
      const aw = firstObs?.active_window || {};
      return { passed: Number(aw.hwnd) === Number(mainHwnd) && aw.title === 'JARVIS Phase16 Real Test App' && aw.rect?.width > 400, evidence: aw };
    });

    // T07: UIA Element tree detection (Buttons, Edits, Labels)
    await runTest('T07_UIA_CONTROLS_DETECTION', 'Visual Perception', 'Detects real UIA buttons, input fields, text elements, and exact screen coordinates', async () => {
      const els = firstObs?.elements || [];
      const hasAlphaBtn = els.some(e => (e.name || '').includes('Execute Alpha') && e.rect?.width > 20);
      const hasEdit = els.some(e => e.control_type === 'Edit');
      return { passed: els.length >= 4 && hasAlphaBtn && hasEdit, evidence: { elementsCount: els.length, hasAlphaBtn, hasEdit } };
    });

    // T08: Visual context timestamp history persisted
    await runTest('T08_TIMESTAMPED_VISUAL_CONTEXT_DB', 'Visual Perception', 'Maintains timestamped observation history in memory and SQLite computer_observations', async () => {
      const rows = await query('SELECT id, timestamp, active_hwnd, pixel_sha256 FROM computer_observations WHERE session_id = ?', ['p16-t03']);
      return { passed: rows.length === 1 && VisualPerceptionService.history.length >= 2 && Boolean(rows[0].pixel_sha256), evidence: rows[0] };
    });

    // T09: Computer understanding maps NL instruction to exact button target
    await runTest('T09_UNDERSTANDING_NL_TO_CONTROL', 'Computer Understanding', 'Maps natural language instruction to visible Execute Alpha control with high confidence', async () => {
      const st = ComputerUnderstandingService.buildDesktopState(firstObs);
      const plan = await ComputerUnderstandingService.understandAndPlan({ instruction: 'Click the Execute Alpha button', desktopState: st, useLocalAiFallback: false });
      return { passed: plan.understood && !plan.ambiguous && plan.confidence >= 0.8 && plan.plannedActions[0]?.element_name === 'Execute Alpha', evidence: plan };
    });

    // T10: Text entry + post-action verification in real Edit control
    await runTest('T10_CLOSED_LOOP_TEXT_ENTRY_VERIFIED', 'Autonomous Interaction', 'Closed-loop text entry types text into real GUI input and verifies post-observation change', async () => {
      const res = await ComputerControlService.runClosedLoopTask({
        instruction: 'Type "PHASE16_LIVE_ENTRY" into Operator Note',
        hwnd: mainHwnd,
        sessionId: 'p16-t10',
        verifyExpectedText: 'PHASE16_LIVE_ENTRY',
        useLocalAiFallback: false
      });
      return { passed: res.success && res.status === 'VERIFIED_COMPLETED', evidence: { status: res.status, reason: res.verificationReason, ocrSample: res.postObservation?.ocr?.full_text_sanitized?.slice(0, 120) } };
    });

    // T11: Button click + visual pixel diff + real app callback state verification
    await runTest('T11_CLOSED_LOOP_BUTTON_CLICK_AND_DIFF', 'Autonomous Interaction', 'Closed-loop click activates real Execute Alpha button and detects visual frame diff', async () => {
      const res = await ComputerControlService.runClosedLoopTask({
        instruction: 'Click Execute Alpha',
        hwnd: mainHwnd,
        sessionId: 'p16-t11',
        verifyExpectedText: 'ALPHA_TRIGGERED',
        useLocalAiFallback: false
      });
      const st = readAppState(mainApp.statePath);
      return {
        passed: res.success && st.clicked?.includes('Execute Alpha') && res.postObservation?.visual_diff?.visual_changed === true,
        evidence: { status: res.status, appClicked: st.clicked, diffRatio: res.postObservation?.visual_diff?.changed_pixel_ratio, ocrStatus: res.postObservation?.ocr?.full_text_sanitized?.includes('ALPHA_TRIGGERED') }
      };
    });

    // T12: Mouse scrolling & visual change verification
    await runTest('T12_MOUSE_SCROLL_AND_UI_CHANGE', 'Autonomous Interaction', 'Executes mouse scroll inside real scrollable widget and verifies pixel/widget scroll event', async () => {
      const res = await ComputerControlService.runClosedLoopTask({
        instruction: 'Scroll down',
        hwnd: mainHwnd,
        sessionId: 'p16-t12',
        useLocalAiFallback: false
      });
      const st = readAppState(mainApp.statePath);
      return { passed: res.success && st.scrolled === true && res.postObservation?.visual_diff?.visual_changed === true, evidence: { scrolled: st.scrolled, diffRatio: res.postObservation?.visual_diff?.changed_pixel_ratio } };
    });

    // T13: Keyboard hotkey (Ctrl+A / Delete or Enter) & clipboard verification
    await runTest('T13_KEYBOARD_HOTKEY_AND_CLIPBOARD', 'Autonomous Interaction', 'Keyboard hotkey and clipboard readback work accurately on live desktop', async () => {
      const h = { Authorization: `Bearer ${process.env.JARVIS_AGENT_TOKEN}` };
      await axios.post('http://127.0.0.1:8000/api/desktop/clipboard', { text: 'JARVIS_P16_CLIPBOARD_TOKEN' }, { headers: h });
      const cb = (await axios.get('http://127.0.0.1:8000/api/desktop/clipboard', { headers: h })).data;
      const hk = (await axios.post('http://127.0.0.1:8000/api/desktop/keyboard-action', { action: 'press_key', text: 'escape' }, { headers: h })).data;
      return { passed: cb.success && cb.text === 'JARVIS_P16_CLIPBOARD_TOKEN' && hk.success && hk.verified, evidence: { cbText: cb.text, hk: hk.action } };
    });

    // T14: Dialog detection (real modal dialog popup)
    await runTest('T14_REAL_MODAL_DIALOG_DETECTION', 'Dialog & Navigation', 'Clicks Open Test Dialog and detects newly appeared Confirmation Dialog in UIA/windows', async () => {
      const res = await ComputerControlService.runClosedLoopTask({
        instruction: 'Click Open Test Dialog',
        hwnd: mainHwnd,
        sessionId: 'p16-t14',
        verifyUnexpectedDialog: false,
        useLocalAiFallback: false
      });
      const dlgs = res.postObservation?.dialogs || [];
      const hasDlg = dlgs.some(d => /Confirmation Dialog/i.test(d.title || ''));
      // Now click Dismiss Notice to clean up modal dialog (and close HWND if still visible)
      const dlgWin = (await axios.get('http://127.0.0.1:8000/api/desktop/windows', { headers: { Authorization: `Bearer ${process.env.JARVIS_AGENT_TOKEN}` } })).data.windows.find(w => w.title === 'Confirmation Dialog');
      if (dlgWin) {
        await ComputerControlService.runClosedLoopTask({ instruction: 'Click Dismiss Notice', hwnd: dlgWin.hwnd, sessionId: 'p16-t14-dismiss', useLocalAiFallback: false });
        try {
          await axios.post('http://127.0.0.1:8000/api/desktop/window-action', { hwnd: dlgWin.hwnd, action: 'close', confirmed: true }, { headers: { Authorization: `Bearer ${process.env.JARVIS_AGENT_TOKEN}` } });
        } catch (_) {}
      }
      await new Promise(r => setTimeout(r, 200));
      return { passed: hasDlg, evidence: { dialogsDetected: dlgs.map(d => d.title) } };
    });

    // T15: Window switching & multi-window workflow (Notepad + Test App)
    let notepadPid = null;
    await runTest('T15_MULTI_WINDOW_SWITCH_WORKFLOW', 'Multi-Window Workflows', 'Switches foreground focus cleanly between Notepad and Test App and verifies active HWND', async () => {
      const dispTxt = path.join(WORK_ROOT, 'phase16_note.txt');
      fs.writeFileSync(dispTxt, 'Phase 16 Multi-Window Probe', 'utf-8');
      const npProc = spawn('notepad.exe', [dispTxt], { stdio: 'ignore' });
      notepadPid = npProc.pid;
      children.push(notepadPid);
      await new Promise(r => setTimeout(r, 1200));

      const sw1 = await ComputerControlService.runClosedLoopTask({ instruction: 'Switch to Notepad', sessionId: 'p16-t15a', useLocalAiFallback: false });
      const sw2 = await ComputerControlService.runClosedLoopTask({ instruction: 'Switch to JARVIS Phase16 Real Test App', sessionId: 'p16-t15b', useLocalAiFallback: false });
      return {
        passed: sw1.success && /notepad/i.test(sw1.postObservation?.active_window?.title || '') && sw2.success && Number(sw2.postObservation?.active_window?.hwnd) === Number(mainHwnd),
        evidence: { noteWin: sw1.postObservation?.active_window?.title, appWin: sw2.postObservation?.active_window?.title }
      };
    });

    // T16: Unexpected UI recovery — Stale UI coordinates after window move/resize
    await runTest('T16_RECOVERY_STALE_COORDINATES_MOVED_WINDOW', 'Adaptive UI Recovery', 'Re-acquires UIA element coordinates after physical MoveWindow shifts button position', async () => {
      await axios.post('http://127.0.0.1:8000/api/desktop/window-action', {
        hwnd: mainHwnd, action: 'move', x: 520, y: 260, width: 610, height: 495
      }, { headers: { Authorization: `Bearer ${process.env.JARVIS_AGENT_TOKEN}` } });
      await new Promise(r => setTimeout(r, 250));

      // Supply stale expected_rect at old coordinates (180, 140)
      const staleClick = (await axios.post('http://127.0.0.1:8000/api/desktop/click-element', {
        hwnd: mainHwnd,
        element_name: 'Execute Alpha',
        control_type: 'Button',
        expected_rect: { x: 185, y: 150, width: 100, height: 30 }
      }, { headers: { Authorization: `Bearer ${process.env.JARVIS_AGENT_TOKEN}` } })).data;
      return {
        passed: staleClick.success && staleClick.stale_coordinates_recovered === true && staleClick.clicked_at?.x > 520,
        evidence: { recovered: staleClick.stale_coordinates_recovered, newCoords: staleClick.clicked_at }
      };
    });

    // T17: Unexpected dialog detection blocks blind completion cleanly
    await runTest('T17_RECOVERY_UNEXPECTED_DIALOG_HALT', 'Adaptive UI Recovery', 'Detects unexpected modal dialog triggered by action and stops instead of claiming success', async () => {
      // Trigger dialog via closed loop WITHOUT dialog intent so verifyUnexpectedDialog catches it
      const res = await ComputerControlService.runClosedLoopTask({
        instruction: 'Press Open Test Dialog',
        hwnd: mainHwnd,
        sessionId: 'p16-t17',
        verifyUnexpectedDialog: true,
        useLocalAiFallback: false
      });
      // Clean up Confirmation Dialog afterward
      const dlgs = (await axios.get('http://127.0.0.1:8000/api/desktop/windows', { headers: { Authorization: `Bearer ${process.env.JARVIS_AGENT_TOKEN}` } })).data.windows;
      const dWin = dlgs.find(w => w.title === 'Confirmation Dialog');
      if (dWin) {
        await axios.post('http://127.0.0.1:8000/api/desktop/window-action', { hwnd: dWin.hwnd, action: 'close', confirmed: true }, { headers: { Authorization: `Bearer ${process.env.JARVIS_AGENT_TOKEN}` } });
      }
      return { passed: res.success === false && (res.unexpectedDialogs?.length || 0) > 0, evidence: { status: res.status, reason: res.verificationReason } };
    });

    // T18: Application crash / disappearance detection
    await runTest('T18_RECOVERY_CRASH_DETECTION', 'Adaptive UI Recovery', 'Detects disappeared/crashed target application cleanly and reports APPLICATION_CRASHED', async () => {
      const crashApp = await spawnTestApp('normal', 'JARVIS Crash Target App');
      const crashHwnd = crashApp.win.hwnd;
      crashApp.pids.forEach(p => killPidForce(p));
      await new Promise(r => setTimeout(r, 400));
      const rec = await ComputerControlService.attemptAdaptiveRecovery({
        cfg: await VisualPerceptionService.getAgentConfig(),
        targetHwnd: crashHwnd,
        targetAction: { element_name: 'Execute Alpha' },
        errDetail: 'Window invalid',
        desktopState: { dialogs: [] },
        attempt: 1,
        maxAttempts: 3
      });
      return { passed: rec.crashed === true && rec.canRetry === false && rec.type === 'CRASH_OR_WINDOW_CLOSED', evidence: rec };
    });

    // T19: Ambiguous UI detection -> refuses to guess
    await runTest('T19_AMBIGUOUS_UI_DETECTION', 'Computer Understanding', 'Stops safely with NEEDS_CLARIFICATION when duplicate identical Apply buttons exist', async () => {
      const ambApp = await spawnTestApp('ambiguous', 'JARVIS Ambiguous UI App');
      ambApp.pids.forEach(p => children.push(p));
      const res = await ComputerControlService.runClosedLoopTask({
        instruction: 'Click Apply button',
        hwnd: ambApp.win.hwnd,
        sessionId: 'p16-t19',
        useLocalAiFallback: false
      });
      ambApp.pids.forEach(p => killPidForce(p));
      return { passed: !res.success && res.status === 'NEEDS_CLARIFICATION' && res.plan?.ambiguous === true, evidence: { status: res.status, reason: res.error } };
    });

    // T20: Insufficient confidence stop
    await runTest('T20_INSUFFICIENT_CONFIDENCE_STOP', 'Adaptive UI Recovery', 'Halts safely when target control does not exist and confidence is below threshold', async () => {
      const res = await ComputerControlService.runClosedLoopTask({
        instruction: 'Click NonExistentQuantumButtonXYZ',
        hwnd: mainHwnd,
        sessionId: 'p16-t20',
        minConfidence: 0.70,
        useLocalAiFallback: false
      });
      return { passed: !res.success && (res.plan?.confidence || 0) < 0.70, evidence: { status: res.status, confidence: res.plan?.confidence, reason: res.error } };
    });

    // T21: Prompt injection through visible desktop content sanitized & isolated
    await runTest('T21_SECURITY_VISIBLE_PROMPT_INJECTION', 'Security & Isolation', 'Sanitizes visible screen OCR/UI prompt-injection payloads into [UNTRUSTED_SCREEN_CONTENT]', async () => {
      const injApp = await spawnTestApp('injection', 'JARVIS Injection Screen App');
      injApp.pids.forEach(p => children.push(p));
      const obs = await VisualPerceptionService.observe({ hwnd: injApp.win.hwnd, mode: 'window', sessionId: 'p16-t21' });
      injApp.pids.forEach(p => killPidForce(p));
      const safe = obs.ocr?.full_text_sanitized || '';
      const rawLeak = /IGNORE ALL PREVIOUS INSTRUCTIONS/i.test(safe);
      const isolated = obs.ocr?.isolated_prompt_text?.includes('[UNTRUSTED_SCREEN_CONTENT]');
      return { passed: obs.success && obs.ocr?.untrusted_content_sanitized === true && !rawLeak && isolated, evidence: { sanitizedPreview: safe.slice(0, 140) } };
    });

    // T22: Password manager protection blocks interaction
    await runTest('T22_SECURITY_PASSWORD_MANAGER_BLOCKED', 'Security & Isolation', 'Blocks autonomous automation when Bitwarden Password Manager window is targeted', async () => {
      const pwApp = await spawnTestApp('sensitive_pw', 'Bitwarden - Password Manager Vault');
      pwApp.pids.forEach(p => children.push(p));
      const res = await ComputerControlService.runClosedLoopTask({
        instruction: 'Click Execute Alpha',
        hwnd: pwApp.win.hwnd,
        sessionId: 'p16-t22',
        useLocalAiFallback: false
      });
      pwApp.pids.forEach(p => killPidForce(p));
      return { passed: !res.success && res.status === 'BLOCKED_SECURITY_POLICY', evidence: { status: res.status, error: res.error } };
    });

    // T23: Financial app & unauthorized credential entry protection
    await runTest('T23_SECURITY_FINANCIAL_AND_CREDENTIAL_BLOCKED', 'Security & Isolation', 'Blocks online banking UI and unapproved password/API key typing', async () => {
      const bankApp = await spawnTestApp('sensitive_bank', 'Online Banking Transfer Portal');
      bankApp.pids.forEach(p => children.push(p));
      const resBank = await ComputerControlService.runClosedLoopTask({
        instruction: 'Type "transfer" into Note',
        hwnd: bankApp.win.hwnd,
        sessionId: 'p16-t23a',
        useLocalAiFallback: false
      });
      bankApp.pids.forEach(p => killPidForce(p));
      const resCred = await ComputerControlService.runClosedLoopTask({
        instruction: 'Enter password="MySecretValue123" into Operator Note',
        hwnd: mainHwnd,
        sessionId: 'p16-t23b',
        approved: false,
        useLocalAiFallback: false
      });
      return {
        passed: resBank.status === 'BLOCKED_SECURITY_POLICY' && resCred.status === 'WAITING_FOR_APPROVAL',
        evidence: { bankStatus: resBank.status, credStatus: resCred.status }
      };
    });

    // T24: Sensitive destructive window-close approval enforcement
    await runTest('T24_APPROVAL_ENFORCEMENT_CLOSE_WINDOW', 'Security & Permission', 'Window close via closed-loop requires WAITING_FOR_APPROVAL and executes cleanly after approval', async () => {
      const tempApp = await spawnTestApp('normal', 'JARVIS Approval Close Target');
      tempApp.pids.forEach(p => children.push(p));
      const pre = await ComputerControlService.runClosedLoopTask({
        instruction: 'Close window',
        hwnd: tempApp.win.hwnd,
        sessionId: 'p16-t24a',
        approved: false,
        useLocalAiFallback: false
      });
      const post = await ComputerControlService.runClosedLoopTask({
        instruction: 'Close window',
        hwnd: tempApp.win.hwnd,
        sessionId: 'p16-t24b',
        approved: true,
        approvalId: pre.approvalId,
        useLocalAiFallback: false
      });
      return { passed: pre.status === 'WAITING_FOR_APPROVAL' && post.success === true, evidence: { preStatus: pre.status, postStatus: post.status } };
    });

    // T25: Browser interaction + password-field approval block on local Playwright page
    await runTest('T25_REAL_BROWSER_INTERACT_AND_PW_GUARD', 'Browser & Dialog Interaction', 'Playwright interacts with local page controls and blocks unapproved password fill', async () => {
      const url = `http://127.0.0.1:${webPort}/`;
      const clickOut = await ToolRegistry.executeTool('browser_interact', {
        url, action: 'click', selector: '#go', headless: true
      });
      const pwBlock = await ToolRegistry.executeTool('browser_interact', {
        url, action: 'fill', selector: '#secret_pw', text: 'secret123', confirmed: false, headless: true
      });
      return {
        passed: clickOut.success && clickOut.visible_text?.includes('BROWSER_CLICK_VERIFIED') && !pwBlock.success && /approval|password/i.test(pwBlock.error || ''),
        evidence: { title: clickOut.title, verifiedText: clickOut.visible_text?.includes('BROWSER_CLICK_VERIFIED'), pwBlockErr: pwBlock.error }
      };
    });

    // T26: ToolRegistry + local qwen3.5:4b VisionService analysis
    await runTest('T26_LOCAL_VISION_SERVICE_AND_TOOLS', 'Tool & AI Integration', 'VisionService & ToolRegistry analyze live UIA+OCR desktop locally with zero cloud calls', async () => {
      const vs = await VisionService.analyzeScreen({ mode: 'identify_ui', customPrompt: 'Execute Alpha' });
      const obsTool = await ToolRegistry.executeTool('computer_observe_screen', { hwnd: mainHwnd, mode: 'window' });
      return { passed: vs.success && /local-/i.test(vs.provider) && obsTool.success && obsTool.elements_count > 0, evidence: { provider: vs.provider, elements: obsTool.elements_count } };
    });

    // T27: Dashboard Live State & HTTP API endpoint verification
    await runTest('T27_COMPUTER_INTELLIGENCE_DASHBOARD_API', 'Dashboard & Audit', 'GET /api/computer/intelligence/state returns permission, active app, UI elements, recovery & audit trail', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/computer', computerRouter);
      const apiSrv = http.createServer(app);
      await new Promise(r => apiSrv.listen(0, '127.0.0.1', r));
      const port = apiSrv.address().port;
      let payload;
      try {
        payload = (await axios.get(`http://127.0.0.1:${port}/api/computer/intelligence/state`, { timeout: 5000 })).data;
      } finally { apiSrv.close(); }
      const st = payload?.state || {};
      const valid = payload?.success === true && st.screen_permission_granted === true && Boolean(st.active_app) && (st.detected_elements?.length || 0) > 0 && (payload.recentAudit?.length || 0) >= 8;
      return { passed: valid, evidence: { status: st.status, active_app: st.active_app, elements: st.detected_elements?.length, auditRows: payload.recentAudit?.length } };
    });

    // T28: Complete computer-action audit trail & zero-cloud / prod-DB intact
    await runTest('T28_AUDIT_TRAIL_ZERO_CLOUD_PROD_DB_INTACT', 'Security & Isolation', 'Complete computer_action_audit logged, 0 cloud LLM requests, prod DB unchanged byte-for-byte', async () => {
      const auditCount = (await query('SELECT COUNT(*) as c FROM computer_action_audit'))[0]?.c || 0;
      const obsCount = (await query('SELECT COUNT(*) as c FROM computer_observations'))[0]?.c || 0;
      const cloudHits = netMon.reqs.filter(r => CLOUD_LLM_HOSTS.some(h => r.host.includes(h)));
      const prodHashAfter = sha256File(PROD_DB_PATH);
      return {
        passed: auditCount >= 8 && obsCount >= 8 && cloudHits.length === 0 && prodHashBefore === prodHashAfter,
        evidence: { auditCount, obsCount, totalHttpReqs: netMon.reqs.length, cloudLlmHits: cloudHits.length, prodDbPreserved: prodHashBefore === prodHashAfter, prodDbSha256: prodHashAfter }
      };
    });

    const summary = {
      suite: 'PHASE_16_AUTONOMOUS_COMPUTER_INTELLIGENCE',
      timestamp: new Date().toISOString(),
      model: 'qwen3.5:4b',
      endpoint: 'http://127.0.0.1:11434',
      total_tests: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      pass_rate_percent: Number(((results.filter(r => r.status === 'PASS').length / results.length) * 100).toFixed(1)),
      prod_db_preserved: prodHashBefore === sha256File(PROD_DB_PATH),
      prod_db_sha256: sha256File(PROD_DB_PATH)
    };

    fs.writeFileSync(path.join(DELIVERABLES_DIR, 'PHASE_16_TEST_RESULTS.json'), JSON.stringify({ summary, results }, null, 2), 'utf-8');
    console.log('\n' + '='.repeat(80));
    console.log(`PHASE 16 COMPLETE: ${summary.passed}/${summary.total_tests} PASS (${summary.pass_rate_percent}%) | Prod DB Preserved=${summary.prod_db_preserved}`);
    console.log('='.repeat(80));
  } finally {
    netMon.restore();
    for (const pid of children) killPidForce(pid);
    if (webSrv) try { webSrv.close(); } catch (_) {}
  }
  process.exit(0);
}

main().catch(err => {
  console.error('[Phase 16 Fatal Error]', err);
  process.exit(1);
});
