import { adminSupabase } from './adminSupabase.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

function parsePagination({ limit = 20, offset = 0 }) {
  const parsedLimit = Math.min(Number(limit) || 20, 100);
  const parsedOffset = Math.max(Number(offset) || 0, 0);
  return { limit: parsedLimit, offset: parsedOffset };
}

function buildSearchFilter(query, columns = []) {
  if (!query) return null;
  const safeQuery = query.replace(/%/g, '\\%');
  const filters = columns.map((col) => `${col}.ilike.%${safeQuery}%`);
  return filters.join(',');
}

export async function getContacts({
  search,
  companyId,
  sentiment,
  personKind,
  isClient,
  updatedAfter,
  updatedBefore,
  limit,
  offset,
}) {
  const supabase = ensureAdmin();
  const { limit: parsedLimit, offset: parsedOffset } = parsePagination({ limit, offset });

  let query = supabase
    .from('contacts')
    .select(
      `
        id,
        name,
        role,
        email,
        phone,
        sentiment,
        person_kind,
        is_client,
        is_supplier,
        personal_notes,
        preferences,
        updated_at,
        created_at,
        company:companies (
          id,
          name,
          industry,
          website,
          domain
        )
      `,
      { count: 'exact' },
    )
    .range(parsedOffset, parsedOffset + parsedLimit - 1)
    .order('updated_at', { ascending: false, nullsLast: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  if (sentiment) query = query.eq('sentiment', sentiment);
  if (personKind) query = query.eq('person_kind', personKind);
  if (typeof isClient === 'boolean') query = query.eq('is_client', isClient);
  if (updatedAfter) query = query.gte('updated_at', updatedAfter);
  if (updatedBefore) query = query.lte('updated_at', updatedBefore);

  const searchFilter = buildSearchFilter(search, ['name', 'email', 'role', 'phone']);
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count ?? 0, limit: parsedLimit, offset: parsedOffset };
}

export async function getCompanies({ search, industry, limit, offset }) {
  const supabase = ensureAdmin();
  const { limit: parsedLimit, offset: parsedOffset } = parsePagination({ limit, offset });

  let query = supabase
    .from('companies')
    .select(
      `
        id,
        name,
        industry,
        website,
        domain,
        company_type,
        created_at
      `,
      { count: 'exact' },
    )
    .range(parsedOffset, parsedOffset + parsedLimit - 1)
    .order('created_at', { ascending: false });

  if (industry) query = query.eq('industry', industry);

  const searchFilter = buildSearchFilter(search, ['name', 'industry', 'domain']);
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count ?? 0, limit: parsedLimit, offset: parsedOffset };
}

export async function getInteractions({
  search,
  contactId,
  companyId,
  channel,
  startDate,
  endDate,
  minBudget,
  maxBudget,
  limit,
  offset,
}) {
  const supabase = ensureAdmin();
  const { limit: parsedLimit, offset: parsedOffset } = parsePagination({ limit, offset });

  let query = supabase
    .from('interactions')
    .select(
      `
        id,
        channel,
        occurred_at,
        notes,
        participants,
        budget,
        currency,
        requirements,
        kpis,
        data,
        deadline,
        created_at,
        contact:contacts(id, name, email, role, sentiment),
        company:companies(id, name, industry)
      `,
      { count: 'exact' },
    )
    .range(parsedOffset, parsedOffset + parsedLimit - 1)
    .order('occurred_at', { ascending: false });

  if (contactId) query = query.eq('contact_id', contactId);
  if (companyId) query = query.eq('company_id', companyId);
  if (channel) query = query.eq('channel', channel);
  if (startDate) query = query.gte('occurred_at', startDate);
  if (endDate) query = query.lte('occurred_at', endDate);
  if (minBudget) query = query.gte('budget', Number(minBudget));
  if (maxBudget) query = query.lte('budget', Number(maxBudget));

  const searchFilter = buildSearchFilter(search, ['notes']);
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count ?? 0, limit: parsedLimit, offset: parsedOffset };
}

export async function getWorkItems({
  search,
  status,
  companyId,
  assigneeId,
  priority,
  dueBefore,
  dueAfter,
  onlyOverdue = false,
  limit,
  offset,
}) {
  const supabase = ensureAdmin();
  const { limit: parsedLimit, offset: parsedOffset } = parsePagination({ limit, offset });

  let query = supabase
    .from('work_items')
    .select(
      `
        id,
        title,
        description,
        status,
        priority,
        budget,
        currency,
        requirements,
        kpis,
        data,
        due_date,
        created_at,
        updated_at,
        owner:contacts!work_items_owner_contact_id_fkey(id, name, email),
        assignee:contacts!work_items_assignee_contact_id_fkey(id, name, email),
        company:companies(id, name)
      `,
      { count: 'exact' },
    )
    .range(parsedOffset, parsedOffset + parsedLimit - 1)
    .order('due_date', { ascending: true, nullsLast: true })
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (companyId) query = query.eq('company_id', companyId);
  if (assigneeId) query = query.eq('assignee_contact_id', assigneeId);
  if (priority) query = query.eq('priority', priority);
  if (dueBefore) query = query.lte('due_date', dueBefore);
  if (dueAfter) query = query.gte('due_date', dueAfter);
  if (onlyOverdue) {
    query = query
      .neq('status', 'completed')
      .lt('due_date', new Date().toISOString());
  }

  const searchFilter = buildSearchFilter(search, ['title', 'description']);
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count ?? 0, limit: parsedLimit, offset: parsedOffset };
}

export async function getFreshData({ search, companyId, topic, source, tag, limit, offset }) {
  const supabase = ensureAdmin();
  const { limit: parsedLimit, offset: parsedOffset } = parsePagination({ limit, offset });

  let query = supabase
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
        company:companies(id, name, industry)
      `,
      { count: 'exact' },
    )
    .range(parsedOffset, parsedOffset + parsedLimit - 1)
    .order('published_at', { ascending: false, nullsLast: true })
    .order('detected_at', { ascending: false });

  if (companyId) query = query.eq('company_id', companyId);
  if (topic) query = query.eq('topic', topic);
  if (source) query = query.eq('source', source);
  if (tag) query = query.contains('tags', [tag]);

  const searchFilter = buildSearchFilter(search, ['title', 'summary', 'topic', 'source']);
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count ?? 0, limit: parsedLimit, offset: parsedOffset };
}

