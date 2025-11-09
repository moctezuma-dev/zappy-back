import { adminSupabase } from './adminSupabase.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

function buildNotes(notes) {
  return notes.filter(Boolean).join('; ');
}

export async function computeCompanyHealth(companyId) {
  if (!companyId) return null;
  const supabase = ensureAdmin();

  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const alertsPromise = supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'open');

  const overduePromise = supabase
    .from('work_items')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .neq('status', 'completed')
    .lt('due_date', nowIso);

  const interactionsPromise = supabase
    .from('interactions')
    .select('occurred_at', { count: 'exact' })
    .eq('company_id', companyId)
    .gte('occurred_at', thirtyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(1);

  const pipelinePromise = supabase
    .from('interactions')
    .select('budget', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .not('budget', 'is', null);

  const [alertsRes, overdueRes, interactionsRes, pipelineRes] = await Promise.all([
    alertsPromise,
    overduePromise,
    interactionsPromise,
    pipelinePromise,
  ]);

  let score = 100;
  const notes = [];

  if (alertsRes.error) throw alertsRes.error;
  if (overdueRes.error) throw overdueRes.error;
  if (interactionsRes.error) throw interactionsRes.error;
  if (pipelineRes.error) throw pipelineRes.error;

  const openAlerts = alertsRes.count || 0;
  const overdueCount = overdueRes.count || 0;
  const interactionsCount = interactionsRes.count || 0;
  const lastInteractionAt = interactionsRes.data?.[0]?.occurred_at || null;

  score -= openAlerts * 15;
  score -= overdueCount * 10;

  if (interactionsCount === 0) {
    score -= 10;
    notes.push('Sin interacciones en los últimos 30 días');
  } else {
    notes.push(`${interactionsCount} interacciones en 30 días`);
  }

  if (openAlerts > 0) {
    notes.push(`Alertas abiertas: ${openAlerts}`);
  }

  if (overdueCount > 0) {
    notes.push(`Work items vencidos: ${overdueCount}`);
  }

  const deals = pipelineRes.count || 0;
  if (deals === 0) {
    score -= 5;
    notes.push('Sin oportunidades con presupuesto activo');
  } else {
    notes.push(`Oportunidades activas: ${deals}`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  await supabase
    .from('companies')
    .update({ health_score: score, health_notes: buildNotes(notes) })
    .eq('id', companyId);

  return { score, notes, lastInteractionAt };
}

export async function computeContactHealth(contactId, companyId = null) {
  if (!contactId) return null;
  const supabase = ensureAdmin();
  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const alertsPromise = supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .eq('status', 'open');

  const interactionsPromise = supabase
    .from('interactions')
    .select('occurred_at', { count: 'exact' })
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false })
    .limit(1);

  const recentPromise = supabase
    .from('interactions')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .gte('occurred_at', thirtyDaysAgo);

  const rewardsPromise = supabase
    .from('work_items')
    .select('id', { count: 'exact', head: true })
    .eq('assignee_contact_id', contactId)
    .neq('status', 'completed');

  const [alertsRes, interactionsRes, recentRes, workItemsRes] = await Promise.all([
    alertsPromise,
    interactionsPromise,
    recentPromise,
    rewardsPromise,
  ]);

  let score = 100;
  const notes = [];

  if (alertsRes.error) throw alertsRes.error;
  if (interactionsRes.error) throw interactionsRes.error;
  if (recentRes.error) throw recentRes.error;
  if (workItemsRes.error) throw workItemsRes.error;

  const openAlerts = alertsRes.count || 0;
  const lastInteractionAt = interactionsRes.data?.[0]?.occurred_at || null;
  const recentInteractions = recentRes.count || 0;
  const openWorkItems = workItemsRes.count || 0;

  if (!lastInteractionAt) {
    score -= 20;
    notes.push('Nunca se ha interactuado con este contacto');
  } else if (new Date(lastInteractionAt).getTime() < Date.now() - 21 * 24 * 60 * 60 * 1000) {
    score -= 10;
    notes.push('Más de 3 semanas sin interacción');
  }

  if (openAlerts > 0) {
    score -= 15;
    notes.push(`Alertas abiertas: ${openAlerts}`);
  }

  if (openWorkItems > 0) {
    score -= Math.min(20, openWorkItems * 5);
    notes.push(`Work items asignados pendientes: ${openWorkItems}`);
  }

  if (recentInteractions === 0) {
    score -= 10;
    notes.push('Sin interacciones en los últimos 30 días');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  await supabase
    .from('contacts')
    .update({ health_score: score, health_notes: buildNotes(notes) })
    .eq('id', contactId);

  return { score, notes, lastInteractionAt };
}

