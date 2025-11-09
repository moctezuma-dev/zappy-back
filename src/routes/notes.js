import { Router } from 'express';
import { adminSupabase } from '../services/adminSupabase.js';
import { upsertAiContext } from '../services/aiContextService.js';

const router = Router();

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

router.post('/', async (req, res) => {
  try {
    const {
      companyId = null,
      contactId = null,
      author = null,
      channel = 'note',
      text,
      occurredAt = new Date().toISOString(),
      metadata = {},
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ ok: false, error: 'El campo text es requerido' });
    }

    const supabase = ensureAdmin();

    const { data, error } = await supabase
      .from('interactions')
      .insert({
        company_id: companyId,
        contact_id: contactId,
        channel,
        occurred_at: occurredAt,
        notes: text,
        data: { author, manual: true, ...metadata },
      })
      .select('id, company_id, contact_id')
      .single();

    if (error) throw error;

    await upsertAiContext({
      type: 'note',
      sourceId: data.id,
      text,
      companyId: data.company_id,
      contactId: data.contact_id,
      metadata: { author, channel, manual: true, ...metadata },
    });

    return res.json({ ok: true, interactionId: data.id });
  } catch (error) {
    console.error('[notes/post] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;

