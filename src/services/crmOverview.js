import { adminSupabase } from './adminSupabase.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

export async function getCompanyOverview(companyId, { interactionsLimit = 5, workItemsLimit = 5 } = {}) {
  if (!companyId) throw new Error('companyId requerido');
  const supabase = ensureAdmin();

  const companyPromise = supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  const contactsPromise = supabase
    .from('contacts')
    .select('id, name, email, role, sentiment, updated_at')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false, nullsLast: true })
    .limit(20);

  const workItemsPromise = supabase
    .from('work_items')
    .select(
      `
        id,
        title,
        status,
        priority,
        due_date,
        updated_at,
        assignee:contacts!work_items_assignee_contact_id_fkey(id, name, email)
      `,
    )
    .eq('company_id', companyId)
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsLast: true })
    .limit(workItemsLimit);

  const interactionsPromise = supabase
    .from('interactions')
    .select(
      `
        id,
        occurred_at,
        channel,
        notes,
        requirements,
        kpis,
        budget,
        contact:contacts(id, name, email),
        data
      `,
    )
    .eq('company_id', companyId)
    .order('occurred_at', { ascending: false })
    .limit(interactionsLimit);

  const freshDataPromise = supabase
    .from('fresh_data')
    .select('id, topic, source, title, summary, detected_at, published_at')
    .eq('company_id', companyId)
    .order('detected_at', { ascending: false })
    .limit(10);

  const pipelinePromise = supabase
    .from('interactions')
    .select('budget')
    .eq('company_id', companyId)
    .not('budget', 'is', null);

  const sentimentBreakdownPromise = supabase.rpc('sentiment_breakdown', { p_company: companyId });
  const workItemsStatusPromise = supabase.rpc('work_items_status_breakdown', { p_company: companyId });

  const [
    companyRes,
    contactsRes,
    workItemsRes,
    interactionsRes,
    freshDataRes,
    pipelineRes,
    sentimentRes,
    statusRes,
  ] = await Promise.all([
    companyPromise,
    contactsPromise,
    workItemsPromise,
    interactionsPromise,
    freshDataPromise,
    pipelinePromise,
    sentimentBreakdownPromise,
    workItemsStatusPromise,
  ]);

  if (companyRes.error) throw companyRes.error;
  if (contactsRes.error) throw contactsRes.error;
  if (workItemsRes.error) throw workItemsRes.error;
  if (interactionsRes.error) throw interactionsRes.error;
  if (freshDataRes.error) throw freshDataRes.error;
  if (pipelineRes.error) throw pipelineRes.error;
  if (sentimentRes.error) throw sentimentRes.error;
  if (statusRes.error) throw statusRes.error;

  const budgets = (pipelineRes.data || []).map((row) => Number(row.budget) || 0);
  const totalBudget = budgets.reduce((sum, value) => sum + value, 0);
  const avgBudget = budgets.length ? totalBudget / budgets.length : 0;

  return {
    company: companyRes.data,
    contacts: contactsRes.data || [],
    workItems: workItemsRes.data || [],
    interactions: interactionsRes.data || [],
    freshData: freshDataRes.data || [],
    pipeline: {
      totalBudget,
      avgBudget,
      dealsCount: budgets.length,
    },
    sentiment: sentimentRes.data || [],
    workItemsStatus: statusRes.data || [],
  };
}

export async function getContactOverview(contactId, { interactionsLimit = 5, workItemsLimit = 5 } = {}) {
  if (!contactId) throw new Error('contactId requerido');
  const supabase = ensureAdmin();

  const contactPromise = supabase
    .from('contacts')
    .select(
      `
        id,
        name,
        email,
        phone,
        role,
        sentiment,
        person_kind,
        is_client,
        is_supplier,
        updated_at,
        company:companies(id, name, industry)
      `,
    )
    .eq('id', contactId)
    .single();

  const interactionsPromise = supabase
    .from('interactions')
    .select(
      `
        id,
        occurred_at,
        channel,
        notes,
        requirements,
        kpis,
        budget,
        company:companies(id, name)
      `,
    )
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false })
    .limit(interactionsLimit);

  const workItemsPromise = supabase
    .from('work_items')
    .select(
      `
        id,
        title,
        status,
        priority,
        due_date,
        updated_at,
        company:companies(id, name)
      `,
    )
    .or(`assignee_contact_id.eq.${contactId},owner_contact_id.eq.${contactId}`)
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsLast: true })
    .limit(workItemsLimit);

  const freshDataPromise = supabase
    .from('fresh_data')
    .select('id, topic, source, title, summary, detected_at')
    .eq('company_id', (await contactPromise)?.data?.company?.id || null)
    .order('detected_at', { ascending: false })
    .limit(5);

  const pipelinePromise = supabase
    .from('interactions')
    .select('budget')
    .eq('contact_id', contactId)
    .not('budget', 'is', null);

  const statusPromise = supabase.rpc('work_items_status_breakdown', {
    p_company: (await contactPromise)?.data?.company?.id || null,
  });

  const [
    contactRes,
    interactionsRes,
    workItemsRes,
    freshDataRes,
    pipelineRes,
    statusRes,
  ] = await Promise.all([
    contactPromise,
    interactionsPromise,
    workItemsPromise,
    freshDataPromise,
    pipelinePromise,
    statusPromise,
  ]);

  if (contactRes.error) throw contactRes.error;
  if (interactionsRes.error) throw interactionsRes.error;
  if (workItemsRes.error) throw workItemsRes.error;
  if (freshDataRes.error) throw freshDataRes.error;
  if (pipelineRes.error) throw pipelineRes.error;
  if (statusRes.error) throw statusRes.error;

  const budgets = (pipelineRes.data || []).map((row) => Number(row.budget) || 0);
  const totalBudget = budgets.reduce((sum, value) => sum + value, 0);

  return {
    contact: contactRes.data,
    interactions: interactionsRes.data || [],
    workItems: workItemsRes.data || [],
    freshData: freshDataRes.data || [],
    pipeline: {
      totalBudget,
      dealsCount: budgets.length,
    },
    workItemsStatus: statusRes.data || [],
  };
}

