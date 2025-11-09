// Datos base para generar mocks
const NOMBRES = [
  { nombre: 'Sofía Ramírez', empresa: 'Innovar Group', rol: 'Gerente de Compras', email: 'sofia.ramirez@innovargroup.com' },
  { nombre: 'Marco Gómez', empresa: 'TecGlobal', rol: 'Director de IT', email: 'marco.gomez@tecglobal.com' },
  { nombre: 'Valeria Torres', empresa: 'Constructora Taurus', rol: 'Jefa de Proyectos', email: 'valeria.torres@taurus.com' },
  { nombre: 'Roberto Sánchez', empresa: 'SaludExpress', rol: 'Coordinador Médico', email: 'roberto.sanchez@saludexpress.com' },
  { nombre: 'Laura Jiménez', empresa: 'Finanzas Next', rol: 'Analista Senior', email: 'laura.jimenez@finanzasnext.com' },
  { nombre: 'Juan Torres', empresa: 'Energía Verde', rol: 'Gerente Comercial', email: 'juan.torres@energiaverde.com' },
  { nombre: 'Ana López', empresa: 'ModaFutura', rol: 'Encargada de Sourcing', email: 'ana.lopez@modafutura.com' },
  { nombre: 'Patricia Peña', empresa: 'TechSmart', rol: 'CEO', email: 'patricia.pena@techsmart.com' },
  { nombre: 'Esteban Ruiz', empresa: 'Farmasur', rol: 'Líder Logístico', email: 'esteban.ruiz@farmasur.com' },
  { nombre: 'Carla Díaz', empresa: 'Alimentos Brisa', rol: 'Compras Internacionales', email: 'carla.diaz@alimentosbrisa.com' },
];

const DEALS = [
  'Soluciones de automatización en la nube',
  'Servicios logísticos integrales',
  'Software ERP especializado',
  'Consultoría estratégica',
  'Plataforma de marketing digital',
  'Diseño y fabricación de mobiliario',
  'Suministro de materiales',
  'Outsourcing de soporte técnico',
  'Implementación de blockchain',
];

const REQUERIMIENTOS = [
  'Documentación actualizada',
  'Revisión legal',
  'Integración ERP',
  'Certificación ISO 27001',
  'Soporte 24/7',
  'Dashboard en tiempo real',
  'Capacidad para 10,000 órdenes diarias',
];

const KPIS = [
  'Entrega a tiempo',
  'Reducción de costos',
  'Mejorar servicio',
  'Satisfacción cliente',
  'Tiempo de respuesta',
  'Eficiencia operativa',
];

const TEMAS = [
  'Automatización',
  'Transformación digital',
  'Optimización de procesos',
  'Integración de sistemas',
  'Mejora continua',
  'Innovación tecnológica',
];

