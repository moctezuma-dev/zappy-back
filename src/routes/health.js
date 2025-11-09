import { Router } from 'express';
import { hasGemini, hasSupabase } from '../config/env.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    services: {
      gemini_configured: hasGemini(),
      supabase_configured: hasSupabase(),
    },
  });
});

export default router;