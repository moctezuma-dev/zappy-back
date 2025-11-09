import { adminSupabase } from './adminSupabase.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

function parseLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
}

function buildFilters(query, { companyId, contactId }) {
  if (companyId) query = query.eq('company_id', companyId);
  if (contactId && query.column ? query.eq('contact_id', contactId) : true) {}
  return query;
}

export async function getTimeline({ companyId = null, contactId = null, limit = 50 } = {}) {
  const supabase = ensureAdmin();
  const top = parseLimit(limit);
  const filters = { companyId, contactId };

  let interactionsQuery = supabase
    .from('interactions')
    .select(
      `
        id,
        channel,
        occurred_at,
        notes,
        requirements,
        kpis,
        budget,
        deadline,
        company_id,
        contact_id,
        company:companies(id, name),
        contact:contacts(id, name, email, role)
      `,
    )
    .order('occurred_at', { ascending: false })
    .limit(top);
  if (companyId) interactionsQuery = interactionsQuery.eq('company_id', companyId);
  if (contactId) interactionsQuery = interactionsQuery.eq('contact_id', contactId);

  let workItemsQuery = supabase
    .from('work_items')
    .select(
      `
        id,
        title,
        description,
        status,
        priority,
        due_date,
        updated_at,
        created_at,
        company_id,
        assignee_contact_id,
        owner_contact_id,
        company:companies(id, name),
        assignee:contacts!work_items_assignee_contact_id_fkey(id, name),
        owner:contacts!work_items_owner_contact_id_fkey(id, name)
      `,
    )
    .order('updated_at', { ascending: false })
    .limit(top);
  if (companyId) workItemsQuery = workItemsQuery.eq('company_id', companyId);
  if (contactId) {
    workItemsQuery = workItemsQuery.or(
      `assignee_contact_id.eq.${contactId},owner_contact_id.eq.${contactId}`,
    );
  }

  let freshDataQuery = supabase
    .from('fresh_data')
    .select(
      `
        id,
        topic,
        source,
        source_url,
        title,
        summary,
        tags,
        published_at,
        detected_at,
        company_id,
        company:companies(id, name)
      `,
    )
    .order('detected_at', { ascending: false })
    .limit(top);
  if (companyId) freshDataQuery = freshDataQuery.eq('company_id', companyId);

  const [interactionsRes, workItemsRes, freshDataRes] = await Promise.all([
    interactionsQuery,
    workItemsQuery,
    freshDataQuery,
  ]);

  if (interactionsRes.error) throw interactionsRes.error;
  if (workItemsRes.error) throw workItemsRes.error;
  if (freshDataRes.error) throw freshDataRes.error;

  const entries = [];

  for (const item of interactionsRes.data || []) {
    entries.push({
      type: 'interaction',
      id: item.id,
      occurredAt: item.occurred_at,
      sortDate: item.occurred_at,
      channel: item.channel,
      summary: item.notes?.slice(0, 280) || '',
      budget: item.budget,
      deadline: item.deadline,
      requirements: item.requirements,
      kpis: item.kpis,
      company: item.company,
      contact: item.contact,
      raw: item,
    });
  }

  for (const item of workItemsRes.data || []) {
    entries.push({
      type: 'work_item',
      id: item.id,
      occurredAt: item.updated_at || item.created_at,
      sortDate: item.updated_at || item.created_at,
      title: item.title,
      status: item.status,
      priority: item.priority,
      dueDate: item.due_date,
      company: item.company,
      assignee: item.assignee,
      owner: item.owner,
      raw: item,
    });
  }

  for (const item of freshDataRes.data || []) {
    entries.push({
      type: 'fresh_data',
      id: item.id,
      occurredAt: item.detected_at || item.published_at,
      sortDate: item.detected_at || item.published_at,
      topic: item.topic,
      title: item.title,
      source: item.source,
      sourceUrl: item.source_url,
      summary: item.summary,
      tags: item.tags,
      company: item.company,
      raw: item,
    });
  }

  entries.sort((a, b) => new Date(b.sortDate || 0) - new Date(a.sortDate || 0));

  return {
    entries: entries.slice(0, top),
    total: entries.length,
  };
}