function randomChoice(array) {
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

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Genera un email mock realista
 */
export function generateEmailMock() {
  const contacto = randomChoice(NOMBRES);
  const deal = randomChoice(DEALS);
  const presupuesto = randomInt(10000, 200000);
  const requerimientos = [randomChoice(REQUERIMIENTOS), randomChoice(REQUERIMIENTOS)].filter((v, i, a) => a.indexOf(v) === i);
  const kpis = [randomChoice(KPIS)];
  const fechaLimite = formatDate(new Date(Date.now() + randomInt(1, 30) * 24 * 60 * 60 * 1000));
  const temas = [randomChoice(TEMAS), randomChoice(TEMAS)].filter((v, i, a) => a.indexOf(v) === i);

  const asuntos = [
    `Cotización para ${deal}`,
    `Propuesta: ${deal}`,
    `Consulta sobre ${deal}`,
    `Interesados en ${deal}`,
    `URGENTE: ${deal}`,
  ];

  const cuerpo = `Hola equipo,

Estamos interesados en ${deal.toLowerCase()} para ${contacto.empresa}.

Necesitamos:
${requerimientos.map((r) => `- ${r}`).join('\n')}

Nuestro presupuesto es de aproximadamente $${presupuesto.toLocaleString()} USD.

KPIs objetivo:
${kpis.map((k) => `- ${k}`).join('\n')}

¿Podrían enviarnos una propuesta detallada antes del ${fechaLimite}?

Próximos pasos:
1. Agendar demo técnica para el ${formatDate(new Date(Date.now() + randomInt(3, 10) * 24 * 60 * 60 * 1000))}
2. Preparar propuesta comercial
3. Revisar requisitos de compliance

Saludos,
${contacto.nombre}
${contacto.rol}
${contacto.empresa}`;

  return {
    from: `${contacto.nombre} <${contacto.email}>`,
    to: 'ventas@miempresa.com',
    subject: randomChoice(asuntos),
    body: cuerpo,
    date: randomDate(-randomInt(0, 7)),
    company: contacto.empresa,
    attachments: [],
    metadata: {
      generated: true,
      deal,
      budget: presupuesto,
      requirements: requerimientos,
      kpis,
      topics: temas,
    },
  };
}

/**
 * Genera un mensaje de Slack mock realista
 */
export function generateSlackMock() {
  const contacto = randomChoice(NOMBRES);
  const deal = randomChoice(DEALS);
  const presupuesto = randomInt(15000, 250000);
  const requerimientos = [randomChoice(REQUERIMIENTOS), randomChoice(REQUERIMIENTOS)].filter((v, i, a) => a.indexOf(v) === i);
  const kpis = [randomChoice(KPIS)];
  const fechaLimite = formatDate(new Date(Date.now() + randomInt(1, 30) * 24 * 60 * 60 * 1000));
  const temas = [randomChoice(TEMAS), randomChoice(TEMAS)].filter((v, i, a) => a.indexOf(v) === i);

  const canales = ['ventas', 'comercial', 'proyectos', 'soporte', 'general'];
  const emojis = ['👋', '🚀', '💼', '📊', '⚡', '🎯'];

  const mensaje = `${randomChoice(emojis)} Hola equipo!

Tenemos una nueva oportunidad con ${contacto.empresa}. Necesitan:
${requerimientos.map((r) => `- ${r}`).join('\n')}

Detalles:
- Proyecto: ${deal}
- Presupuesto: $${presupuesto.toLocaleString()} USD
- Fecha límite: ${fechaLimite}
- KPIs: ${kpis.join(', ')}

Próximos pasos:
1. Agendar demo técnica para el ${formatDate(new Date(Date.now() + randomInt(3, 10) * 24 * 60 * 60 * 1000))}
2. Preparar propuesta comercial
3. Revisar requisitos de compliance

¿Alguien puede tomar la lead?`;

  return {
    user: {
      name: contacto.nombre.toLowerCase().replace(/\s+/g, '.'),
      real_name: contacto.nombre,
      email: contacto.email,
    },
    channel: {
      name: randomChoice(canales),
    },
    text: mensaje,
    ts: (Date.now() / 1000 - randomInt(0, 7) * 24 * 60 * 60).toString(),
    thread_ts: null,
    company: contacto.empresa,
    attachments: [],
    metadata: {
      generated: true,
      deal,
      budget: presupuesto,
      requirements: requerimientos,
      kpis,
      topics: temas,
    },
  };
}

/**
 * Genera un mensaje de WhatsApp mock realista
 */
export function generateWhatsAppMock() {
  const contacto = randomChoice(NOMBRES);
  const deal = randomChoice(DEALS);
  const presupuesto = randomInt(8000, 150000);
  const requerimientos = [randomChoice(REQUERIMIENTOS)];
  const fechaLimite = formatDate(new Date(Date.now() + randomInt(1, 20) * 24 * 60 * 60 * 1000));

  const telefonos = ['+521234567890', '+529876543210', '+525551234567', '+525559876543'];
  const emojis = ['👋', '💼', '📱', '🚀'];

  const mensaje = `${randomChoice(emojis)} Hola! Me interesa ${deal.toLowerCase()} que vi en su página web.

Necesito información sobre:
${requerimientos.map((r) => `- ${r}`).join('\n')}

Mi empresa es ${contacto.empresa} y estamos buscando una solución para mejorar nuestros procesos.

Presupuesto aproximado: $${presupuesto.toLocaleString()} USD

¿Podríamos agendar una llamada esta semana? Preferiblemente ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes'][randomInt(0, 4)]} por la ${['mañana', 'tarde'][randomInt(0, 1)]}.

Gracias!`;

  return {
    from: randomChoice(telefonos),
    to: '+529876543210',
    message: mensaje,
    timestamp: randomDate(-randomInt(0, 3)),
    contactName: contacto.nombre,
    email: contacto.email,
    company: contacto.empresa,
    media: null,
    metadata: {
      generated: true,
      deal,
      budget: presupuesto,
      requirements: requerimientos,
    },
  };
}

