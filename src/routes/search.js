import { Router } from 'express';
import { adminSupabase } from '../services/adminSupabase.js';
import { embedText, hasEmbeddingModel } from '../services/gemini.js';

const router = Router();

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

router.post('/query', async (req, res) => {
  try {
    const { query, type, companyId, contactId, limit = 8, taskType = 'RETRIEVAL_QUERY' } = req.body || {};

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ ok: false, error: 'El campo query es requerido' });
    }

    if (!hasEmbeddingModel()) {
      return res.status(503).json({ ok: false, error: 'Servicio de embeddings no configurado' });
    }

    const embedding = await embedText({ text: query, taskType });
    if (!embedding || embedding.length === 0) {
      return res.status(500).json({ ok: false, error: 'No se pudo generar embedding para la consulta' });
    }

    const supabase = ensureAdmin();
    const matchCount = Math.min(Number(limit) || 8, 20);

    const { data, error } = await supabase.rpc('match_ai_contexts', {
      query_embedding: embedding,
      match_count: matchCount,
      filter_type: type || null,
      filter_company: companyId || null,
      filter_contact: contactId || null,
    });

    if (error) throw error;

    return res.json({
      ok: true,
      query,
      results: (data || []).map((item) => ({
        id: item.id,
        type: item.type,
        sourceId: item.source_id,
        companyId: item.company_id,
        contactId: item.contact_id,
        text: item.text,
        metadata: item.metadata,
        similarity: item.similarity,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
    });
  } catch (error) {
    console.error('[search/query] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;

