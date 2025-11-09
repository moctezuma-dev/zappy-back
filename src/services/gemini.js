import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

let chatModel = null;
let embeddingModel = null;
if (env.GOOGLE_GEMINI_API_KEY) {
  const genAI = new GoogleGenerativeAI(env.GOOGLE_GEMINI_API_KEY);
  chatModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-001' });
  embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
}

export function hasModel() {
  return Boolean(chatModel);
}

export function hasEmbeddingModel() {
  return Boolean(embeddingModel);
}

/**
 * Analiza texto de una interacción (email, slack, whatsapp) y extrae información CRM avanzada
 */
export async function analyzeInteractionText({ notes, channel, participants = [] }) {
  if (!chatModel) {
    // Fallback a análisis básico si Gemini no está configurado
    return null;
  }

  const prompt = `Analiza esta interacción de ${channel || 'comunicación'} y extrae información CRM estructurada.

Contenido de la interacción:
${notes || ''}

Participantes: ${participants.join(', ') || 'No especificados'}

Extrae la siguiente información en formato JSON:
{
  "summary": "Resumen breve de la interacción (máximo 200 caracteres)",
  "sentiment": "positive|neutral|negative",
  "urgency": "low|medium|high|critical",
  "interaction_type": "inquiry|proposal|complaint|follow_up|meeting|other",
  "requirements": ["requerimiento 1", "requerimiento 2"],
  "kpis": ["kpi mencionado 1", "kpi mencionado 2"],
  "budget": 0,
  "currency": "USD",
  "next_steps": [
    {"title": "Título del próximo paso", "due_date": "2025-01-20", "priority": "low|medium|high"}
  ],
  "topics": ["tema 1", "tema 2"],
  "risks": ["riesgo identificado si existe"],
  "opportunities": ["oportunidad identificada si existe"]
}

IMPORTANTE:
- Si se menciona un presupuesto o monto, extrae el valor numérico en "budget"
- Si hay fechas mencionadas para próximos pasos, inclúyelas en formato YYYY-MM-DD
- Si no hay información para un campo, usa null o array vacío según corresponda
- Para "urgency", considera la urgencia implícita del mensaje
- Para "interaction_type", clasifica el tipo de interacción según el contenido`;

  try {
    const result = await chatModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const text = result?.response?.text?.() || '';
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error('[gemini] Error parseando JSON de análisis de interacción:', e);
      return null;
    }
    return json;
  } catch (error) {
    console.error('[gemini] Error analizando interacción:', error);
    return null;
  }
}

export async function processAudio({ base64, mimeType }) {
  if (!chatModel) throw new Error('Gemini no configurado');

  const prompt = `Analiza esta grabación de llamada de ventas y extrae:
1. Transcripción completa identificando quién habla
2. Información del contacto cliente (nombre, empresa, email, teléfono)
3. Detalles de oportunidad de negocio si se menciona (título, monto, etapa)
4. Próximos pasos o compromisos acordados con fechas
5. Sentimiento general de la conversación
6. Temas clave discutidos

Devuelve la información en formato JSON estructurado con el siguiente shape:
{
  "contact": {"name": "", "company": "", "role": "", "email": "", "phone": ""},
  "deal": {"title": "", "value": 0, "currency": "USD", "stage": ""},
  "next_steps": [{"title": "", "due_date": ""}],
  "sentiment": "neutral",
  "topics": [""],
  "transcript": ""
}`;

  const result = await chatModel.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const text = result?.response?.text?.() || '';
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('No se pudo parsear la respuesta JSON de Gemini');
  }
  return json;
}

export async function processVideo({ audio, frames = [] }) {
  if (!chatModel) throw new Error('Gemini no configurado');

  const prompt = `Analiza esta reunión en video considerando tanto el audio como los elementos visuales.
Instrucciones:
1. Genera la transcripción del audio y extrae información CRM clave.
2. Describe brevemente lo que ocurre visualmente (presentaciones, pantallas, productos, personas, texto en pantalla).
3. Identifica elementos visuales relevantes y su relación con la conversación.

Devuelve la información en formato JSON con el siguiente shape:
{
  "contact": {"name": "", "company": "", "role": "", "email": "", "phone": ""},
  "deal": {"title": "", "value": 0, "currency": "USD", "stage": ""},
  "next_steps": [{"title": "", "due_date": ""}],
  "sentiment": "neutral",
  "topics": [""],
  "transcript": "",
  "visual_summary": "",
  "key_visual_elements": [""]
}`;

  const parts = [{ text: prompt }];
  if (audio?.base64 && audio?.mimeType) {
    parts.push({ inlineData: { mimeType: audio.mimeType, data: audio.base64 } });
  }
  for (const frame of frames.slice(0, 8)) {
    if (frame?.base64 && frame?.mimeType?.startsWith('image/')) {
      parts.push({ inlineData: { mimeType: frame.mimeType, data: frame.base64 } });
    }
  }

  const result = await chatModel.generateContent({
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: { responseMimeType: 'application/json' },
  });

  const text = result?.response?.text?.() || '';
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('No se pudo parsear la respuesta JSON de Gemini (video)');
  }
  return json;
}

export async function embedText({ text, taskType = 'RETRIEVAL_DOCUMENT' } = {}) {
  if (!embeddingModel) throw new Error('Gemini embeddings no configurado');
  if (!text) return [];

  const result = await embeddingModel.embedContent({
    content: {
      parts: [{ text }],
    },
    taskType,
  });

  const values = result?.embedding?.values || [];
  return values.map((v) => Number(v));
}

function mapMessagesToGeminiContent(messages = [], contextText = null) {
  const contents = [];
  for (const msg of messages) {
    if (!msg?.content) continue;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    contents.push({
      role,
      parts: [{ text: msg.content }],
    });
  }
  if (contextText) {
    contents.push({
      role: 'user',
      parts: [{ text: `Contexto relevante:\n${contextText}` }],
    });
  }
  return contents;
}

export async function generateChatResponse({
  systemPrompt,
  messages = [],
  contextText = null,
  temperature = 0.3,
  maxOutputTokens = 2048,
} = {}) {
  if (!chatModel) throw new Error('Gemini no configurado');

  const contents = mapMessagesToGeminiContent(messages, contextText);

  const result = await chatModel.generateContent({
    systemInstruction: systemPrompt
      ? {
          role: 'system',
          parts: [{ text: systemPrompt }],
        }
      : undefined,
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  });

  const responseText = result?.response?.text?.() || '';
  return responseText;
}