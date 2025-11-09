import { getMockDataset, getRandomCompany, getRandomContact } from '../data/mockDataset.js';

const SLACK_CHANNEL_FALLBACKS = ['ventas', 'comercial', 'proyectos', 'soporte', 'general'];
const SLACK_EMOJIS = ['👋', '🚀', '💼', '📊', '⚡', '🎯'];
const WHATSAPP_EMOJIS = ['👋', '💼', '📱', '🚀', '🤝'];
const FOLLOWUP_STEPS = [
  'Agendar demo técnica',
  'Preparar propuesta comercial',
  'Revisar requisitos de compliance',
  'Enviar estimación actualizada',
  'Coordinar reunión con dirección',
  'Validar requisitos legales',
];

function randomChoice(array) {
  if (!Array.isArray(array) || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString();
}

function randomFutureDate(minDays, maxDays) {
  const days = randomInt(minDays, maxDays);
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function unique(values) {
  return Array.from(new Set(ensureArray(values)));
}

function pickList(pool, count) {
  const available = unique(pool);
  if (available.length === 0) return [];
  const result = [];
  const working = [...available];
  while (result.length < count && working.length > 0) {
    const index = Math.floor(Math.random() * working.length);
    result.push(working.splice(index, 1)[0]);
  }
  return result;
}

function pickOne(pool, fallback = null) {
  const [item] = pickList(pool, 1);
  if (item) return item;
  if (fallback) return fallback;
  return null;
}

function slugify(value, separator = '-') {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`${separator}{2,}`, 'g'), separator)
    .replace(new RegExp(`^${separator}|${separator}$`, 'g'), '');
}

function ensureContact(dataset) {
  return getRandomContact() || dataset.contacts[0];
}

function resolveCompany(contact, dataset) {
  if (!contact) return getRandomCompany();
  return dataset.companies.find((company) => company.name === contact.company) || getRandomCompany();
}

function pickDeal(contact, dataset) {
  const pool = [...ensureArray(contact?.deals), ...ensureArray(dataset.deals)];
  const fallback = dataset.deals?.[0] || 'Solución integral';
  return pickOne(pool, fallback);
}

function pickRequirements(contact, dataset, count = 2) {
  const pool = [...ensureArray(contact?.requirements), ...ensureArray(dataset.requirements)];
  return pickList(pool, count);
}

function pickKpis(contact, dataset, count = 1) {
  const pool = [...ensureArray(contact?.kpis), ...ensureArray(dataset.kpis)];
  return pickList(pool, count);
}

function pickTopics(contact, company, dataset, count = 2) {
  const pool = [
    ...ensureArray(contact?.topics),
    ...ensureArray(company?.topics),
    ...ensureArray(dataset.topics),
  ];
  return pickList(pool, count);
}

function pickBudget(contact, { min = 10000, max = 200000 } = {}) {
  if (contact?.budgetRange) {
    const { min: rangeMin, max: rangeMax } = contact.budgetRange;
    if (typeof rangeMin === 'number' && typeof rangeMax === 'number' && rangeMin <= rangeMax) {
      return randomInt(rangeMin, rangeMax);
    }
  }
  if (typeof contact?.averageBudget === 'number') {
    const deviation = Math.max(Math.round(contact.averageBudget * 0.3), 1000);
    const lower = Math.max(min, contact.averageBudget - deviation);
    const upper = Math.max(lower, contact.averageBudget + deviation);
    return randomInt(lower, upper);
  }
  return randomInt(min, max);
}

function pickSlackChannel(contact, company) {
  const candidates = [
    contact?.departments?.[0],
    company?.departments?.[0]?.name,
    ...SLACK_CHANNEL_FALLBACKS,
  ]
    .map((value) => slugify(value, '-'))
    .filter(Boolean);
  return pickOne(candidates, 'general') || 'general';
}

function buildSlackUsername(contact) {
  if (contact?.email) {
    return contact.email.split('@')[0];
  }
  return slugify(contact?.name, '.');
}

function buildFollowUpSteps() {
  const steps = pickList(FOLLOWUP_STEPS, 3);
  const primaryDate = formatDate(randomFutureDate(3, 10));
  return steps.map((step, index) => {
    if (index === 0) {
      return `${index + 1}. ${step} para el ${primaryDate}`;
    }
    return `${index + 1}. ${step}`;
  });
}

function buildMeetingPreference() {
  const dias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
  const turnos = ['mañana', 'tarde'];
  return `${randomChoice(dias)} por la ${randomChoice(turnos)}`;
}

