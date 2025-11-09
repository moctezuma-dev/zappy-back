import { adminSupabase } from './adminSupabase.js';
import { embedText, hasEmbeddingModel } from './gemini.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

export async function upsertAiContext({
  type,
  sourceId,
  text,
  companyId = null,
  contactId = null,
  metadata = {},
}) {
  if (!type || !sourceId || !text) throw new Error('type, sourceId y text son requeridos');

  const supabase = ensureAdmin();
  const cleanedText = text.slice(0, 8000);

  let embedding = null;
  if (hasEmbeddingModel()) {
    try {
      embedding = await embedText({ text: cleanedText, taskType: 'RETRIEVAL_DOCUMENT' });
    } catch (error) {
      console.warn('[aiContextService] Error generando embedding:', error);
    }
  }

  const payload = {
    type,
    source_id: sourceId,
    company_id: companyId,
    contact_id: contactId,
    text: cleanedText,
    metadata,
    updated_at: new Date().toISOString(),
  };

  if (embedding && Array.isArray(embedding)) {
    payload.embedding = embedding;
  }

  const { error } = await supabase
    .from('ai_contexts')
    .upsert(payload, { onConflict: 'type,source_id' });

  if (error) throw error;
  return payload;
}

