import { adminSupabase } from './adminSupabase.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

export async function getTrends({ companyId = null, days = 30 } = {}) {
  const supabase = ensureAdmin();

  const [interactions, workItems, freshData] = await Promise.all([
    supabase.rpc('interactions_trend', { p_company: companyId, p_days: days }),
    supabase.rpc('work_items_trend', { p_company: companyId, p_days: days }),
    supabase.rpc('fresh_data_trend', { p_company: companyId, p_days: days }),
  ]);

  if (interactions.error) throw interactions.error;
  if (workItems.error) throw workItems.error;
  if (freshData.error) throw freshData.error;

  return {
    interactions: interactions.data || [],
    workItems: workItems.data || [],
    freshData: freshData.data || [],
  };
}

