import { adminSupabase } from './adminSupabase.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

export async function getActionableInsights({ companyId = null } = {}) {
  const supabase = ensureAdmin();
  const { data, error } = await supabase.rpc('actionable_insights', {
    p_company: companyId,
  });
  if (error) throw error;
  return data || {
    risky_contacts: [],
    open_alerts: [],
    overdue_work_items: [],
    stale_companies: [],
  };
}

