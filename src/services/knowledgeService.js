import { adminSupabase } from './adminSupabase.js';
import { embedText, hasEmbeddingModel } from './gemini.js';
import { upsertAiContext } from './aiContextService.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

async function createEntryRecord({ title, content, companyId, metadata }) {
  const supabase = ensureAdmin();
  let embedding = null;
  if (hasEmbeddingModel()) {
    try {
      embedding = await embedText({ text: content, taskType: 'RETRIEVAL_DOCUMENT' });
    } catch (error) {
      console.warn('[knowledge] error generando embedding', error);
    }
  }

  const { data, error } = await supabase
    .from('knowledge_entries')
    .insert({
      company_id: companyId,
      title,
      content,
      embedding,
      metadata,
    })
    .select('id, company_id, title, content')
    .single();
  if (error) throw error;

  await upsertAiContext({
    type: 'knowledge',
    sourceId: data.id,
    text: `${title ? `${title}\n` : ''}${content}`.slice(0, 8000),
    companyId,
    metadata: { title, ...metadata },
  });

  return data;
}

export async function createKnowledgeEntry({ title, content, companyId = null, metadata = {} }) {
  if (!content) throw new Error('content requerido');
  return createEntryRecord({ title, content, companyId, metadata });
}

export async function createKnowledgeEntriesFromText({
  title,
  content,
  companyId = null,
  metadata = {},
  chunkSize = 1600,
}) {
  if (!content) throw new Error('content requerido');
  const chunks = [];
  let remaining = content;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, chunkSize));
    remaining = remaining.slice(chunkSize);
  }
  const results = [];
  for (let idx = 0; idx < chunks.length; idx += 1) {
    const chunkTitle = chunks.length > 1 ? `${title || 'Documento'} (Parte ${idx + 1})` : title;
    const entry = await createEntryRecord({
      title: chunkTitle,
      content: chunks[idx],
      companyId,
      metadata: { ...metadata, chunk: idx + 1, total_chunks: chunks.length },
    });
    results.push(entry);
  }
  return results;
}

export async function listKnowledgeEntries({ companyId = null, search = '', limit = 50, offset = 0 } = {}) {
  const supabase = ensureAdmin();
  let query = supabase
    .from('knowledge_entries')
    .select('id, company_id, title, content, metadata, created_at', { count: 'exact' })
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  if (companyId) query = query.eq('company_id', companyId);
  if (search) query = query.ilike('content', `%${search}%`);

  const { data, count, error } = await query;
  if (error) throw error;
  return { data: data || [], count: count ?? 0 };
}

export async function deleteKnowledgeEntry(id) {
  if (!id) throw new Error('id requerido');
  const supabase = ensureAdmin();
  const { error } = await supabase.from('knowledge_entries').delete().eq('id', id);
  if (error) throw error;
  return { ok: true };
}

export async function searchKnowledge({ query, companyId = null, limit = 5 }) {
  if (!query) throw new Error('query requerido');
  const supabase = ensureAdmin();
  if (!hasEmbeddingModel()) {
    const { data, error } = await supabase
      .from('knowledge_entries')
      .select('id, title, company_id, content, metadata, created_at')
      .ilike('content', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  const embedding = await embedText({ text: query, taskType: 'RETRIEVAL_QUERY' });
  const { data, error } = await supabase.rpc('match_ai_contexts', {
    query_embedding: embedding,
    match_count: Math.min(limit, 20),
    filter_company: companyId || null,
    filter_type: 'knowledge',
  });
  if (error) throw error;
  return (data || []).map((item) => ({
    id: item.id,
    sourceId: item.source_id,
    companyId: item.company_id,
    contactId: item.contact_id,
    text: item.text,
    metadata: item.metadata,
    similarity: item.similarity,
    created_at: item.created_at,
  }));
}

export async function createKnowledgeEntriesFromUrl({
  title,
  url,
  companyId = null,
  metadata = {},
  chunkSize = 1600,
}) {
  if (!url) throw new Error('url requerida');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar el recurso (${response.status})`);
  const contentType = response.headers.get('content-type') || '';
  let text = '';
  if (contentType.includes('application/json')) {
    const json = await response.json();
    text = JSON.stringify(json, null, 2);
  } else {
    text = await response.text();
  }
  return createKnowledgeEntriesFromText({
    title: title || url,
    content: text,
    companyId,
    metadata: { ...metadata, source_url: url },
    chunkSize,
  });
}

