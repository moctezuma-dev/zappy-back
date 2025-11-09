import { Router } from 'express';
import { createWorkItem } from '../services/workItemsService.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { title, description, companyId, assigneeContactId, dueDate, priority, data } = req.body || {};
    const workItem = await createWorkItem({
      title,
      description,
      companyId,
      assigneeContactId,
      dueDate,
      priority,
      data,
    });
    return res.json({ ok: true, workItem });
  } catch (error) {
    console.error('[work-items/post] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;

