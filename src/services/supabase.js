import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

let supabase = null;
if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
  supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

export { supabase };

export async function insertJob(job) {
  if (!supabase) return { data: null, error: new Error('Supabase no configurado') };
  return await supabase.from('jobs').insert(job).select().single();
}

export async function updateJobById(id, patch) {
  if (!supabase) return { data: null, error: new Error('Supabase no configurado') };
  return await supabase.from('jobs').update(patch).eq('id', id).select().single();
}

export async function upsertContact(contact) {
  if (!supabase) return { data: null, error: new Error('Supabase no configurado') };
  // upsert by email if provided
  const payload = contact;
  return await supabase.from('contacts').upsert(payload, { onConflict: 'email' }).select().single();
}

// ============ CRM Helpers ============
export async function upsertCompany(company) {
  if (!supabase) return { data: null, error: new Error('Supabase no configurado') };
  // upsert por nombre (único)
  return await supabase
    .from('companies')
    .upsert(company, { onConflict: 'name' })
    .select()
    .single();
}

export async function insertDepartment(department) {
  if (!supabase) return { data: null, error: new Error('Supabase no configurado') };
  return await supabase.from('departments').insert(department).select().single();
}

export async function createWorkItem(item) {
  if (!supabase) return { data: null, error: new Error('Supabase no configurado') };
  return await supabase.from('work_items').insert(item).select().single();
}

export async function updateWorkItemStatus(id, statusPatch) {
  if (!supabase) return { data: null, error: new Error('Supabase no configurado') };
  const patch = { ...statusPatch, updated_at: new Date().toISOString() };
  return await supabase.from('work_items').update(patch).eq('id', id).select().single();
}

export async function insertInteraction(interaction) {
  if (!supabase) return { data: null, error: new Error('Supabase no configurado') };
  return await supabase.from('interactions').insert(interaction).select().single();
}

export async function insertFreshData(signal) {
  if (!supabase) return { data: null, error: new Error('Supabase no configurado') };
  return await supabase.from('fresh_data').insert(signal).select().single();
}