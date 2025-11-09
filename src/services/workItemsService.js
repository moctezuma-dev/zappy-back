import { adminSupabase } from './adminSupabase.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

export async function createWorkItem({
  title,
  description = '',
  companyId = null,
  assigneeContactId = null,
  dueDate = null,
  priority = 'medium',
  data = {},
}) {
  if (!title) throw new Error('title requerido');
  const supabase = ensureAdmin();

  const payload = {
    title,
    description,
    company_id: companyId,
    assignee_contact_id: assigneeContactId,
    due_date: dueDate ? new Date(dueDate).toISOString() : null,
    priority,
    data,
  };

  const { data: inserted, error } = await supabase
    .from('work_items')
    .insert(payload)
    .select('id, title, status, priority, due_date, company_id, assignee_contact_id')
    .single();
  if (error) throw error;
  return inserted;
}

