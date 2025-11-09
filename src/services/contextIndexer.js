import { adminSupabase } from './adminSupabase.js';
import { embedText, hasEmbeddingModel } from './gemini.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

async function upsertContext({
  type,
  sourceId,
  text,
  companyId = null,
  contactId = null,
  metadata = {},
}) {
  if (!text) return null;
  const cleanedText = text.slice(0, 8000);
  const supabase = ensureAdmin();

  let embedding = null;
  if (hasEmbeddingModel()) {
    try {
      const vector = await embedText({
        text: cleanedText,
        taskType: 'RETRIEVAL_DOCUMENT',
      });
      embedding = vector;
    } catch (error) {
      console.warn('[contextIndexer] Error generando embedding:', error.message);
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

function joinSections(sections = []) {
  return sections.filter(Boolean).join('\n');
}

export async function upsertInteractionContext(interaction, analysis = {}) {
  if (!interaction?.id) return null;
  const metadata = {
    channel: interaction.channel,
    occurred_at: interaction.occurred_at,
    next_steps: analysis.next_steps || [],
    topics: analysis.topics || [],
    urgency: analysis.urgency,
    sentiment: analysis.sentiment,
    source: 'interaction',
  };

  const text = joinSections([
    `Interaction ${interaction.channel || 'unknown'} on ${interaction.occurred_at || 'unknown date'}`,
    analysis.summary ? `Summary: ${analysis.summary}` : null,
    interaction.notes ? `Transcript/Notes:\n${interaction.notes}` : null,
    analysis.requirements?.length ? `Requirements: ${analysis.requirements.join('; ')}` : null,
    analysis.kpis?.length ? `KPIs: ${analysis.kpis.join('; ')}` : null,
    analysis.opportunities?.length ? `Opportunities: ${analysis.opportunities.join('; ')}` : null,
    analysis.risks?.length ? `Risks: ${analysis.risks.join('; ')}` : null,
    analysis.next_steps?.length
      ? `Next Steps:\n${analysis.next_steps.map((step) => `- ${step.title}${step.due_date ? ` (due ${step.due_date})` : ''}`).join('\n')}`
      : null,
  ]);

  return upsertContext({
    type: 'interaction',
    sourceId: interaction.id,
    text,
    companyId: interaction.company_id,
    contactId: interaction.contact_id,
    metadata,
  });
}

export async function upsertWorkItemContext(workItem, analysis = {}) {
  if (!workItem?.id) return null;
  const metadata = {
    status: workItem.status,
    priority: workItem.priority,
    due_date: workItem.due_date,
    company_id: workItem.company_id,
    assignee_contact_id: workItem.assignee_contact_id,
    source: 'work_item',
  };

  const text = joinSections([
    `Work Item "${workItem.title}" (${workItem.status})`,
    workItem.description ? `Description: ${workItem.description}` : null,
    analysis.summary ? `Analysis: ${analysis.summary}` : null,
    workItem.requirements?.length ? `Requirements: ${workItem.requirements.join('; ')}` : null,
    workItem.kpis?.length ? `KPIs: ${workItem.kpis.join('; ')}` : null,
    workItem.data?.notes ? `Notes: ${workItem.data.notes}` : null,
    workItem.due_date ? `Due Date: ${workItem.due_date}` : null,
  ]);

  return upsertContext({
    type: 'work_item',
    sourceId: workItem.id,
    text,
    companyId: workItem.company_id,
    contactId: workItem.assignee_contact_id || workItem.owner_contact_id,
    metadata,
  });
}

export async function upsertFreshDataContext(freshData, analysis = {}) {
  if (!freshData?.id) return null;
  const metadata = {
    topic: freshData.topic,
    source: freshData.source,
    source_url: freshData.source_url,
    published_at: freshData.published_at,
    detected_at: freshData.detected_at,
    tags: freshData.tags || [],
    analysis,
  };

  const text = joinSections([
    `Signal about ${freshData.topic || 'unknown topic'} from ${freshData.source || 'unknown source'}`,
    freshData.title ? `Title: ${freshData.title}` : null,
    freshData.summary ? `Summary: ${freshData.summary}` : null,
    freshData.tags?.length ? `Tags: ${freshData.tags.join(', ')}` : null,
  ]);

  return upsertContext({
    type: 'fresh_data',
    sourceId: freshData.id,
    text,
    companyId: freshData.company_id,
    metadata,
  });
}

