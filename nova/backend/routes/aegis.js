import express from 'express';
import { getAegisService } from '../services/aegisService.js';

const router = express.Router();

router.get('/status', (req, res) => {
  try {
    const svc = getAegisService();
    res.json({ success: true, ...svc.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/gates/:gateId/readiness', async (req, res) => {
  try {
    const svc = getAegisService();
    const result = await svc.checkReadiness(req.params.gateId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/gates/:gateId/approve', (req, res) => {
  try {
    const svc = getAegisService();
    const result = svc.approveGate(req.params.gateId, req.body?.operator || 'Operator');
    res.json({ success: true, gate_id: req.params.gateId, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/checklist/:itemId', (req, res) => {
  try {
    const svc = getAegisService();
    const result = svc.toggleChecklistItem(req.params.itemId, req.body?.checked);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
