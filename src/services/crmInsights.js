import { adminSupabase } from './adminSupabase.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

function parseLimit(value, fallback = 5) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 20);
}

export async function getInsightsSummary({ companyId = null, limit = 5 } = {}) {
  const supabase = ensureAdmin();
  const topK = parseLimit(limit);

  const summaryPromise = supabase.rpc('dashboard_summary', {
    p_company: companyId || null,
  });
  const statusPromise = supabase.rpc('work_items_status_breakdown', {
    p_company: companyId || null,
  });
  const sentimentPromise = supabase.rpc('sentiment_breakdown', {
    p_company: companyId || null,
  });

  let interactionsQuery = supabase
    .from('interactions')
    .select(
      `
        id,
        occurred_at,
        channel,
        budget,
        currency,
        notes,
        requirements,
        company:companies(id, name),
        contact:contacts(id, name)
      `,
    )
    .not('budget', 'is', null)
    .order('budget', { ascending: false })
    .limit(topK);
  if (companyId) interactionsQuery = interactionsQuery.eq('company_id', companyId);

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  let upcomingQuery = supabase
    .from('work_items')
    .select(
      `
        id,
        title,
        status,
        priority,
        due_date,
        company:companies(id, name),
        assignee:contacts!work_items_assignee_contact_id_fkey(id, name),
        data
      `,
    )
    .not('due_date', 'is', null)
    .gte('due_date', nowIso)
    .lte('due_date', in14Days)
    .order('due_date', { ascending: true })
    .limit(topK);
  if (companyId) upcomingQuery = upcomingQuery.eq('company_id', companyId);

  let recentInteractionsQuery = supabase
    .from('interactions')
    .select(
      `
        id,
        occurred_at,
        channel,
        notes,
        company:companies(id, name),
        contact:contacts(id, name, email, role)
      `,
    )
    .order('occurred_at', { ascending: false })
    .limit(topK);
  if (companyId) recentInteractionsQuery = recentInteractionsQuery.eq('company_id', companyId);

  const [summaryRes, statusRes, sentimentRes, topDealsRes, upcomingRes, recentRes] = await Promise.all([
    summaryPromise,
    statusPromise,
    sentimentPromise,
    interactionsQuery,
    upcomingQuery,
    recentInteractionsQuery,
  ]);

  if (summaryRes.error) throw summaryRes.error;
  if (statusRes.error) throw statusRes.error;
  if (sentimentRes.error) throw sentimentRes.error;
  if (topDealsRes.error) throw topDealsRes.error;
  if (upcomingRes.error) throw upcomingRes.error;
  if (recentRes.error) throw recentRes.error;

  return {
    summary: summaryRes.data || {},
    workItemsStatus: statusRes.data || [],
    sentiment: sentimentRes.data || [],
    topDeals: topDealsRes.data || [],
    upcomingWorkItems: upcomingRes.data || [],
    recentInteractions: recentRes.data || [],
  };
}

