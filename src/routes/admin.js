import { Router } from 'express';
import { agregarUsuarios, seedCompleto } from '../services/seeder.js';
import { hasSupabaseServiceRole } from '../config/env.js';
import { initializeRealtimeWatchers } from '../services/realtime.js';
import { triggerManualAnalysis } from '../services/analyzer.js';
import {
  reindexInteractions,
  reindexWorkItems,
  reindexFreshData,
  reindexAll,
} from '../services/contextReindexer.js';

const router = Router();

// POST /api/admin/seed/usuarios { generate?: boolean }
router.post('/seed/usuarios', async (req, res) => {
  try {
    if (!hasSupabaseServiceRole()) {
      return res.status(400).json({ ok: false, error: 'Configura SUPABASE_SERVICE_ROLE_KEY en .env' });
    }
    const { generate = false } = req.body || {};
    const result = await agregarUsuarios({ generate });
    return res.json({ ok: true, result });
  } catch (error) {
    console.error('[admin/seed/usuarios] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

// POST /api/admin/seed/completo { generate?: boolean }
router.post('/seed/completo', async (req, res) => {
  try {
    if (!hasSupabaseServiceRole()) {
      return res.status(400).json({ ok: false, error: 'Configura SUPABASE_SERVICE_ROLE_KEY en .env' });
    }
    const { generate = false } = req.body || {};
    const result = await seedCompleto({ generate });
    return res.json({ ok: true, result });
  } catch (error) {
    console.error('[admin/seed/completo] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

// POST /api/admin/analyze/trigger { type?: 'interactions'|'work_items'|'contacts', id?: string }
router.post('/analyze/trigger', async (req, res) => {
  try {
    const { type = 'interactions', id = null, limit = 10 } = req.body || {};
    const { count } = await triggerManualAnalysis({ type, id, limit });
    return res.json({ ok: true, analyzed: count });
  } catch (error) {
    console.error('[admin/analyze/trigger] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

// POST /api/admin/watchers/init - reinicia inicialización de watchers realtime
router.post('/watchers/init', async (_req, res) => {
  try {
    await initializeRealtimeWatchers(true);
    return res.json({ ok: true, message: 'Watchers inicializados' });
  } catch (error) {
    console.error('[admin/watchers/init] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

// POST /api/admin/ai/reindex { type?: 'interactions'|'work_items'|'fresh_data'|'all', limit?: number, companyId?: string }
router.post('/ai/reindex', async (req, res) => {
  try {
    const { type = 'all', limit = 100, companyId = null } = req.body || {};
    const options = { limit, companyId };
    let result;

    switch (type) {
      case 'interactions':
        result = await reindexInteractions(options);
        break;
      case 'work_items':
        result = await reindexWorkItems(options);
        break;
      case 'fresh_data':
        result = await reindexFreshData(options);
        break;
      case 'all':
      default:
        result = await reindexAll(options);
        break;
    }

    return res.json({ ok: true, type, result });
  } catch (error) {
    console.error('[admin/ai/reindex] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;