import express from 'express';
import { query, run, get } from '../database/db.js';
import { getScheduler } from '../services/schedulerService.js';

const router = express.Router();

// Tasks
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY CASE priority WHEN "high" THEN 1 WHEN "medium" THEN 2 ELSE 3 END, created_at DESC';
    const rows = await query(sql, params);
    res.json({ success: true, count: rows.length, tasks: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, description, priority, due_date } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });

    const id = `task-${Date.now()}`;
    const now = new Date().toISOString();
    await run(
      'INSERT INTO tasks (id, title, description, status, priority, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, title.trim(), description || '', 'pending', priority || 'medium', due_date || null, now]
    );

    res.json({
      success: true,
      task: { id, title, description, status: 'pending', priority: priority || 'medium', due_date, created_at: now }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { status, title, description, priority, due_date } = req.body;
    const now = new Date().toISOString();
    const completedAt = status === 'completed' ? now : null;

    await run(
      'UPDATE tasks SET status = coalesce(?, status), title = coalesce(?, title), description = coalesce(?, description), priority = coalesce(?, priority), due_date = coalesce(?, due_date), completed_at = ? WHERE id = ?',
      [status, title, description, priority, due_date, completedAt, req.params.id]
    );

    res.json({ success: true, message: 'Task updated.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Task removed.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reminders
router.get('/reminders/all', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM reminders ORDER BY remind_at ASC');
    res.json({ success: true, reminders: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/reminders', async (req, res) => {
  try {
    const { title, remind_at } = req.body;
    if (!title || !remind_at) return res.status(400).json({ success: false, error: 'Title and remind_at are required.' });

    const id = `rem-${Date.now()}`;
    const now = new Date().toISOString();
    await run(
      'INSERT INTO reminders (id, title, remind_at, status, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, title, remind_at, 'active', now]
    );

    res.json({ success: true, reminder: { id, title, remind_at, status: 'active', created_at: now } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/reminders/:id', async (req, res) => {
  try {
    await run('DELETE FROM reminders WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Reminder deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Focus Session Timer
router.post('/focus/start', (req, res) => {
  const { duration, title } = req.body;
  const scheduler = getScheduler();
  if (!scheduler) return res.status(500).json({ success: false, error: 'Scheduler offline.' });

  const session = scheduler.startFocusSession(duration || 25, title || 'Deep Work Session');
  res.json({ success: true, session });
});

router.post('/focus/stop', (req, res) => {
  const scheduler = getScheduler();
  if (!scheduler) return res.status(500).json({ success: false, error: 'Scheduler offline.' });

  const result = scheduler.stopFocusSession();
  res.json(result);
});

export default router;
