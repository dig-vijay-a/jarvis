import express from 'express';
import { query, run, get } from '../database/db.js';
import { getScheduler } from '../services/schedulerService.js';

const router = express.Router();

// List all scheduled background jobs
router.get('/jobs', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM scheduled_jobs ORDER BY next_run_at ASC');
    res.json({ success: true, jobs: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create scheduled job
router.post('/jobs', async (req, res) => {
  try {
    const { title, type, schedule_type, schedule_value, next_run_at, action_type, action_payload } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Job title is required.' });

    const scheduler = getScheduler();
    const job = await scheduler.createJob({
      title,
      type: type || 'RECURRING_REMINDER',
      schedule_type: schedule_type || 'RECURRING',
      schedule_value: schedule_value || 'every_24h',
      next_run_at,
      action_type: action_type || 'NOTIFICATION',
      action_payload
    });

    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete scheduled job
router.delete('/jobs/:id', async (req, res) => {
  try {
    await run('DELETE FROM scheduled_jobs WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Scheduled job deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List notification history
router.get('/notifications', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM notification_history ORDER BY timestamp DESC LIMIT 50');
    res.json({ success: true, notifications: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', async (req, res) => {
  try {
    await run('UPDATE notification_history SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear notifications
router.delete('/notifications', async (req, res) => {
  try {
    await run('DELETE FROM notification_history');
    res.json({ success: true, message: 'Notification history cleared.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