export function generateEmailMock() {
  const dataset = getMockDataset();
  const contacto = ensureContact(dataset);
  const company = resolveCompany(contacto, dataset);

  const deal = pickDeal(contacto, dataset);
  const presupuesto = pickBudget(contacto, { min: 10000, max: 200000 });
  const requerimientos = pickRequirements(contacto, dataset, 2);
  const kpis = pickKpis(contacto, dataset, 2);
  const temas = pickTopics(contacto, company, dataset, 2);
  const fechaLimite = formatDate(randomFutureDate(5, 30));
  const followUpSteps = buildFollowUpSteps();

  const asuntos = unique([
    `Cotización para ${deal}`,
    `Propuesta: ${deal}`,
    `Consulta sobre ${deal}`,
    `Seguimiento ${company.name}`,
    `Revisión de requisitos ${company.name}`,
  ]).filter(Boolean);

  const department = contacto?.departments?.[0];
  const saludoEmpresa = department
    ? `${company.name} (${department})`
    : company.name;

  const cuerpo = `Hola equipo,

${company.name} está evaluando ${deal.toLowerCase()} para reforzar ${
    department ? `su área de ${department.toLowerCase()}` : 'sus operaciones clave'
  }.

Requerimientos prioritarios:
${requerimientos.map((r) => `- ${r}`).join('\n')}

Presupuesto estimado: $${presupuesto.toLocaleString()} USD
KPIs a monitorear:
${kpis.map((k) => `- ${k}`).join('\n')}

Nos piden compartir una propuesta antes del ${fechaLimite}. Temas foco: ${temas.join(', ')}.

Próximos pasos sugeridos:
${followUpSteps.join('\n')}

Saludos,
${contacto.name}
${contacto.role || ''}
${saludoEmpresa}`.trim();

  return {
    from: `${contacto.name} <${contacto.email}>`,
    to: 'ventas@miempresa.com',
    subject: randomChoice(asuntos),
    body: cuerpo,
    date: randomDate(-randomInt(0, 7)),
    company: company.name,
    attachments: [],
    metadata: {
      generated: true,
      contactId: contacto.id,
      contactName: contacto.name,
      contactCompany: contacto.company,
      deal,
      budget: presupuesto,
      requirements: requerimientos,
      kpis,
      topics: temas,
      departments: contacto.departments || [],
      companyDomain: contacto.domain,
    },
  };
}

export function generateSlackMock() {
  const dataset = getMockDataset();
  const contacto = ensureContact(dataset);
  const company = resolveCompany(contacto, dataset);

  const deal = pickDeal(contacto, dataset);
  const presupuesto = pickBudget(contacto, { min: 15000, max: 250000 });
  const requerimientos = pickRequirements(contacto, dataset, 2);
  const kpis = pickKpis(contacto, dataset, randomInt(1, 2));
  const temas = pickTopics(contacto, company, dataset, 2);
  const fechaLimite = formatDate(randomFutureDate(7, 30));
  const steps = buildFollowUpSteps();
  const channel = pickSlackChannel(contacto, company);
  const emoji = randomChoice(SLACK_EMOJIS) || '💼';

  const mensaje = `${emoji} Hola equipo,

${contacto.name} (${company.name}) compartió nueva información:
${requerimientos.map((r) => `• ${r}`).join('\n')}

Resumen:
• Oportunidad: ${deal}
• Presupuesto estimado: $${presupuesto.toLocaleString()} USD
• Fecha objetivo: ${fechaLimite}
• KPIs clave: ${kpis.join(', ')}
• Temas críticos: ${temas.join(', ')}

Siguiente plan:
${steps.join('\n')}

¿Quién puede tomar la coordinación?`;

  return {
    user: {
      name: buildSlackUsername(contacto),
      real_name: contacto.name,
      email: contacto.email,
    },
    channel: {
      name: channel,
    },
    text: mensaje,
    ts: (Date.now() / 1000 - randomInt(0, 7) * 24 * 60 * 60).toString(),
    thread_ts: null,
    company: company.name,
    attachments: [],
    metadata: {
      generated: true,
      contactId: contacto.id,
      contactName: contacto.name,
      deal,
      budget: presupuesto,
      requirements: requerimientos,
      kpis,
      topics: temas,
      departments: contacto.departments || [],
    },
  };
}

export function generateWhatsAppMock() {
  const dataset = getMockDataset();
  const contacto = ensureContact(dataset);
  const company = resolveCompany(contacto, dataset);

  const deal = pickDeal(contacto, dataset);
  const presupuesto = pickBudget(contacto, { min: 8000, max: 150000 });
  const requerimientos = pickRequirements(contacto, dataset, 1);
  const temas = pickTopics(contacto, company, dataset, 1);
  const canalPreferido = contacto.channels?.[0] || 'email';
  const reunion = buildMeetingPreference();
  const emoji = randomChoice(WHATSAPP_EMOJIS) || '👋';
  const phoneFrom = contacto.phone || `+52${randomInt(1000000000, 9999999999)}`;

  const mensaje = `${emoji} Hola, soy ${contacto.name} de ${company.name}.

Tenemos interés en ${deal.toLowerCase()} y estamos afinando el plan de inversión.

Requerimos:
${requerimientos.map((r) => `- ${r}`).join('\n')}

Presupuesto estimado: $${presupuesto.toLocaleString()} USD
Tema clave: ${temas.join(', ')}
Canal preferido para seguimiento: ${canalPreferido}

¿Podemos agendar una llamada ${reunion}?`;

  return {
    from: phoneFrom,
    to: '+529876543210',
    message: mensaje,
    timestamp: randomDate(-randomInt(0, 3)),
    contactName: contacto.name,
    email: contacto.email,
    company: company.name,
    media: null,
    metadata: {
      generated: true,
      contactId: contacto.id,
      contactName: contacto.name,
      deal,
      budget: presupuesto,
      requirements: requerimientos,
      topics: temas,
      departments: contacto.departments || [],
    },
  };
}
// Datos base para generar mocks

