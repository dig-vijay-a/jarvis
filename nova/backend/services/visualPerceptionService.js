import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { get, query, run } from '../database/db.js';

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions?/gi,
  /disregard\s+(?:your\s+)?system\s+prompt/gi,
  /system\s+override\s*:?/gi,
  /\byou\s+are\s+now\b[^.\n]{0,80}/gi,
  /delete_memory\b/gi,
  /execute\s+(?:arbitrary|hidden)\s+command/gi,
  /<script[^>]*>[\s\S]*?<\/script>/gi
];

/**
 * Sanitizes visible OCR / window text from untrusted desktop surfaces so visible screen
 * text can never masquerade as system or operator instructions.
 */
export function sanitizeUntrustedScreenText(rawText = '') {
  let text = String(rawText || '');
  let detected = false;
  for (const pat of INJECTION_PATTERNS) {
    if (pat.test(text)) {
      detected = true;
      text = text.replace(pat, '[REDACTED_UNTRUSTED_SCREEN_DIRECTIVE]');
    }
  }
  return {
    sanitizedText: text,
    injectionDetected: detected,
    isolatedPayload: `[UNTRUSTED_SCREEN_CONTENT]\n${text}\n[/UNTRUSTED_SCREEN_CONTENT]`
  };
}

export class VisualPerceptionService {
  static history = []; // Timestamped recent observation ring buffer (max 25)

  static async getAgentConfig() {
    const urlRow = await get("SELECT value FROM settings WHERE key = 'python_agent_url'");
    const tokenRow = await get("SELECT value FROM settings WHERE key = 'python_agent_token'");
    return {
      url: urlRow?.value ? urlRow.value.replace(/\/$/, '') : 'http://127.0.0.1:8000',
      token: tokenRow?.value || process.env.JARVIS_AGENT_TOKEN || 'nova-local-agent-secure-token-2026'
    };
  }

  static async isScreenPermissionGranted(explicitOverride = null) {
    if (explicitOverride === true) return true;
    if (explicitOverride === false) return false;
    try {
      const row = await get("SELECT value FROM settings WHERE key = 'screen_observation_permitted'");
      return String(row?.value || '').toLowerCase() === 'true';
    } catch (_) {
      return false;
    }
  }

  static async setScreenPermission(granted, updatedBy = 'operator') {
    const val = granted ? 'true' : 'false';
    const now = new Date().toISOString();
    await run(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('screen_observation_permitted', ?, ?)",
      [val, now]
    );
    await run(
      `INSERT INTO computer_control_state (id, status, screen_permission_granted, updated_at)
       VALUES ('primary', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET screen_permission_granted = excluded.screen_permission_granted, updated_at = excluded.updated_at`,
      [granted ? 'READY' : 'PERMISSION_REQUIRED', granted ? 1 : 0, now]
    );
    await run(
      'INSERT INTO activity_logs (id, action, category, details, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [`log-perm-${Date.now()}`, 'Screen Observation Permission', 'SECURITY', `Set screen_observation_permitted=${val} by ${updatedBy}`, 'success', now]
    );
    return { success: true, screen_permission_granted: Boolean(granted), updated_at: now };
  }

