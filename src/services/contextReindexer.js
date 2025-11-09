import { adminSupabase } from './adminSupabase.js';
import { analyzeRecord } from './analyzer.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

async function fetchRecords(table, { limit = 100, companyId = null, orderColumn = 'created_at' } = {}) {
  const supabase = ensureAdmin();
  let query = supabase
    .from(table)
    .select('*')
    .order(orderColumn, { ascending: false })
    .limit(Math.min(limit, 500));

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function reindexInteractions({ limit = 100, companyId = null } = {}) {
  const records = await fetchRecords('interactions', { limit, companyId, orderColumn: 'occurred_at' });
  let processed = 0;
  for (const row of records) {
    await analyzeRecord('interactions', row);
    processed += 1;
  }
  return { processed };
}

export async function reindexWorkItems({ limit = 100, companyId = null } = {}) {
  const records = await fetchRecords('work_items', { limit, companyId, orderColumn: 'updated_at' });
  let processed = 0;
  for (const row of records) {
    await analyzeRecord('work_items', row);
    processed += 1;
  }
  return { processed };
}

export async function reindexFreshData({ limit = 100, companyId = null } = {}) {
  const records = await fetchRecords('fresh_data', { limit, companyId, orderColumn: 'published_at' });
  let processed = 0;
  for (const row of records) {
    await analyzeRecord('fresh_data', row);
    processed += 1;
  }
  return { processed };
}

export async function reindexAll({ limit = 100, companyId = null } = {}) {
  const [interactions, workItems, freshData] = await Promise.all([
    reindexInteractions({ limit, companyId }),
    reindexWorkItems({ limit, companyId }),
    reindexFreshData({ limit, companyId }),
  ]);

  return {
    interactions: interactions.processed,
    workItems: workItems.processed,
    freshData: freshData.processed,
  };
}

