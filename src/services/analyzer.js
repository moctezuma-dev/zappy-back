import { adminSupabase } from './adminSupabase.js';
import { analyzeInteractionText, hasModel } from './gemini.js';
import {
  upsertInteractionContext,
  upsertWorkItemContext,
  upsertFreshDataContext,
} from './contextIndexer.js';
import { upsertAlert, resolveAlertsByEntity } from './alertsService.js';
import { computeCompanyHealth, computeContactHealth } from './healthService.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

function simpleSentiment(text = '') {
  const t = (text || '').toLowerCase();
  const positives = ['bien', 'bueno', 'excelente', 'genial', 'gracias', 'ok', 'listo', 'perfecto', 'positivo'];
  const negatives = ['mal', 'problema', 'fallo', 'error', 'retraso', 'no', 'negativo'];
  let score = 0;
  for (const w of positives) if (t.includes(w)) score += 1;
  for (const w of negatives) if (t.includes(w)) score -= 1;
  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}

/**
 * Crea work_items automáticamente desde next_steps extraídos
 */
async function createWorkItemsFromNextSteps(supabase, nextSteps, interaction) {
  if (!nextSteps || !Array.isArray(nextSteps) || nextSteps.length === 0) {
    return [];
  }

  const workItems = [];
  for (const step of nextSteps) {
    if (!step.title) continue;

    const workItemData = {
      title: step.title,
      description: `Generado automáticamente desde interacción ${interaction.channel || 'other'}`,
      status: 'pending',
      priority: step.priority === 'high' ? 'high' : step.priority === 'critical' ? 'critical' : 'medium',
      owner_contact_id: interaction.contact_id,
      assignee_contact_id: interaction.contact_id,
      company_id: interaction.company_id,
      department_id: interaction.department_id,
      due_date: step.due_date ? new Date(step.due_date).toISOString() : null,
      data: {
        source_interaction_id: interaction.id,
        source_channel: interaction.channel,
        auto_generated: true,
      },
    };

    const { data, error } = await supabase
      .from('work_items')
      .insert(workItemData)
      .select('id')
      .single();

    if (!error && data) {
      workItems.push(data.id);
    } else {
      console.error('[analyzer] Error creando work_item:', error);
    }
  }

  return workItems;
}

/**
 * Actualiza la interacción con los datos extraídos por Gemini
 */
async function updateInteractionWithAnalysis(supabase, interactionId, analysis) {
  const updateData = {};

  if (analysis.budget) {
    updateData.budget = analysis.budget;
    updateData.currency = analysis.currency || 'USD';
  }

  if (analysis.requirements && analysis.requirements.length > 0) {
    updateData.requirements = analysis.requirements;
  }

  if (analysis.kpis && analysis.kpis.length > 0) {
    updateData.kpis = analysis.kpis;
  }

  if (analysis.next_steps && analysis.next_steps.length > 0) {
    const firstDeadline = analysis.next_steps
      .map((s) => s.due_date)
      .filter(Boolean)
      .sort()[0];
    if (firstDeadline) {
      updateData.deadline = new Date(firstDeadline).toISOString();
    }
  }

  if (Object.keys(updateData).length > 0) {
    await supabase
      .from('interactions')
      .update(updateData)
      .eq('id', interactionId);
  }
}

async function analyzeInteraction(row) {
  const supabase = ensureAdmin();
  
  // Intentar análisis con Gemini primero
  let analysis = null;
  if (hasModel() && row.notes) {
    try {
      analysis = await analyzeInteractionText({
        notes: row.notes,
        channel: row.channel,
        participants: Array.isArray(row.participants) ? row.participants : [],
      });
    } catch (error) {
      console.error('[analyzer] Error en análisis Gemini:', error);
    }
  }

  // Fallback a análisis básico si Gemini no está disponible o falla
  const summary = analysis?.summary || `Interacción ${row.channel || 'other'} con notas: ${(row.notes || '').slice(0, 160)}`;
  const sentiment = analysis?.sentiment || simpleSentiment(row.notes);
  const next_steps = analysis?.next_steps || (row.deadline ? [{ title: `Dar seguimiento antes de ${row.deadline}`, due_date: row.deadline }] : []);

  const output = {
    summary,
    sentiment,
    urgency: analysis?.urgency || 'medium',
    interaction_type: analysis?.interaction_type || 'other',
    requirements: analysis?.requirements || [],
    kpis: analysis?.kpis || [],
    budget: analysis?.budget || null,
    currency: analysis?.currency || null,
    next_steps,
    topics: analysis?.topics || [],
    risks: analysis?.risks || [],
    opportunities: analysis?.opportunities || [],
    analysis_method: analysis ? 'gemini' : 'heuristic',
  };

  // Guardar análisis en jobs
  await supabase.from('jobs').insert({
    type: 'analysis',
    status: 'completed',
    input_data: row,
    output_data: output,
  });

  // Actualizar la interacción con datos extraídos
  if (analysis) {
    await updateInteractionWithAnalysis(supabase, row.id, analysis);
  }

  // Generar work_items automáticamente desde next_steps
  const workItemIds = await createWorkItemsFromNextSteps(supabase, next_steps, row);
  if (workItemIds.length > 0) {
    output.generated_work_items = workItemIds;
  }

  // Alertas: sentimiento negativo o urgencia alta/crítica
  const shouldAlert =
    sentiment === 'negative' || analysis?.urgency === 'high' || analysis?.urgency === 'critical';
  const overdueStep = next_steps.find((step) => {
    if (!step?.due_date) return false;
    return new Date(step.due_date).getTime() < Date.now();
  });

  if (shouldAlert || overdueStep) {
    const severity =
      analysis?.urgency === 'critical'
        ? 'critical'
        : analysis?.urgency === 'high' || sentiment === 'negative'
        ? 'high'
        : 'medium';
    const message = overdueStep
      ? `Seguimiento vencido: ${overdueStep.title}`
      : `Interacción con sentimiento ${sentiment} y urgencia ${analysis?.urgency || 'medium'}`;

    await upsertAlert({
      entityType: 'interaction',
      entityId: row.id,
      severity,
      message,
      companyId: row.company_id,
      contactId: row.contact_id,
      data: {
        sentiment,
        urgency: analysis?.urgency,
        next_steps: next_steps,
      },
    });
  } else {
    await resolveAlertsByEntity('interaction', row.id).catch((err) =>
      console.warn('[analyzer] resolve alert error', err),
    );
  }

  // Indexar contexto para búsquedas semánticas
  try {
    await upsertInteractionContext(row, output);
  } catch (error) {
    console.error('[analyzer] Error indexando interacción:', error);
  }

  // Actualizar contacto: última actualización y sentimiento
  if (row.contact_id) {
    await supabase
      .from('contacts')
      .update({
        updated_at: new Date().toISOString(),
        sentiment,
      })
      .eq('id', row.contact_id);
  }

  // Recalcular health score
  if (row.contact_id) {
    computeContactHealth(row.contact_id, row.company_id).catch((err) =>
      console.warn('[analyzer] computeContactHealth error', err),
    );
  }
  if (row.company_id) {
    computeCompanyHealth(row.company_id).catch((err) =>
      console.warn('[analyzer] computeCompanyHealth error', err),
    );
  }

  return output;
}

