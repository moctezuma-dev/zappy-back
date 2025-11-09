import { Router } from 'express';
import { adminSupabase } from '../services/adminSupabase.js';
import {
  hasModel,
  hasEmbeddingModel,
  embedText,
  generateChatResponse,
} from '../services/gemini.js';
import { listAlerts, resolveAlertById } from '../services/alertsService.js';
import { getTimeline } from '../services/crmTimeline.js';
import { getActionableInsights } from '../services/crmActionable.js';
import { getTrends } from '../services/crmTrends.js';

const router = Router();

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

async function fetchSessionMessages(supabase, sessionId, limit = 20) {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function insertMessage(supabase, { sessionId, role, content, context = null }) {
  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      context,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data?.id || null;
}

function buildContextText(results) {
  if (!results?.length) return null;
  return results
    .map((item, idx) => {
      const header = `[${idx + 1}] ${item.type} (${item.similarity?.toFixed?.(3) ?? '0.000'})`;
      const metadata = item.metadata ? JSON.stringify(item.metadata) : '';
      const snippet = item.text?.slice(0, 1000) || '';
      return `${header}\n${metadata}\n${snippet}`;
    })
    .join('\n\n');
}

async function logToolCall(supabase, messageId, toolName, inputData, outputData) {
  if (!messageId) return;
  try {
    await supabase.from('ai_tool_calls').insert({
      message_id: messageId,
      tool_name: toolName,
      input: inputData,
      output: outputData,
    });
  } catch (error) {
    console.warn('[chat] logToolCall error', error);
  }
}

router.post('/', async (req, res) => {
  try {
    if (!hasModel()) {
      return res.status(503).json({ ok: false, error: 'Gemini no configurado' });
    }
    if (!hasEmbeddingModel()) {
      return res.status(503).json({ ok: false, error: 'Servicio de embeddings no configurado' });
    }

    const {
      sessionId,
      question,
      companyId = null,
      contactId = null,
      userId = null,
      topK = 5,
      tools = [],
      action = null,
    } = req.body || {};

    if (!question) {
      return res.status(400).json({ ok: false, error: 'El campo question es requerido' });
    }

    const supabase = ensureAdmin();
    let finalSessionId = sessionId;
    const toolData = {};
    const toolTexts = [];

    if (!finalSessionId) {
      const { data, error } = await supabase
        .from('ai_sessions')
        .insert({
          title: question.slice(0, 80),
          company_id: companyId,
          user_id: userId,
        })
        .select('id')
        .single();
      if (error) throw error;
      finalSessionId = data.id;
    }

    // Registrar mensaje del usuario
    const userMessageId = await insertMessage(supabase, {
      sessionId: finalSessionId,
      role: 'user',
      content: question,
    });

    if (action?.type === 'create_work_item') {
      try {
        const payload = action.payload || {};
        const workItem = await createWorkItem({
          title: payload.title || question.slice(0, 64),
          description: payload.description || '',
          companyId: payload.companyId || companyId || null,
          assigneeContactId: payload.assigneeContactId || contactId || null,
          dueDate: payload.dueDate || null,
          priority: payload.priority || 'medium',
          data: { source: 'chat_action', question },
        });
        toolData.actions = { ...(toolData.actions || {}), create_work_item: workItem };
        toolTexts.push(
          `Acción ejecutada: se creó un work item "${workItem.title}" (vencimiento ${workItem.due_date || 'N/A'})`,
        );
        await logToolCall(supabase, userMessageId, 'create_work_item', payload, workItem);
      } catch (error) {
        toolTexts.push(`No se pudo crear el work item: ${error.message}`);
        await logToolCall(supabase, userMessageId, 'create_work_item', action.payload || {}, {
          error: error.message,
        });
      }
    }

    if (action?.type === 'resolve_alert') {
      try {
        const payload = action.payload || {};
        if (!payload.alertId) throw new Error('alertId requerido');
        await resolveAlertById(payload.alertId);
        toolData.actions = {
          ...(toolData.actions || {}),
          resolve_alert: { alertId: payload.alertId, status: 'resolved' },
        };
        toolTexts.push(`Acción ejecutada: alerta ${payload.alertId} marcada como resuelta.`);
        await logToolCall(supabase, userMessageId, 'resolve_alert', payload, { resolved: true });
      } catch (error) {
        toolTexts.push(`No se pudo resolver la alerta: ${error.message}`);
        await logToolCall(supabase, userMessageId, 'resolve_alert', action.payload || {}, {
          error: error.message,
        });
      }
    }

    // Buscar contexto relevante
    let embedding = [];
    let hasValidEmbedding = false;
    try {
      embedding = await embedText({ text: question, taskType: 'RETRIEVAL_QUERY' });
      // Validar que el embedding tenga al menos 1 dimensión
      if (Array.isArray(embedding) && embedding.length > 0) {
        hasValidEmbedding = true;
      } else {
        console.warn('[chat] Embedding vacío o inválido, usando búsqueda sin contexto semántico');
      }
    } catch (error) {
      // Si hay un error con la API key, devolver un error claro
      if (error.message?.includes('API key de Google Gemini no es válida')) {
        return res.status(503).json({ 
          ok: false, 
          error: 'API key de Google Gemini no es válida. Por favor, verifica la configuración de GOOGLE_GEMINI_API_KEY' 
        });
      }
      console.warn('[chat] Error generando embedding:', error.message);
      // Continuar sin embedding, usar búsqueda básica
    }
    
    let contextResults = [];
    if (hasValidEmbedding) {
      try {
        const { data, error: searchError } = await supabase.rpc('match_ai_contexts', {
          query_embedding: embedding,
          match_count: Math.min(Number(topK) || 5, 20),
          filter_company: companyId || null,
          filter_contact: contactId || null,
        });
        if (searchError) {
          console.warn('[chat] Error en búsqueda semántica:', searchError);
          // Continuar sin contexto semántico
        } else {
          contextResults = data || [];
        }
      } catch (error) {
        console.warn('[chat] Error en búsqueda vectorial:', error.message);
        // Continuar sin contexto semántico
      }
    }

    const contexts = (contextResults || []).map((item) => ({
      id: item.id,
      type: item.type,
      sourceId: item.source_id,
      companyId: item.company_id,
      contactId: item.contact_id,
      text: item.text,
      metadata: item.metadata,
      similarity: item.similarity,
    }));

    // Fallback a datos de Supabase cuando no hay contexto semántico
    if (contexts.length === 0) {
      const fallbackChunks = [];

      // 1) Fresh data recientes (noticias internas)
      try {
        const { data: freshDataRows, error: freshError } = await supabase
          .from('fresh_data')
          .select('id, company_id, source, title, topic, summary, published_at')
          .order('published_at', { ascending: false })
          .limit(5);

        if (!freshError && freshDataRows?.length) {
          const formatted = freshDataRows
            .map((row, idx) => {
              const published = row.published_at ? new Date(row.published_at).toISOString().split('T')[0] : 'sin fecha';
              return `FreshData ${idx + 1}: ${row.title} (${published})\nFuente: ${row.source || 'desconocida'}\nTema: ${row.topic || 'N/A'}\nResumen: ${row.summary || 'sin resumen'}`;
            })
            .join('\n\n');

          fallbackChunks.push(`Noticias internas:
${formatted}`);

          // Convertir a contextos para la IA
          for (const row of freshDataRows) {
            contexts.push({
              id: row.id,
              type: 'fresh_data_fallback',
              sourceId: row.id,
              companyId: row.company_id,
              contactId: null,
              text: `Noticia: ${row.title}\nFuente: ${row.source || 'desconocida'}\nTema: ${row.topic || 'N/A'}\nResumen: ${row.summary || 'sin resumen'}`,
              metadata: { source: row.source, topic: row.topic, published_at: row.published_at },
              similarity: null,
            });
          }

          toolData.freshData = freshDataRows;
        }
      } catch (error) {
        console.warn('[chat] fallback fresh_data error', error.message);
      }

      // 2) Knowledge base fallback usando búsqueda textual simple
      try {
        const keywords = question
          .split(/[^\p{L}\p{N}]+/u)
          .map((word) => word.trim())
          .filter((word) => word.length >= 4)
          .slice(0, 3);

        let knowledgeQuery = supabase
          .from('knowledge_entries')
          .select('id, company_id, title, content, metadata, created_at')
          .order('created_at', { ascending: false })
          .limit(5);

        if (companyId) knowledgeQuery = knowledgeQuery.eq('company_id', companyId);

        if (keywords.length > 0) {
          const ilikeFilters = keywords
            .map((word) => `content.ilike.%${word}%`)
            .join(',');
          knowledgeQuery = knowledgeQuery.or(ilikeFilters);
        } else {
          knowledgeQuery = knowledgeQuery.ilike('content', `%${question.slice(0, 50)}%`);
        }

        const { data: knowledgeRows, error: knowledgeFallbackError } = await knowledgeQuery;

        if (!knowledgeFallbackError && knowledgeRows?.length) {
          const formatted = knowledgeRows
            .map((row, idx) => {
              const snippet = row.content?.slice(0, 280) || 'sin contenido';
              return `Knowledge ${idx + 1}: ${row.title || 'Documento sin título'}\n${snippet}`;
            })
            .join('\n\n');

          fallbackChunks.push(`Documentación relacionada:
${formatted}`);

          for (const row of knowledgeRows) {
            contexts.push({
              id: row.id,
              type: 'knowledge_fallback',
              sourceId: row.id,
              companyId: row.company_id,
              contactId: null,
              text: `${row.title || 'Documento'}\n${row.content?.slice(0, 1000) || ''}`,
              metadata: row.metadata || {},
              similarity: null,
            });
          }

          toolData.knowledgeFallback = knowledgeRows;
        }
      } catch (error) {
        console.warn('[chat] fallback knowledge error', error.message);
      }

      if (fallbackChunks.length > 0) {
        toolTexts.push(fallbackChunks.join('\n\n'));
      }
    }

    const contextText = buildContextText(contexts);

    if (Array.isArray(tools) && tools.length > 0) {
      const normalizedTools = tools.map((t) => String(t || '').toLowerCase());

      if (normalizedTools.includes('alerts')) {
        const { data: alerts = [] } = await listAlerts({
          status: 'open',
          companyId,
          contactId,
          limit: 5,
        });
        toolData.alerts = alerts;
        if (alerts.length) {
          const formatted = alerts
            .map(
              (alert, idx) =>
                `[Alert ${idx + 1}] ${alert.severity?.toUpperCase?.()}: ${alert.message} (entity: ${alert.entity_type} ${
                  alert.entity_id
                })`,
            )
            .join('\n');
          toolTexts.push(`Alertas abiertas:\n${formatted}`);
        }
      }

      if (normalizedTools.includes('risk_contacts')) {
        const actionable = await getActionableInsights({ companyId });
        toolData.actionable = actionable;
        const riskyContacts = actionable?.risky_contacts || [];
        if (riskyContacts.length) {
          const formatted = riskyContacts
            .slice(0, 5)
            .map(
              (rc, idx) =>
                `[Contacto Riesgo ${idx + 1}] ${rc.name} (${rc.company_name || 'sin empresa'}) - Sentiment: ${
                  rc.sentiment || 'desconocido'
                }, última interacción: ${rc.last_interaction_at || 'desconocida'}`,
            )
            .join('\n');
          toolTexts.push(`Contactos con riesgo:\n${formatted}`);
        }
      }

      if (normalizedTools.includes('timeline')) {
        const timeline = await getTimeline({ companyId, contactId, limit: 5 });
        toolData.timeline = timeline;
        if (timeline.entries?.length) {
          const formatted = timeline.entries
            .map(
              (entry, idx) =>
                `[Timeline ${idx + 1}] ${entry.type} (${entry.channel || entry.title || ''}) - ${
                  entry.sortDate || entry.occurredAt || ''
                }`,
            )
            .join('\n');
          toolTexts.push(`Timeline reciente:\n${formatted}`);
        }
      }

      if (normalizedTools.includes('trends')) {
        const trends = await getTrends({ companyId, days: 30 });
        toolData.trends = trends;
        const lastInteraction = trends.interactions?.slice(-1)[0];
        const lastWork = trends.workItems?.slice(-1)[0];
        const lastFresh = trends.freshData?.slice(-1)[0];
        const summaryParts = [];
        if (lastInteraction) {
          summaryParts.push(
            `Interacciones hoy: ${lastInteraction.total}, con presupuesto: ${lastInteraction.with_budget}`,
          );
        }
        if (lastWork) {
          summaryParts.push(`Work items hoy - creados: ${lastWork.created}, completados: ${lastWork.completed}`);
        }
        if (lastFresh) {
          summaryParts.push(`Señales detectadas hoy: ${lastFresh.total}`);
        }
        if (summaryParts.length) {
          toolTexts.push(`Tendencias (último día registrado):\n${summaryParts.join('\n')}`);
        }
      }

      if (normalizedTools.includes('knowledge')) {
        let knowledgeResults = [];
        if (hasValidEmbedding) {
          try {
            const { data, error: knowledgeError } = await supabase.rpc('match_ai_contexts', {
              query_embedding: embedding,
              match_count: 5,
              filter_company: companyId || null,
              filter_type: 'knowledge',
            });
            if (knowledgeError) {
              console.warn('[chat] knowledge search error', knowledgeError);
            } else {
              knowledgeResults = data || [];
            }
          } catch (error) {
            console.warn('[chat] Error en búsqueda de knowledge:', error.message);
          }
        }
        if (knowledgeResults?.length) {
          const items = knowledgeResults.map(
            (item, idx) =>
              `[Knowledge ${idx + 1}] ${item.metadata?.title || 'Documento'} (sim ${
                item.similarity?.toFixed?.(3) ?? '0.000'
              })`,
          );
          toolData.knowledge = knowledgeResults;
          toolTexts.push(`Documentos relevantes:\n${items.join('\n')}`);
        }
      }
    }

    const toolContextText = toolTexts.length ? toolTexts.join('\n\n') : null;
    const combinedContext = [contextText, toolContextText].filter(Boolean).join('\n\n---\n\n') || null;
    const hasContext = Boolean(combinedContext);

    if (!hasContext) {
      const fallbackAnswer = [
        'No encontré información relevante en la base de datos ni en las herramientas configuradas para responder con hechos verificados.',
        'Te sugiero usar los endpoints de investigación o actualizar la base de conocimiento antes de volver a preguntar.',
        'Opciones recomendadas:',
        '• Registrar documentos con `POST /api/knowledge` o `POST /api/knowledge/upload`.',
        '• Ejecutar búsquedas con `POST /api/knowledge/search` o `POST /api/search/query`.',
        '• Ingerir señales recientes vía `POST /api/news` o los endpoints de ingestión (`/api/ingest/*`).'
      ].join('\n');

      const assistantMessageId = await insertMessage(supabase, {
        sessionId: finalSessionId,
        role: 'assistant',
        content: fallbackAnswer,
        context: { sources: [], tools: toolData },
      });

      if (assistantMessageId && (Object.keys(toolData).length > 0 || toolTexts.length > 0)) {
        await logToolCall(
          supabase,
          assistantMessageId,
          'context_tools',
          { toolsRequested: tools },
          { toolData, summaries: toolTexts }
        );
      }

      return res.json({
        ok: true,
        sessionId: finalSessionId,
        answer: fallbackAnswer,
        sources: [],
        tools: toolData,
      });
    }

    if (action?.type === 'generate_summary') {
      try {
        const summaryPrompt = [
          'Genera un resumen ejecutivo claro y accionable basado en el contexto proporcionado.',
          'Incluye estado actual, riesgos detectados y próximos pasos sugeridos.',
          'No inventes datos fuera del contexto.',
        ].join(' ');
        const summaryText = await generateChatResponse({
          systemPrompt: summaryPrompt,
          messages: [{ role: 'user', content: combinedContext || question }],
          contextText: combinedContext,
        });
        toolData.actions = {
          ...(toolData.actions || {}),
          generate_summary: summaryText,
        };
        toolTexts.push(`Resumen generado:\n${summaryText}`);
        await logToolCall(supabase, userMessageId, 'generate_summary', action.payload || {}, summaryText);
      } catch (error) {
        toolTexts.push(`No se pudo generar el resumen: ${error.message}`);
        await logToolCall(supabase, userMessageId, 'generate_summary', action.payload || {}, {
          error: error.message,
        });
      }
    }
    const history = await fetchSessionMessages(supabase, finalSessionId, 30);

    const systemPrompt = [
      'Eres Relay, el asistente Zero-Click CRM.',
      'Responde utilizando solo la información proporcionada en el contexto o el historial.',
      'Si no hay contexto suficiente, sé honesto y ofrece inferencias claras.',
      'Devuelve respuestas estructuradas, destaca próximos pasos y riesgos, y referencia fuentes cuando sea posible.',
      'No inventes datos y mantén un tono profesional cercano.',
    ].join('\n');

    const answer = await generateChatResponse({
      systemPrompt,
      messages: history.concat([{ role: 'user', content: question }]),
      contextText: combinedContext,
    });

    const assistantMessageId = await insertMessage(supabase, {
      sessionId: finalSessionId,
      role: 'assistant',
      content: answer,
      context: { sources: contexts, tools: toolData },
    });

    if (assistantMessageId && (Object.keys(toolData).length > 0 || toolTexts.length > 0)) {
      await logToolCall(
        supabase,
        assistantMessageId,
        'context_tools',
        { toolsRequested: tools },
        { toolData, summaries: toolTexts },
      );
    }

    return res.json({
      ok: true,
      sessionId: finalSessionId,
      answer,
      sources: contexts,
      tools: toolData,
    });
  } catch (error) {
    console.error('[chat] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;

