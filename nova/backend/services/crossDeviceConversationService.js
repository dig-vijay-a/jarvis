/**
 * JARVIS OS 2.0 — PHASE 11: CROSS-DEVICE CONVERSATION SERVICE (P4)
 * 
 * Preserves conversational and voice continuity across trusted devices:
 * - Session handoff between desktop, mobile, and wearable companions
 * - Context preservation across device boundaries
 * - Interrupted voice session recovery (partial transcript + audio state)
 * - Anti-duplicate command execution guard across multiple listening devices
 * - Respects strict microphone activation and mute controls
 */

import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import { getAmbientContextService } from './ambientContextService.js';

export class CrossDeviceConversationService {
  constructor() {
    this.activeCommandLocks = new Map(); // Fingerprint -> timestamp
    this.lockWindowMs = 8000; // 8-second window for duplicate command suppression
  }

  /**
   * Initiates a seamless conversational or voice handoff from source to target device.
   */
  async initiateConversationHandoff({
    source_device_id,
    target_device_id,
    conversation_id,
    partial_transcript = '',
    state_payload = {}
  }) {
    if (!source_device_id || !conversation_id) {
      throw new Error('source_device_id and conversation_id are required for handoff.');
    }

    const handoffId = `handoff-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    await run(
      `INSERT INTO cross_device_handoffs 
        (id, source_device_id, target_device_id, handoff_type, conversation_id, state_payload, partial_transcript, status, created_at)
       VALUES (?, ?, ?, 'CONVERSATION', ?, ?, ?, 'PENDING', ?)`,
      [
        handoffId,
        source_device_id,
        target_device_id || null,
        conversation_id,
        JSON.stringify(state_payload),
        partial_transcript,
        nowIso
      ]
    );

    return {
      handoff_id: handoffId,
      source_device_id,
      target_device_id,
      conversation_id,
      partial_transcript,
      status: 'PENDING',
      created_at: nowIso
    };
  }

  /**
   * Accepts and resumes a pending conversation handoff on the receiving device.
   */
  async acceptHandoff(handoffId, acceptingDeviceId) {
    const handoff = await get("SELECT * FROM cross_device_handoffs WHERE id = ?", [handoffId]);
    if (!handoff) throw new Error('Handoff session not found.');
    if (handoff.status !== 'PENDING') throw new Error(`Handoff already ${handoff.status}.`);

    const nowIso = new Date().toISOString();
    await run(
      "UPDATE cross_device_handoffs SET status = 'COMPLETED', target_device_id = ?, completed_at = ? WHERE id = ?",
      [acceptingDeviceId, nowIso, handoffId]
    );

    // Fetch conversation messages to resume seamlessly
    const messages = await query(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 20",
      [handoff.conversation_id]
    );

    return {
      handoff_id: handoffId,
      conversation_id: handoff.conversation_id,
      partial_transcript: handoff.partial_transcript,
      state_payload: handoff.state_payload ? JSON.parse(handoff.state_payload) : {},
      resumed_messages: messages.reverse(),
      resumed_at: nowIso
    };
  }

  /**
   * Anti-duplicate command execution guard.
   * If both desktop and mobile detect the same wake word/command concurrently,
   * only the first device claims execution lock; subsequent duplicates are suppressed.
   */
  async acquireCommandExecutionLock(commandText, deviceId) {
    if (!commandText || !deviceId) return { allowed: false, reason: 'Invalid parameters' };

    const fingerprint = commandText.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const nowMs = Date.now();

    // Check ambient mute state on device
    const ambientService = getAmbientContextService();
    const micCheck = await ambientService.checkPermission(deviceId, 'microphone');
    if (!micCheck.allowed) {
      return {
        allowed: false,
        suppressed: true,
        reason: 'MICROPHONE_MUTED',
        details: micCheck.reason
      };
    }

    // Check if fingerprint is locked
    const existingLock = this.activeCommandLocks.get(fingerprint);
    if (existingLock && (nowMs - existingLock.timestamp) < this.lockWindowMs) {
      return {
        allowed: false,
        suppressed: true,
        reason: 'DUPLICATE_CONCURRENT_COMMAND',
        locked_by_device: existingLock.deviceId,
        window_ms: this.lockWindowMs
      };
    }

    // Acquire lock
    this.activeCommandLocks.set(fingerprint, { deviceId, timestamp: nowMs });

    // Cleanup stale locks
    for (const [k, v] of this.activeCommandLocks.entries()) {
      if (nowMs - v.timestamp > this.lockWindowMs * 2) {
        this.activeCommandLocks.delete(k);
      }
    }

    return {
      allowed: true,
      deviceId,
      fingerprint,
      locked_at: nowMs
    };
  }
}

let instance = null;
export function initCrossDeviceConversation() {
  instance = new CrossDeviceConversationService();
  return instance;
}
export function getCrossDeviceConversation() {
  if (!instance) instance = new CrossDeviceConversationService();
  return instance;
}
export default CrossDeviceConversationService;
