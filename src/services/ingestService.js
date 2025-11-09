import { adminSupabase } from './adminSupabase.js';

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

  return {
    channel: CHANNEL_MAP.email || 'email',
    occurred_at: date || new Date().toISOString(),
    notes,
    participants: [fromName, to].filter(Boolean),
    data: {
      from: fromEmail,
      to,
      subject,
      attachments: attachments.length > 0 ? attachments : null,
      ...metadata,
    },
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

  return {
    channel: CHANNEL_MAP.slack || 'chat',
    occurred_at: occurredAt,
    notes,
    participants: [user?.name || user?.real_name || user || 'Usuario Slack'].filter(Boolean),
    data: {
      channel: channel?.name || channel,
      thread_ts,
      attachments: attachments.length > 0 ? attachments : null,
      ...metadata,
    },
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
  } = whatsappData;

  const notes = message || '';
  const occurredAt = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

  return {
    channel: CHANNEL_MAP.whatsapp || 'chat',
    occurred_at: occurredAt,
    notes,
    participants: [from, to].filter(Boolean),
    data: {
      media,
      ...metadata,
    },
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

