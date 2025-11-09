import { Router } from 'express';
import { listAlerts, resolveAlertById } from '../services/alertsService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { status, severity, companyId, contactId, limit, offset } = req.query;
    const result = await listAlerts({
      status,
      severity,
      companyId,
      contactId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[alerts/list] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.post('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    await resolveAlertById(id);
    return res.json({ ok: true });
  } catch (error) {
    console.error('[alerts/resolve] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;

