import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { get, query, run } from '../database/db.js';
import VisualPerceptionService from './visualPerceptionService.js';
import ComputerUnderstandingService from './computerUnderstandingService.js';

export class ComputerControlService {
  static wss = null;
  static pendingApprovals = new Map();

  static setWebSocketServer(wss) {
    this.wss = wss;
  }

  static broadcast(event, data) {
    if (!this.wss) return;
    const msg = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    this.wss.clients.forEach(c => {
      if (c.readyState === 1) c.send(msg);
    });
  }

  static async auditLog(entry) {
    const id = `caudit-${uuidv4().slice(0, 12)}`;
    const now = new Date().toISOString();
    await run(
      `INSERT INTO computer_action_audit
       (id, session_id, mission_id, loop_step, phase, action_type, target_app, target_title, target_element, params_json,
        pre_observation_id, post_observation_id, visual_changed, ui_changed, recovery_attempts, recovery_reason,
        approval_required, approval_status, confidence, blocked_reason, outcome_verified, error, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.sessionId || 'default',
        entry.missionId || null,
        entry.loopStep || 1,
        entry.phase || 'ACT',
        entry.actionType || 'unknown',
        entry.targetApp || null,
        entry.targetTitle || null,
        entry.targetElement || null,
        JSON.stringify(entry.params || {}),
        entry.preObservationId || null,
        entry.postObservationId || null,
        entry.visualChanged ? 1 : 0,
        entry.uiChanged ? 1 : 0,
        entry.recoveryAttempts || 0,
        entry.recoveryReason || null,
        entry.approvalRequired ? 1 : 0,
        entry.approvalStatus || 'NONE_REQUIRED',
        Number(entry.confidence || 0),
        entry.blockedReason || null,
        entry.outcomeVerified ? 1 : 0,
        entry.error || null,
        now
      ]
    );
    return id;
  }

  static async updateDashboardState(patch = {}) {
    const now = new Date().toISOString();
    const cur = await get("SELECT * FROM computer_control_state WHERE id = 'primary'");
    const next = {
      active_session_id: patch.active_session_id ?? cur?.active_session_id ?? 'default',
      status: patch.status ?? cur?.status ?? 'IDLE',
      current_task: patch.current_task !== undefined ? patch.current_task : (cur?.current_task || null),
      active_app: patch.active_app !== undefined ? patch.active_app : (cur?.active_app || null),
      active_title: patch.active_title !== undefined ? patch.active_title : (cur?.active_title || null),
      active_hwnd: patch.active_hwnd !== undefined ? patch.active_hwnd : (cur?.active_hwnd || null),
      screen_permission_granted: patch.screen_permission_granted !== undefined
        ? (patch.screen_permission_granted ? 1 : 0)
        : (cur?.screen_permission_granted ?? ((await VisualPerceptionService.isScreenPermissionGranted()) ? 1 : 0)),
      planned_actions_json: patch.planned_actions !== undefined ? JSON.stringify(patch.planned_actions) : (cur?.planned_actions_json || '[]'),
      detected_elements_json: patch.detected_elements !== undefined ? JSON.stringify(patch.detected_elements) : (cur?.detected_elements_json || '[]'),
      recovery_history_json: patch.recovery_history !== undefined ? JSON.stringify(patch.recovery_history) : (cur?.recovery_history_json || '[]'),
      last_confidence: patch.last_confidence !== undefined ? Number(patch.last_confidence) : (cur?.last_confidence || 0),
      verification_status: patch.verification_status !== undefined ? patch.verification_status : (cur?.verification_status || 'NONE'),
      updated_at: now
    };

    await run(
      `INSERT INTO computer_control_state
       (id, active_session_id, status, current_task, active_app, active_title, active_hwnd, screen_permission_granted,
        planned_actions_json, detected_elements_json, recovery_history_json, last_confidence, verification_status, updated_at)
       VALUES ('primary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        active_session_id=excluded.active_session_id, status=excluded.status, current_task=excluded.current_task,
        active_app=excluded.active_app, active_title=excluded.active_title, active_hwnd=excluded.active_hwnd,
        screen_permission_granted=excluded.screen_permission_granted, planned_actions_json=excluded.planned_actions_json,
        detected_elements_json=excluded.detected_elements_json, recovery_history_json=excluded.recovery_history_json,
        last_confidence=excluded.last_confidence, verification_status=excluded.verification_status, updated_at=excluded.updated_at`,
      [
        next.active_session_id, next.status, next.current_task, next.active_app, next.active_title,
        next.active_hwnd, next.screen_permission_granted, next.planned_actions_json,
        next.detected_elements_json, next.recovery_history_json, next.last_confidence,
        next.verification_status, now
      ]
    );
    this.broadcast('COMPUTER_INTELLIGENCE_UPDATE', next);
    return next;
  }

  /**
   * Closed-loop autonomous computer operation:
   * OBSERVE -> UNDERSTAND -> PLAN -> APPROVE IF REQUIRED -> ACT -> OBSERVE AGAIN -> VERIFY -> CONTINUE
   */
  static async runClosedLoopTask({
    instruction,
    hwnd = null,
    sessionId = `cui-${uuidv4().slice(0, 8)}`,
    missionId = null,
    approved = false,
    approvalId = null,
    minConfidence = 0.65,
    maxRecoveryAttempts = 3,
    permissionGranted = null,
    useLocalAiFallback = true,
    verifyExpectedText = null,
    verifyUnexpectedDialog = true
  } = {}) {
    const recoveryHistory = [];

    if (approvalId && this.pendingApprovals.has(approvalId)) {
      const pending = this.pendingApprovals.get(approvalId);
      if (!approved) {
        return { success: false, status: 'WAITING_FOR_APPROVAL', approvalId, pending };
      }
      this.pendingApprovals.delete(approvalId);
    }

    await this.updateDashboardState({
      active_session_id: sessionId,
      status: 'OBSERVING',
      current_task: instruction,
      planned_actions: [],
      recovery_history: [],
      verification_status: 'IN_PROGRESS'
    });

    // 1. OBSERVE
    const preObs = await VisualPerceptionService.observe({
      sessionId,
      missionId,
      hwnd,
      mode: hwnd ? 'window' : 'desktop',
      includeOcr: true,
      includeUiTree: true,
      includeImage: false,
      permissionGranted
    });

    if (!preObs.success) {
      const status = preObs.permission_denied ? 'PERMISSION_DENIED' : 'CAPTURE_FAILED';
      await this.auditLog({
        sessionId, missionId, loopStep: 1, phase: 'OBSERVE', actionType: 'observe',
        blockedReason: status, error: preObs.error, outcomeVerified: false
      });
      await this.updateDashboardState({ status, verification_status: status, last_confidence: 0 });
      return { success: false, status, sessionId, error: preObs.error, preObservation: preObs };
    }

    // 2. UNDERSTAND
    const desktopState = ComputerUnderstandingService.buildDesktopState(preObs);
    await this.updateDashboardState({
      status: 'UNDERSTANDING',
      active_app: desktopState.activeWindow?.display_app || desktopState.activeWindow?.process_name || 'Desktop',
      active_title: desktopState.activeWindow?.title || 'Desktop',
      active_hwnd: desktopState.activeWindow?.hwnd || hwnd || null,
      detected_elements: desktopState.interactiveControls.slice(0, 25),
      screen_permission_granted: 1
    });

    // 3. PLAN
    const plan = await ComputerUnderstandingService.understandAndPlan({
      instruction,
      desktopState,
      useLocalAiFallback
    });

    if (plan.blocked) {
      await this.auditLog({
        sessionId, missionId, loopStep: 1, phase: 'UNDERSTAND', actionType: 'blocked_sensitive_context',
        targetApp: desktopState.activeWindow?.display_app, targetTitle: desktopState.activeWindow?.title,
        preObservationId: preObs.observationId, confidence: plan.confidence,
        blockedReason: plan.securityReason, outcomeVerified: false
      });
      await this.updateDashboardState({
        status: 'BLOCKED_SECURITY_POLICY',
        verification_status: 'BLOCKED_SENSITIVE_UI',
        last_confidence: plan.confidence
      });
      return { success: false, status: 'BLOCKED_SECURITY_POLICY', sessionId, error: plan.securityReason, plan, preObservation: preObs };
    }

    // 3.5 APPROVE IF REQUIRED (Check before empty plannedActions so credential/sensitive blocks trigger WAITING_FOR_APPROVAL)
    if (plan.requiresApproval && !approved) {
      const apprId = `cappr-${uuidv4().slice(0, 10)}`;
      const pendingPayload = { approvalId: apprId, sessionId, instruction, plannedActions: plan.plannedActions || [], reason: plan.securityReason || 'Sensitive computer operation requires operator approval.' };
      this.pendingApprovals.set(apprId, pendingPayload);
      this.broadcast('WAITING_FOR_APPROVAL', pendingPayload);

      await this.auditLog({
        sessionId, missionId, loopStep: 1, phase: 'APPROVE', actionType: plan.plannedActions?.[0]?.type || 'sensitive_action',
        targetApp: desktopState.activeWindow?.display_app, targetTitle: desktopState.activeWindow?.title,
        params: plan.plannedActions?.[0] || { instruction }, preObservationId: preObs.observationId,
        approvalRequired: true, approvalStatus: 'WAITING_FOR_APPROVAL',
        confidence: plan.confidence, outcomeVerified: false
      });
      await this.updateDashboardState({
        status: 'WAITING_FOR_APPROVAL',
        planned_actions: plan.plannedActions || [],
        verification_status: 'PENDING_APPROVAL',
        last_confidence: plan.confidence
      });
      return { success: false, status: 'WAITING_FOR_APPROVAL', sessionId, approvalId: apprId, pendingApproval: pendingPayload, plan };
    }

    if (plan.ambiguous || plan.confidence < minConfidence || !plan.plannedActions?.length) {
      const reason = plan.ambiguityReason || `Confidence ${plan.confidence} below safe threshold ${minConfidence}`;
      await this.auditLog({
        sessionId, missionId, loopStep: 1, phase: 'PLAN', actionType: 'stop_insufficient_confidence',
        targetApp: desktopState.activeWindow?.display_app, targetTitle: desktopState.activeWindow?.title,
        preObservationId: preObs.observationId, confidence: plan.confidence,
        blockedReason: reason, outcomeVerified: false
      });
      await this.updateDashboardState({
        status: 'STOPPED_AMBIGUOUS_OR_LOW_CONFIDENCE',
        verification_status: 'INSUFFICIENT_CONFIDENCE',
        last_confidence: plan.confidence,
        planned_actions: plan.plannedActions || []
      });
      return {
        success: false,
        status: plan.ambiguous ? 'NEEDS_CLARIFICATION' : 'STOPPED_LOW_CONFIDENCE',
        sessionId,
        error: reason,
        plan,
        preObservation: preObs
      };
    }

    await this.updateDashboardState({
      status: 'ACTING',
      planned_actions: plan.plannedActions,
      last_confidence: plan.confidence
    });

    // 5. ACT + ADAPTIVE UI RECOVERY (Bounded retries)
    const cfg = await VisualPerceptionService.getAgentConfig();
    const targetAction = plan.plannedActions[0];
    const targetHwnd = hwnd || desktopState.activeWindow?.hwnd || null;
    let actResult = null;
    let attempt = 0;

    while (attempt < maxRecoveryAttempts) {
      attempt++;
      try {
        actResult = await this.dispatchAction(cfg, targetAction, targetHwnd, approved);
        if (actResult?.success) break;
        if (actResult?.blocked) {
          const bErr = new Error(actResult.error || 'Blocked by security policy');
          bErr.response = { status: 403, data: { detail: actResult.error } };
          throw bErr;
        }
        throw new Error(actResult?.error || 'Action returned success=false');
      } catch (err) {
        const statusCode = err.response?.status;
        const errDetail = err.response?.data?.detail || err.message || 'Action failed';
        if (statusCode === 403) {
          await this.auditLog({
            sessionId, missionId, loopStep: 1, phase: 'ACT', actionType: targetAction.type,
            targetApp: desktopState.activeWindow?.display_app, targetTitle: desktopState.activeWindow?.title,
            params: targetAction, preObservationId: preObs.observationId,
            recoveryAttempts: attempt - 1, blockedReason: errDetail, outcomeVerified: false, error: errDetail
          });
          await this.updateDashboardState({ status: 'BLOCKED_SECURITY_POLICY', verification_status: 'BLOCKED', recovery_history: recoveryHistory });
          return { success: false, status: 'BLOCKED_SECURITY_POLICY', sessionId, error: errDetail };
        }

        // Check if target crashed or window moved/changed before deciding recovery
        const recInfo = await this.attemptAdaptiveRecovery({
          cfg, targetHwnd, targetAction, errDetail, desktopState, attempt, maxRecoveryAttempts
        });
        recoveryHistory.push(recInfo);
        if (!recInfo.canRetry) {
          await this.auditLog({
            sessionId, missionId, loopStep: 1, phase: 'RECOVER', actionType: targetAction.type,
            targetApp: desktopState.activeWindow?.display_app, targetTitle: desktopState.activeWindow?.title,
            preObservationId: preObs.observationId, recoveryAttempts: attempt,
            recoveryReason: recInfo.reason, outcomeVerified: false, error: errDetail
          });
          await this.updateDashboardState({
            status: 'FAILED_RECOVERY_EXHAUSTED',
            verification_status: 'FAILED',
            recovery_history: recoveryHistory
          });
          return {
            success: false,
            status: recInfo.crashed ? 'APPLICATION_CRASHED' : 'FAILED_RECOVERY_EXHAUSTED',
            sessionId,
            error: recInfo.reason,
            recoveryHistory
          };
        }
        if (recInfo.updatedAction) Object.assign(targetAction, recInfo.updatedAction);
      }
    }

    // Small settle delay for real GUI repaint
    await new Promise(r => setTimeout(r, 250));

    // 6. OBSERVE AGAIN
    const postHwnd = targetAction.type === 'focus_or_launch' ? (actResult?.hwnd || null) : targetHwnd;
    const postObs = await VisualPerceptionService.observe({
      sessionId,
      missionId,
      hwnd: postHwnd,
      mode: postHwnd ? 'window' : 'desktop',
      includeOcr: true,
      includeUiTree: true,
      includeImage: false,
      prevObservation: preObs,
      permissionGranted
    });

    // 7. VERIFY (Never assume action succeeded merely because click/keys ran)
    let outcomeVerified = false;
    let verificationReason = '';
    let unexpectedDialogs = [];

    if (postObs.success) {
      const visualChanged = Boolean(postObs.visual_diff?.visual_changed || postObs.pixel_sha256 !== preObs.pixel_sha256);
      const ocrPost = String(postObs.ocr?.full_text_sanitized || '');
      const dlgKey = (d) => `${d.hwnd || ''}:${d.class_name || ''}:${d.title || ''}`;
      const preDialogs = new Set((preObs.dialogs || []).map(dlgKey));
      unexpectedDialogs = (postObs.dialogs || []).filter(d => !preDialogs.has(dlgKey(d)));
      if (unexpectedDialogs.length === 0 && (postObs.dialogs || []).length > (preObs.dialogs || []).length) {
        unexpectedDialogs = (postObs.dialogs || []).slice((preObs.dialogs || []).length);
      }

      if (verifyExpectedText) {
        const norm = (s) => String(s || '').toLowerCase().replace(/[_\s]+/g, ' ').trim();
        const wantNorm = norm(verifyExpectedText);
        const uiHasText = (postObs.elements || []).some(e =>
          norm(e.name).includes(wantNorm) || norm(e.value).includes(wantNorm)
        );
        outcomeVerified = norm(ocrPost).includes(wantNorm) || uiHasText;
        verificationReason = outcomeVerified
          ? `Observed '${verifyExpectedText}' in post-action UI/OCR`
          : `Expected text '${verifyExpectedText}' not observed after action`;
      } else if (targetAction.type === 'focus_or_launch') {
        outcomeVerified = Boolean(postObs.active_window?.hwnd);
        verificationReason = `Verified foreground window '${postObs.active_window?.title}'`;
      } else {
        outcomeVerified = Boolean(actResult?.verified && (visualChanged || (postObs.elements_count !== preObs.elements_count) || targetAction.type === 'manage_window'));
        verificationReason = outcomeVerified
          ? `Verified state change (visual_changed=${visualChanged}, diff_ratio=${postObs.visual_diff?.changed_pixel_ratio ?? 0})`
          : 'Action dispatched but no observable visual or UI state transition detected';
      }

      if (verifyUnexpectedDialog && unexpectedDialogs.length > 0) {
        outcomeVerified = false;
        verificationReason = `Unexpected dialog appeared after action: ${unexpectedDialogs.map(d => d.title).join(', ')}`;
        recoveryHistory.push({ attempt: attempt + 1, type: 'UNEXPECTED_DIALOG_DETECTED', dialogs: unexpectedDialogs });
      }
    } else {
      verificationReason = targetAction.type === 'manage_window' && targetAction.action === 'close' && actResult?.verified
        ? 'Verified target window closed cleanly'
        : (postObs.error || 'Post-action observation failed');
      outcomeVerified = Boolean(targetAction.type === 'manage_window' && targetAction.action === 'close' && actResult?.verified);
    }

    const finalStatus = outcomeVerified ? 'VERIFIED_COMPLETED' : 'PARTIALLY_VERIFIED';

    await this.auditLog({
      sessionId, missionId, loopStep: 1, phase: 'VERIFY', actionType: targetAction.type,
      targetApp: desktopState.activeWindow?.display_app, targetTitle: desktopState.activeWindow?.title,
      targetElement: targetAction.element_name || targetAction.target || null,
      params: targetAction,
      preObservationId: preObs.observationId,
      postObservationId: postObs.observationId || null,
      visualChanged: Boolean(postObs.visual_diff?.visual_changed),
      uiChanged: postObs.success ? (postObs.elements_count !== preObs.elements_count) : false,
      recoveryAttempts: recoveryHistory.length,
      recoveryReason: recoveryHistory.map(r => r.reason).join('; ') || null,
      approvalRequired: Boolean(plan.requiresApproval),
      approvalStatus: plan.requiresApproval ? 'APPROVED' : 'NONE_REQUIRED',
      confidence: plan.confidence,
      outcomeVerified,
      error: outcomeVerified ? null : verificationReason
    });

    await this.updateDashboardState({
      status: outcomeVerified ? 'COMPLETED' : 'ATTENTION_REQUIRED',
      verification_status: finalStatus,
      recovery_history: recoveryHistory,
      last_confidence: plan.confidence,
      detected_elements: ((postObs.elements && postObs.elements.length > 0) ? postObs.elements : desktopState.interactiveControls).slice(0, 25)
    });

    return {
      success: outcomeVerified,
      status: finalStatus,
      sessionId,
      loop: ['OBSERVE', 'UNDERSTAND', 'PLAN', plan.requiresApproval ? 'APPROVE' : 'SKIP_APPROVAL', 'ACT', 'OBSERVE_AGAIN', 'VERIFY'],
      preObservation: preObs,
      plan,
      actResult,
      postObservation: postObs,
      unexpectedDialogs,
      recoveryHistory,
      verificationReason,
      confidence: plan.confidence
    };
  }

  static async dispatchAction(cfg, act, hwnd, confirmed = false) {
    const headers = { Authorization: `Bearer ${cfg.token}` };
    if (act.type === 'click_ui_element') {
      const r = await axios.post(`${cfg.url}/api/desktop/click-element`, {
        hwnd,
        element_name: act.element_name,
        control_type: act.control_type,
        automation_id: act.automation_id,
        expected_rect: act.expected_rect,
        action: act.action || 'click',
        text: act.text,
        confirmed
      }, { headers, timeout: 12000 });
      return r.data;
    }
    if (act.type === 'mouse_click' || act.type === 'mouse_scroll') {
      const r = await axios.post(`${cfg.url}/api/desktop/mouse-action`, {
        action: act.type === 'mouse_scroll' ? 'scroll' : 'click',
        x: act.x,
        y: act.y,
        delta: act.delta ?? -120
      }, { headers, timeout: 8000 });
      return r.data;
    }
    if (act.type === 'keyboard_type') {
      const r = await axios.post(`${cfg.url}/api/desktop/keyboard-action`, {
        action: 'type_text',
        text: act.text,
        confirmed
      }, { headers, timeout: 8000 });
      return r.data;
    }
    if (act.type === 'focus_or_launch') {
      const r = await axios.post(`${cfg.url}/api/desktop/focus-or-launch`, { app_name: act.target }, { headers, timeout: 10000 });
      return r.data;
    }
    if (act.type === 'manage_window') {
      const r = await axios.post(`${cfg.url}/api/desktop/window-action`, {
        hwnd: act.hwnd || hwnd,
        action: act.action,
        confirmed
      }, { headers, timeout: 8000 });
      return r.data;
    }
    throw new Error(`Unsupported closed-loop action type: ${act.type}`);
  }

  static async attemptAdaptiveRecovery({ cfg, targetHwnd, targetAction, errDetail, desktopState, attempt, maxAttempts }) {
    const headers = { Authorization: `Bearer ${cfg.token}` };
    try {
      const ui = (await axios.post(`${cfg.url}/api/perception/ui-tree`, { hwnd: targetHwnd }, { headers, timeout: 8000 })).data;
      if (!ui?.active_window && targetHwnd) {
        return {
          attempt,
          type: 'CRASH_OR_WINDOW_CLOSED',
          crashed: true,
          canRetry: false,
          reason: `Target application HWND ${targetHwnd} disappeared or crashed (${errDetail}).`
        };
      }
      if ((ui?.dialogs || []).length > (desktopState?.dialogs || []).length) {
        const newDlgs = ui.dialogs.map(d => d.title).join(', ');
        return {
          attempt,
          type: 'UNEXPECTED_DIALOG',
          canRetry: false,
          reason: `Unexpected blocking dialog detected (${newDlgs}); halted safely without blind clicking.`
        };
      }
      if (targetAction.element_name && ui?.elements?.length) {
        const reMatch = ComputerUnderstandingService.matchElements(ui.elements, targetAction.element_name)[0];
        if (reMatch && attempt < maxAttempts) {
          return {
            attempt,
            type: 'STALE_COORDINATES_REACQUIRED',
            canRetry: true,
            reason: `Re-acquired '${reMatch.element.name}' at (${reMatch.element.center.x}, ${reMatch.element.center.y}) after error: ${errDetail}`,
            updatedAction: {
              expected_rect: reMatch.element.rect,
              automation_id: reMatch.element.automation_id
            }
          };
        }
      }
    } catch (_) {}
    return {
      attempt,
      type: 'RECOVERY_UNSUCCESSFUL',
      canRetry: attempt < maxAttempts,
      reason: `Attempt ${attempt} failed: ${errDetail}`
    };
  }

  static async getDashboardState() {
    const state = await get("SELECT * FROM computer_control_state WHERE id = 'primary'");
    const permission = await VisualPerceptionService.isScreenPermissionGranted();
    const recentObservations = await VisualPerceptionService.getRecentObservations(10);
    const recentAudit = await query('SELECT * FROM computer_action_audit ORDER BY timestamp DESC LIMIT 20');

    const parseJson = (raw, fallback) => {
      try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
    };

    return {
      success: true,
      state: {
        status: state?.status || 'IDLE',
        current_task: state?.current_task || null,
        active_app: state?.active_app || null,
        active_title: state?.active_title || null,
        active_hwnd: state?.active_hwnd || null,
        screen_permission_granted: Boolean(permission),
        planned_actions: parseJson(state?.planned_actions_json, []),
        detected_elements: parseJson(state?.detected_elements_json, []),
        recovery_history: parseJson(state?.recovery_history_json, []),
        last_confidence: Number(state?.last_confidence || 0),
        verification_status: state?.verification_status || 'NONE',
        updated_at: state?.updated_at || new Date().toISOString()
      },
      recentObservations,
      recentAudit,
      pendingApprovalsCount: this.pendingApprovals.size
    };
  }
}

export default ComputerControlService;