  /**
   * Captures a real desktop/window screenshot, runs WinRT OCR + UIA element/dialog detection,
   * compares visual diff against previous timestamped frame, and isolates untrusted text.
   */
  static async observe({
    sessionId = 'default',
    missionId = null,
    hwnd = null,
    mode = 'window',
    includeOcr = true,
    includeUiTree = true,
    includeImage = false,
    prevObservation = null,
    permissionGranted = null
  } = {}) {
    const allowed = await this.isScreenPermissionGranted(permissionGranted);
    const now = new Date().toISOString();
    const obsId = `obs-${uuidv4().slice(0, 12)}`;

    if (!allowed) {
      await run(
        `INSERT INTO computer_observations
         (id, mission_id, session_id, timestamp, active_title, permission_granted, created_at)
         VALUES (?, ?, ?, ?, 'BLOCKED_NO_SCREEN_PERMISSION', 0, ?)`,
        [obsId, missionId, sessionId, now, now]
      );
      return {
        success: false,
        permission_denied: true,
        observationId: obsId,
        timestamp: now,
        error: 'Explicit screen observation permission is required before capturing desktop frames.'
      };
    }

    const cfg = await this.getAgentConfig();
    const prevImg = prevObservation?.image || (this.history.length > 0 ? this.history[this.history.length - 1]?.image : null);

    let data;
    try {
      const resp = await axios.post(
        `${cfg.url}/api/perception/observe`,
        {
          hwnd: hwnd ? Number(hwnd) : null,
          mode,
          include_ocr: includeOcr,
          include_ui_tree: includeUiTree,
          include_image: true,
          prev_image_b64: prevImg || null,
          permission_granted: true
        },
        {
          headers: { Authorization: `Bearer ${cfg.token}` },
          timeout: 20000
        }
      );
      data = resp.data;
    } catch (err) {
      return {
        success: false,
        capture_failed: true,
        observationId: obsId,
        timestamp: now,
        error: err.response?.data?.detail || err.message
      };
    }

    if (!data?.success || data.synthetic === true) {
      return {
        success: false,
        capture_failed: true,
        observationId: obsId,
        timestamp: now,
        error: data?.error || 'Real screen observation returned non-valid or synthetic output.'
      };
    }

    const rawOcr = data.ocr?.full_text || '';
    const ocrSanitized = sanitizeUntrustedScreenText(rawOcr);

    // Sanitize element names & window titles too so UI strings cannot inject prompts
    let uiInjection = ocrSanitized.injectionDetected;
    const elements = (data.elements || []).map(el => {
      const sName = sanitizeUntrustedScreenText(el.name || '');
      if (sName.injectionDetected) uiInjection = true;
      return {
        ...el,
        name: sName.sanitizedText,
        untrusted_sanitized: sName.injectionDetected
      };
    });

    const activeWin = data.active_window ? {
      ...data.active_window,
      title: sanitizeUntrustedScreenText(data.active_window.title || '').sanitizedText
    } : null;

    const dialogs = (data.dialogs || []).map(d => ({
      ...d,
      title: sanitizeUntrustedScreenText(d.title || '').sanitizedText
    }));

    const diff = data.visual_diff || null;
    const frameChanged = Boolean(diff?.visual_changed || (prevObservation && prevObservation.pixel_sha256 && prevObservation.pixel_sha256 !== data.pixel_sha256));
    const confidence = Number((elements.length > 0 && (data.ocr?.lines?.length || 0) >= 0 && data.non_black_ratio > 0.02) ? 0.92 : 0.72);

    await run(
      `INSERT INTO computer_observations
       (id, mission_id, session_id, timestamp, width, height, capture_method, active_hwnd, active_app, active_title, ui_elements_json, dialogs_json, ocr_text_sanitized, untrusted_injection_detected, pixel_sha256, frame_changed, diff_ratio, confidence, permission_granted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        obsId,
        missionId,
        sessionId,
        data.timestamp || now,
        data.width || 0,
        data.height || 0,
        data.capture_method || 'unknown',
        activeWin?.hwnd || null,
        activeWin?.display_app || activeWin?.process_name || 'Desktop',
        activeWin?.title || 'Desktop',
        JSON.stringify(elements.slice(0, 50)),
        JSON.stringify(dialogs),
        ocrSanitized.sanitizedText.slice(0, 6000),
        uiInjection ? 1 : 0,
        data.pixel_sha256 || null,
        frameChanged ? 1 : 0,
        diff?.changed_pixel_ratio || 0,
        confidence,
        now
      ]
    );

    const record = {
      success: true,
      synthetic: false,
      observationId: obsId,
      sessionId,
      timestamp: data.timestamp || now,
      capture_method: data.capture_method,
      width: data.width,
      height: data.height,
      non_black_pixels: data.non_black_pixels,
      non_black_ratio: data.non_black_ratio,
      pixel_sha256: data.pixel_sha256,
      active_window: activeWin,
      window_count: data.window_count || 0,
      windows: data.windows || [],
      dialogs,
      elements_count: elements.length,
      elements,
      ocr: {
        engine: data.ocr?.engine || 'windows_winrt_ocr',
        line_count: data.ocr?.line_count || 0,
        lines: (data.ocr?.lines || []).map(l => ({ ...l, text: sanitizeUntrustedScreenText(l.text || '').sanitizedText })),
        full_text_sanitized: ocrSanitized.sanitizedText,
        isolated_prompt_text: ocrSanitized.isolatedPayload,
        untrusted_content_sanitized: uiInjection
      },
      visual_diff: diff ? { ...diff, frame_changed: frameChanged } : null,
      confidence,
      image: includeImage ? data.image : undefined,
      _internalImage: data.image
    };

    // Keep lightweight ring buffer with latest frame for sequential visual diff
    this.history.push({
      observationId: obsId,
      timestamp: record.timestamp,
      pixel_sha256: record.pixel_sha256,
      active_window: activeWin,
      elements_count: elements.length,
      dialogs_count: dialogs.length,
      image: data.image
    });
    if (this.history.length > 25) this.history.shift();

    return record;
  }

  static async inspectUiTree(hwnd = null) {
    const cfg = await this.getAgentConfig();
    const resp = await axios.post(
      `${cfg.url}/api/perception/ui-tree`,
      { hwnd: hwnd ? Number(hwnd) : null, max_elements: 90 },
      { headers: { Authorization: `Bearer ${cfg.token}` }, timeout: 10000 }
    );
    return resp.data;
  }

  static async getRecentObservations(limit = 15) {
    const rows = await query(
      `SELECT id, mission_id, session_id, timestamp, width, height, capture_method, active_hwnd, active_app, active_title,
              untrusted_injection_detected, pixel_sha256, frame_changed, diff_ratio, confidence, permission_granted
       FROM computer_observations ORDER BY timestamp DESC LIMIT ?`,
      [limit]
    );
    return rows;
  }
}

export default VisualPerceptionService;
