import { adminSupabase } from './adminSupabase.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

export async function upsertAlert({
  entityType,
  entityId,
  severity = 'medium',
  message = '',
  companyId = null,
  contactId = null,
  data = {},
}) {
  if (!entityType || !entityId) throw new Error('entityType y entityId son requeridos');
  const supabase = ensureAdmin();

  const { data: existing, error: findError } = await supabase
    .from('alerts')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'open')
    .maybeSingle();
  if (findError) throw findError;

  if (existing?.id) {
    const { error } = await supabase
      .from('alerts')
      .update({
        severity,
        message,
        company_id: companyId,
        contact_id: contactId,
        data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('alerts')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      severity,
      message,
      company_id: companyId,
      contact_id: contactId,
      data,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return inserted.id;
}

export async function resolveAlertsByEntity(entityType, entityId) {
  const supabase = ensureAdmin();
  const { error } = await supabase
    .from('alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'open');
  if (error) throw error;
}

export async function resolveAlertById(id) {
  const supabase = ensureAdmin();
  const { error } = await supabase
    .from('alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function listAlerts({
  status = 'open',
  severity = null,
  companyId = null,
  contactId = null,
  limit = 50,
  offset = 0,
} = {}) {
  const supabase = ensureAdmin();
  let query = supabase
    .from('alerts')
    .select(
      `
        id,
        entity_type,
        entity_id,
        severity,
        status,
        message,
        data,
        company:companies(id, name),
        contact:contacts(id, name, email),
        created_at,
        updated_at,
        resolved_at
      `,
      { count: 'exact' },
    )
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (severity) query = query.eq('severity', severity);
  if (companyId) query = query.eq('company_id', companyId);
  if (contactId) query = query.eq('contact_id', contactId);

  const { data, count, error } = await query;
  if (error) throw error;
  return { data: data || [], count: count ?? 0 };
}

