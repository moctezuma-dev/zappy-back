import { adminSupabase } from './adminSupabase.js';
import { getMockDataset } from '../data/mockDataset.js';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

// Mapeo de canales a channel_type enum
const CHANNEL_MAP = {
  email: 'email',
  slack: 'chat',
  whatsapp: 'chat',
  call: 'call',
  video: 'meeting',
  meeting: 'meeting',
  social: 'social',
  web: 'web',
};

function safeGetDataset() {
  try {
    return getMockDataset();
  } catch (error) {
    console.warn('[ingestService] No se pudo cargar el mockDataset:', error.message);
    return null;
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function resolveContactContext({ email, name, company, phone }) {
  const dataset = safeGetDataset();
  if (!dataset) return null;

  const emailLower = normalizeText(email);
  const normalizedName = normalizeText(name);
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : null;

  let contact =
    (normalizedPhone &&
      dataset.contacts.find((item) => item.phone && item.phone.trim() === normalizedPhone)) ||
    (emailLower &&
      dataset.contacts.find((item) => item.email && normalizeText(item.email) === emailLower)) ||
    (normalizedName &&
      dataset.contacts.find((item) => {
        if (!item.name) return false;
        const matchesName = normalizeText(item.name) === normalizedName;
        if (!matchesName) return false;
        if (!company) return true;
        return item.company === company;
      })) ||
    null;

  let companyRecord =
    (company && dataset.companies.find((item) => item.name === company)) ||
    (contact && dataset.companies.find((item) => item.name === contact.company)) ||
    null;

  if (!contact && !companyRecord) {
    return null;
  }

  const context = {};

  if (contact) {
    context.contact = {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone || normalizedPhone,
      role: contact.role,
      departments: contact.departments || [],
      deals: contact.deals || [],
      requirements: contact.requirements || [],
      kpis: contact.kpis || [],
      topics: contact.topics || [],
      channels: contact.channels || [],
    };
    if (!companyRecord && contact.company) {
      companyRecord = dataset.companies.find((item) => item.name === contact.company) || null;
    }
  }

  if (companyRecord) {
    context.company = {
      name: companyRecord.name,
      domain: companyRecord.domain,
      topics: companyRecord.topics || [],
    };
  } else if (company) {
    context.company = { name: company };
  }

  return Object.keys(context).length > 0 ? context : null;
}

/**
 * Normaliza datos de email a estructura de interactions
 */
export function normalizeEmail(emailData) {
  const {
    from,
    to,
    subject,
    body,
    date,
    attachments = [],
    metadata = {},
  } = emailData;

  // Extraer nombre y email del remitente
  const fromMatch = from?.match(/^(.+?)\s*<(.+?)>$/) || [null, from, from];
  const fromName = fromMatch[1]?.trim() || from || 'Desconocido';
  const fromEmail = fromMatch[2]?.trim() || from || null;

  // Construir notas combinando subject y body
  const notes = `Asunto: ${subject || 'Sin asunto'}\n\n${body || ''}`;

  const context = resolveContactContext({
    email: fromEmail,
    name: fromName,
    company: metadata.company || emailData.company,
  });
  const metadataPayload = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  const dataPayload = {
    from: fromEmail,
    to,
    subject,
    attachments: attachments.length > 0 ? attachments : null,
    ...metadataPayload,
  };
  if (context) {
    dataPayload.context = context;
  }

  return {
    channel: CHANNEL_MAP.email || 'email',
    occurred_at: date || new Date().toISOString(),
    notes,
    participants: [fromName, to].filter(Boolean),
    data: dataPayload,
  };
}

/**
 * Normaliza datos de Slack a estructura de interactions
 */
export function normalizeSlack(slackData) {
  const {
    user,
    channel,
    text,
    thread_ts,
    ts,
    attachments = [],
    metadata = {},
  } = slackData;

  const notes = text || '';
  const occurredAt = ts ? new Date(parseFloat(ts) * 1000).toISOString() : new Date().toISOString();

  const context = resolveContactContext({
    email: user?.email,
    name: user?.real_name || user?.name,
    company: metadata.company || slackData.company,
  });
  const metadataPayload = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  const dataPayload = {
    channel: channel?.name || channel,
    thread_ts,
    attachments: attachments.length > 0 ? attachments : null,
    ...metadataPayload,
  };
  if (context) {
    dataPayload.context = context;
  }

  return {
    channel: CHANNEL_MAP.slack || 'chat',
    occurred_at: occurredAt,
    notes,
    participants: [user?.name || user?.real_name || user || 'Usuario Slack'].filter(Boolean),
    data: dataPayload,
  };
}

/**
 * Normaliza datos de WhatsApp a estructura de interactions
 */
export function normalizeWhatsApp(whatsappData) {
  const {
    from,
    to,
    message,
    timestamp,
    media = null,
    metadata = {},
    email,
    contactName,
    company,
  } = whatsappData;

  const notes = message || '';
  let occurredAt;
  let parsedDate = null;
  if (timestamp instanceof Date) {
    parsedDate = timestamp;
  } else if (typeof timestamp === 'number') {
    parsedDate = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
  } else if (typeof timestamp === 'string' && timestamp.trim().length > 0) {
    const numeric = Number(timestamp);
    if (!Number.isNaN(numeric) && isFinite(numeric)) {
      parsedDate = new Date(numeric > 1e12 ? numeric : numeric * 1000);
    } else {
      parsedDate = new Date(timestamp);
    }
  } else {
    parsedDate = new Date();
  }

  try {
    occurredAt = (parsedDate || new Date()).toISOString();
  } catch {
    occurredAt = new Date().toISOString();
  }

  const context = resolveContactContext({
    email: email || metadata.email,
    name: contactName || metadata.contactName,
    company: metadata.company || company,
    phone: from,
  });
  const metadataPayload = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  const dataPayload = {
    from,
    to,
    media,
    ...metadataPayload,
  };
  if (context) {
    dataPayload.context = context;
  }

  return {
    channel: CHANNEL_MAP.whatsapp || 'chat',
    occurred_at: occurredAt,
    notes,
    participants: [from, to].filter(Boolean),
    data: dataPayload,
  };
}

/**
 * Busca o crea un contacto basado en nombre/email
 */
async function findOrCreateContact(supabase, name, email, companyName) {
  if (!name && !email) return null;

  // Buscar por email primero
  if (email) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('email', email)
      .limit(1)
      .single();
    if (existing) return existing.id;
  }

  // Buscar por nombre
  if (name) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('name', name)
      .limit(1)
      .single();
    if (existing) return existing.id;
  }

  // Si no existe, crear contacto básico
  let companyId = null;
  if (companyName) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('name', companyName)
      .limit(1)
      .single();
    companyId = company?.id || null;
  }

  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      name: name || 'Contacto sin nombre',
      email: email || null,
      company: companyName || null,
      company_id: companyId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[ingest] Error creando contacto:', error);
    return null;
  }

  return newContact?.id || null;
}

/**
 * Busca company_id por nombre
 */
async function findCompanyId(supabase, companyName) {
  if (!companyName) return null;
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('name', companyName)
    .limit(1)
    .single();
  return data?.id || null;
}

/**
 * Inserta una interacción normalizada en la base de datos
 * Retorna el ID de la interacción insertada
 */
export async function insertInteraction(normalizedData, contactInfo = {}) {
  const supabase = ensureAdmin();

  // Buscar o crear contacto si hay información
  let contactId = null;
  if (contactInfo.name || contactInfo.email) {
    contactId = await findOrCreateContact(
      supabase,
      contactInfo.name,
      contactInfo.email,
      contactInfo.company
    );
  }

  // Buscar company_id si hay nombre de compañía
  let companyId = null;
  if (contactInfo.company) {
    companyId = await findCompanyId(supabase, contactInfo.company);
  }

  // Insertar interacción
  const interactionData = {
    ...normalizedData,
    contact_id: contactId,
    company_id: companyId,
  };

  const { data, error } = await supabase
    .from('interactions')
    .insert(interactionData)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Error insertando interacción: ${error.message}`);
  }

  return {
    interactionId: data.id,
    contactId,
    companyId,
  };
}