async function analyzeWorkItem(row) {
  const supabase = ensureAdmin();
  const isLate = row.due_date ? new Date(row.due_date).getTime() < Date.now() && row.status !== 'completed' : false;
  const summary = `WorkItem "${row.title}" prioridad ${row.priority}, estado ${row.status}${isLate ? ' (atrasado)' : ''}`;
  const output = { summary, isLate };
  await supabase.from('jobs').insert({ type: 'analysis', status: 'completed', input_data: row, output_data: output });

  if (isLate) {
    await upsertAlert({
      entityType: 'work_item',
      entityId: row.id,
      severity: row.priority === 'high' || row.priority === 'critical' ? 'high' : 'medium',
      message: `Work item atrasado: ${row.title}`,
      companyId: row.company_id,
      contactId: row.assignee_contact_id || row.owner_contact_id,
      data: {
        due_date: row.due_date,
        priority: row.priority,
        status: row.status,
      },
    });
  } else {
    await resolveAlertsByEntity('work_item', row.id).catch((err) =>
      console.warn('[analyzer] resolve alert error', err),
    );
  }

  try {
    await upsertWorkItemContext(row, output);
  } catch (error) {
    console.error('[analyzer] Error indexando work_item:', error);
  }

  if (row.company_id) {
    computeCompanyHealth(row.company_id).catch((err) =>
      console.warn('[analyzer] computeCompanyHealth error', err),
    );
  }
  return output;
}

async function analyzeContact(row) {
  const supabase = ensureAdmin();
  // Si tiene company por nombre pero no company_id, enlazar
  if (row.company && !row.company_id) {
    const { data: comps } = await supabase.from('companies').select('id').eq('name', row.company).limit(1);
    const company_id = comps?.[0]?.id || null;
    if (company_id) await supabase.from('contacts').update({ company_id }).eq('id', row.id);
  }
  const output = { summary: `Contacto ${row.name || row.email || row.id}` };
  await supabase.from('jobs').insert({ type: 'analysis', status: 'completed', input_data: row, output_data: output });
  return output;
}

async function analyzeFreshData(row) {
  const supabase = ensureAdmin();
  const summary = `Señal: ${row.title || row.topic || 'fresh_data'} (${row.source || 'desconocido'})`;
  const output = { summary };
  await supabase.from('jobs').insert({ type: 'analysis', status: 'completed', input_data: row, output_data: output });

  try {
    await upsertFreshDataContext(row, output);
  } catch (error) {
    console.error('[analyzer] Error indexando fresh_data:', error);
  }

  if (row.company_id) {
    computeCompanyHealth(row.company_id).catch((err) =>
      console.warn('[analyzer] computeCompanyHealth error', err),
    );
  }
  return output;
}

export async function analyzeRecord(type, row) {
  switch (type) {
    case 'interactions':
      return analyzeInteraction(row);
    case 'work_items':
      return analyzeWorkItem(row);
    case 'contacts':
      return analyzeContact(row);
    case 'fresh_data':
      return analyzeFreshData(row);
    default:
      return { summary: 'Tipo no soportado', type };
  }
}

export async function triggerManualAnalysis({ type = 'interactions', id = null, limit = 10 } = {}) {
  const supabase = ensureAdmin();
  const table = type;
  let rows = [];
  if (id) {
    const { data } = await supabase.from(table).select('*').eq('id', id).limit(1);
    rows = data || [];
  } else {
    const { data } = await supabase.from(table).select('*').limit(limit);
    rows = data || [];
  }
  for (const r of rows) await analyzeRecord(type, r);
  return { count: rows.length };
}