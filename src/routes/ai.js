import { Router } from 'express';
import { adminSupabase } from '../services/adminSupabase.js';

const router = Router();

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

router.get('/contexts', async (req, res) => {
  try {
    const { type, companyId, contactId, search, limit = 50, offset = 0 } = req.query;
    const supabase = ensureAdmin();

    let query = supabase
      .from('ai_contexts')
      .select(
        `
          id,
          type,
          source_id,
          company:companies(id, name),
          contact:contacts(id, name, email),
          text,
          metadata,
          created_at,
          updated_at
        `,
        { count: 'exact' },
      )
      .range(Number(offset), Number(offset) + Number(limit) - 1)
      .order('updated_at', { ascending: false });

    if (type) query = query.eq('type', type);
    if (companyId) query = query.eq('company_id', companyId);
    if (contactId) query = query.eq('contact_id', contactId);
    if (search) query = query.ilike('text', `%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;
    return res.json({ ok: true, data: data || [], count: count ?? 0 });
  } catch (error) {
    console.error('[ai/contexts] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.delete('/contexts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = ensureAdmin();
    const { error } = await supabase.from('ai_contexts').delete().eq('id', id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (error) {
    console.error('[ai/contexts/delete] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;

