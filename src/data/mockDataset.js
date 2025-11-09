import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const FALLBACK_CONTACTS = [
  { name: 'James Quincey', company: 'The Coca-Cola Company', role: 'Chief Executive Officer', email: 'jquincey@coca-cola.com' },
  { name: 'Nancy Quan', company: 'The Coca-Cola Company', role: 'Chief Technical Officer', email: 'nquan@coca-cola.com' },
  { name: 'Ramon Laguarta', company: 'PepsiCo', role: 'Chairman and CEO', email: 'ramon.laguarta@pepsico.com' },
  { name: 'Jane Wakely', company: 'PepsiCo', role: 'Chief Consumer and Marketing Officer', email: 'jane.wakely@pepsico.com' },
  { name: 'Andy Jassy', company: 'Amazon', role: 'President and CEO', email: 'ajassy@amazon.com' },
  { name: 'Alicia Boler Davis', company: 'Amazon', role: 'SVP Global Customer Fulfillment', email: 'abolerdavis@amazon.com' },
  { name: 'Satya Nadella', company: 'Microsoft', role: 'Chairman and CEO', email: 'satya.nadella@microsoft.com' },
  { name: 'Amy Hood', company: 'Microsoft', role: 'Executive Vice President and CFO', email: 'amy.hood@microsoft.com' },
  { name: 'Sundar Pichai', company: 'Alphabet', role: 'CEO', email: 'sundar@alphabet.com' },
  { name: 'Ruth Porat', company: 'Alphabet', role: 'President and Chief Investment Officer', email: 'ruth.porat@alphabet.com' },
  { name: 'Tim Cook', company: 'Apple', role: 'Chief Executive Officer', email: 'tcook@apple.com' },
  { name: 'Katherine Adams', company: 'Apple', role: 'Senior Vice President and General Counsel', email: 'katherine.adams@apple.com' },
  { name: 'Mike Sievert', company: 'T-Mobile US', role: 'President and CEO', email: 'mike.sievert@t-mobile.com' },
  { name: 'Callie Field', company: 'T-Mobile US', role: 'President, Business Group', email: 'callie.field@t-mobile.com' },
  { name: 'Elon Musk', company: 'Tesla', role: 'Technoking', email: 'elon@tesla.com' },
  { name: 'Vaibhav Taneja', company: 'Tesla', role: 'Chief Financial Officer', email: 'vtaneja@tesla.com' },
  { name: 'Greg Peters', company: 'Netflix', role: 'Co-CEO', email: 'greg.peters@netflix.com' },
  { name: 'Bela Bajaria', company: 'Netflix', role: 'Chief Content Officer', email: 'bela.bajaria@netflix.com' },
  { name: 'Han Jong-hee', company: 'Samsung Electronics', role: 'Vice Chairman and CEO', email: 'han.jonghee@samsung.com' },
  { name: 'Park Hark-kyu', company: 'Samsung Electronics', role: 'President and CFO', email: 'park.harkkyu@samsung.com' },
];

const FALLBACK_DEALS = [
  'Global beverage supply optimization program',
  'Smart retail analytics platform',
  'E-commerce fulfillment automation',
  'Enterprise cloud modernization',
  'AI-powered customer service rollout',
  'Electric vehicle fleet expansion',
  '5G enterprise connectivity bundle',
  'Subscription personalization engine',
  'Sustainable packaging initiative',
];

const FALLBACK_REQUIREMENTS = [
  'Documentación actualizada',
  'Revisión legal',
  'Integración ERP',
  'Certificación ISO 27001',
  'Soporte 24/7',
  'Dashboard en tiempo real',
  'Capacidad para 10,000 órdenes diarias',
];

const FALLBACK_KPIS = [
  'Entrega a tiempo',
  'Reducción de costos',
  'Mejorar servicio',
  'Satisfacción cliente',
  'Tiempo de respuesta',
  'Eficiencia operativa',
];

const FALLBACK_TOPICS = [
  'Automatización',
  'Transformación digital',
  'Optimización de procesos',
  'Integración de sistemas',
  'Mejora continua',
  'Innovación tecnológica',
];

const FALLBACK_CHANNELS = ['Email', 'WhatsApp', 'Llamada', 'Slack', 'Videollamada'];

const DOMAIN_OVERRIDES = {
  'The Coca-Cola Company': 'coca-colacompany.com',
  PepsiCo: 'pepsico.com',
  Amazon: 'amazon.com',
  Microsoft: 'microsoft.com',
  Alphabet: 'abc.xyz',
  Apple: 'apple.com',
  'T-Mobile US': 't-mobile.com',
  Tesla: 'tesla.com',
  Netflix: 'netflix.com',
  'Samsung Electronics': 'samsung.com',
};

const ROOT_DIR = process.cwd();

function randomChoice(array) {
  if (!Array.isArray(array) || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

function slugify(text, separator = '') {
  if (!text) return '';
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (separator === '') {
    return normalized.replace(/[^a-z0-9]/g, '');
  }
  return normalized
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`${separator}{2,}`, 'g'), separator)
    .replace(new RegExp(`^${separator}|${separator}$`, 'g'), '');
}

function normalizeKey(text) {
  return slugify(text, '').toLowerCase();
}

function getCompanyDomain(companyName) {
  if (!companyName) return 'example.com';
  const override = DOMAIN_OVERRIDES[companyName];
  if (override) return override;
  const slug = slugify(companyName, '');
  return slug ? `${slug}.com` : 'example.com';
}

function buildEmailAddress(name, domain) {
  const localPart = slugify(name, '.');
  const safeLocal = localPart || 'contacto';
  const safeDomain = domain || 'example.com';
  return `${safeLocal}@${safeDomain}`;
}

function generatePhoneFromSeed(seed) {
  const hash = crypto.createHash('sha256').update(String(seed)).digest('hex');
  const digits = hash.replace(/[a-f]/gi, (char) => (parseInt(char, 16) % 10).toString());
  const phoneDigits = digits.slice(0, 10).padEnd(10, '0');
  return `+52${phoneDigits}`;
}

function safeReadJson(relativePath, encoding = 'utf-8') {
  const absolutePath = path.resolve(ROOT_DIR, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  try {
    const raw = fs.readFileSync(absolutePath, { encoding });
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[mockDataset] No se pudo leer ${relativePath}:`, error.message);
    return null;
  }
}

function collectUniqueValues(targetSet, value) {
  if (!targetSet || value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectUniqueValues(targetSet, item));
    return;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) targetSet.add(trimmed);
    return;
  }
  if (typeof value === 'number') {
    targetSet.add(value);
  }
}

function ensureContactRecord({
  usuario,
  companyName,
  domain,
  departmentName,
  deptTasks,
  deals,
  requirements,
  kpis,
  channels,
  topics,
  companyTopics,
  contactsMap,
}) {
  if (!usuario || !usuario.nombre) return null;
  const key = usuario.id || `${companyName}:${normalizeKey(usuario.nombre)}`;
  let contact = contactsMap.get(key);

  if (!contact) {
    const email =
      typeof usuario.email === 'string' && usuario.email.includes('@')
        ? usuario.email
        : buildEmailAddress(usuario.nombre, domain);
    contact = {
      id: usuario.id || key,
      name: usuario.nombre,
      company: companyName,
      domain,
      email,
      phone: generatePhoneFromSeed(usuario.id || `${companyName}-${usuario.nombre}`),
      role: usuario.puesto || null,
      roles: new Set(usuario.puesto ? [usuario.puesto] : []),
      departments: new Set(departmentName ? [departmentName] : []),
      deals: new Set(),
      requirements: new Set(),
      kpis: new Set(),
      topics: new Set(),
      channels: new Set(),
      isClient: Boolean(usuario.es_cliente),
      isSupplier: Boolean(usuario.es_proveedor),
      leadsTeam: Boolean(usuario.a_cargo_de_equipo),
      teamMembers: Array.isArray(usuario.equipo) ? usuario.equipo : [],
      personalNotes: usuario.notas_personales || null,
      assignedTasks: [],
      departmentTasks: [],
      lastInteractions: [],
      budgetSamples: [],
      createdFrom: 'empresas_mock',
    };
    contactsMap.set(key, contact);
  } else {
    if (usuario.puesto) {
      contact.roles.add(usuario.puesto);
      contact.role = contact.role || usuario.puesto;
    }
    if (departmentName) {
      contact.departments.add(departmentName);
    }
  }

  if (Array.isArray(usuario.status_tareas)) {
    usuario.status_tareas.forEach((task) => {
      contact.assignedTasks.push(task);
      collectUniqueValues(contact.deals, task?.titulo);
      collectUniqueValues(deals, task?.titulo);
      collectUniqueValues(contact.requirements, task?.requerimientos);
      collectUniqueValues(requirements, task?.requerimientos);
      collectUniqueValues(contact.channels, task?.canal);
      collectUniqueValues(channels, task?.canal);
      if (Array.isArray(task?.kpis)) {
        task.kpis.forEach((kpi) => {
          collectUniqueValues(contact.kpis, kpi);
          collectUniqueValues(kpis, kpi);
        });
      } else {
        collectUniqueValues(contact.kpis, task?.kpis);
        collectUniqueValues(kpis, task?.kpis);
      }
      if (typeof task?.presupuesto === 'number') {
        contact.budgetSamples.push(task.presupuesto);
      }
      if (Array.isArray(task?.kpis)) {
        task.kpis.forEach((topic) => collectUniqueValues(contact.topics, topic));
      }
    });
  }

  if (Array.isArray(deptTasks)) {
    deptTasks.forEach((task) => {
      if (!task || !task.usuario_responsable) return;
      if (normalizeKey(task.usuario_responsable) === normalizeKey(usuario.nombre)) {
        contact.departmentTasks.push(task);
        collectUniqueValues(contact.deals, task?.titulo);
        collectUniqueValues(deals, task?.titulo);
        collectUniqueValues(contact.requirements, task?.requerimientos);
        collectUniqueValues(requirements, task?.requerimientos);
        collectUniqueValues(contact.channels, task?.canal);
        collectUniqueValues(channels, task?.canal);
        if (Array.isArray(task?.kpis)) {
          task.kpis.forEach((kpi) => {
            collectUniqueValues(contact.kpis, kpi);
            collectUniqueValues(kpis, kpi);
          });
        } else {
          collectUniqueValues(contact.kpis, task?.kpis);
          collectUniqueValues(kpis, task?.kpis);
        }
        if (typeof task?.presupuesto === 'number') {
          contact.budgetSamples.push(task.presupuesto);
        }
      }
    });
  }

  if (Array.isArray(usuario.ultimas_interacciones)) {
    usuario.ultimas_interacciones.forEach((interaction) => {
      contact.lastInteractions.push(interaction);
      collectUniqueValues(contact.channels, interaction?.canal);
      collectUniqueValues(channels, interaction?.canal);
      collectUniqueValues(contact.requirements, interaction?.requerimientos);
      collectUniqueValues(requirements, interaction?.requerimientos);
      if (Array.isArray(interaction?.kpis)) {
        interaction.kpis.forEach((kpi) => {
          collectUniqueValues(contact.kpis, kpi);
          collectUniqueValues(kpis, kpi);
        });
      } else {
        collectUniqueValues(contact.kpis, interaction?.kpis);
        collectUniqueValues(kpis, interaction?.kpis);
      }
      if (Array.isArray(interaction?.topics)) {
        interaction.topics.forEach((topic) => {
          collectUniqueValues(contact.topics, topic);
          collectUniqueValues(topics, topic);
          companyTopics.add(topic);
        });
      }
      if (typeof interaction?.presupuesto === 'number') {
        contact.budgetSamples.push(interaction.presupuesto);
      }
    });
  }

  return contact;
}

function finalizeContactRecord(contact) {
  const budgetSamples = contact.budgetSamples || [];
  let budgetRange = null;
  let averageBudget = null;
  if (budgetSamples.length > 0) {
    const min = Math.min(...budgetSamples);
    const max = Math.max(...budgetSamples);
    budgetRange = { min, max };
    averageBudget = Math.round(budgetSamples.reduce((acc, value) => acc + value, 0) / budgetSamples.length);
  }

  return {
    id: contact.id,
    name: contact.name,
    company: contact.company,
    domain: contact.domain,
    email: contact.email,
    phone: contact.phone,
    role: contact.role || Array.from(contact.roles)[0] || null,
    roles: Array.from(contact.roles),
    departments: Array.from(contact.departments),
    deals: Array.from(contact.deals),
    requirements: Array.from(contact.requirements),
    kpis: Array.from(contact.kpis),
    topics: Array.from(contact.topics),
    channels: Array.from(contact.channels),
    isClient: contact.isClient,
    isSupplier: contact.isSupplier,
    leadsTeam: contact.leadsTeam,
    teamMembers: contact.teamMembers,
    personalNotes: contact.personalNotes,
    assignedTasks: contact.assignedTasks,
    departmentTasks: contact.departmentTasks,
    lastInteractions: contact.lastInteractions,
    budgetRange,
    averageBudget,
    createdFrom: contact.createdFrom,
  };
}

function fallbackDataset() {
  const contacts = FALLBACK_CONTACTS.map((contact, index) => {
    const id = `fallback-contact-${index}`;
    const domain = getCompanyDomain(contact.company);
    return {
      id,
      name: contact.name,
      company: contact.company,
      domain,
      email: contact.email || buildEmailAddress(contact.name, domain),
      phone: generatePhoneFromSeed(`${contact.company}-${contact.name}`),
      role: contact.role,
      roles: [contact.role],
      departments: [],
      deals: [],
      requirements: [],
      kpis: [],
      topics: [],
      channels: [],
      isClient: false,
      isSupplier: false,
      leadsTeam: false,
      teamMembers: [],
      personalNotes: null,
      assignedTasks: [],
      departmentTasks: [],
      lastInteractions: [],
      budgetRange: null,
      averageBudget: null,
      createdFrom: 'fallback',
    };
  });

  const companyMap = new Map();
  contacts.forEach((contact) => {
    if (!companyMap.has(contact.company)) {
      companyMap.set(contact.company, {
        name: contact.company,
        domain: contact.domain,
        departments: [],
        contactIds: [],
        topics: [],
        freshNews: [],
      });
    }
    companyMap.get(contact.company).contactIds.push(contact.id);
  });

  return {
    companies: Array.from(companyMap.values()),
    contacts,
    deals: [...FALLBACK_DEALS],
    requirements: [...FALLBACK_REQUIREMENTS],
    kpis: [...FALLBACK_KPIS],
    topics: [...FALLBACK_TOPICS],
    channels: [...FALLBACK_CHANNELS],
    departments: [],
    stats: {
      companies: companyMap.size,
      contacts: contacts.length,
    },
    source: 'fallback',
  };
}

function buildMockDataset() {
  const empresasData = safeReadJson('empresas_mock.json');
  if (!Array.isArray(empresasData) || empresasData.length === 0) {
    return fallbackDataset();
  }

  const contactsMap = new Map();
  const deals = new Set(FALLBACK_DEALS);
  const requirements = new Set(FALLBACK_REQUIREMENTS);
  const kpis = new Set(FALLBACK_KPIS);
  const topics = new Set(FALLBACK_TOPICS);
  const channels = new Set(FALLBACK_CHANNELS);
  const departments = new Set();
  const companies = [];

  empresasData.forEach((empresa) => {
    if (!empresa || !empresa.empresa) return;
    const companyName = empresa.empresa;
    const domain = getCompanyDomain(companyName);
    const companyTopics = new Set();
    const companyContactIds = new Set();

    const freshNews = Array.isArray(empresa.data_fresh_collector)
      ? empresa.data_fresh_collector.map((item) => ({
          fuente: item.fuente || 'Google News',
          fecha: item.fecha || null,
          noticia: item.noticia || '',
          tema_relacionado: item.tema_relacionado || null,
        }))
      : [];

    freshNews.forEach((news) => {
      collectUniqueValues(topics, news.tema_relacionado);
      if (news.tema_relacionado) {
        companyTopics.add(news.tema_relacionado);
      }
    });

    const departmentRecords = [];
    (empresa.departamentos || []).forEach((dept) => {
      if (!dept) return;
      const departmentName = dept.nombre || 'General';
      departments.add(departmentName);
      const deptTasks = Array.isArray(dept.tareas) ? dept.tareas : [];
      const departmentUserIds = [];

      deptTasks.forEach((task) => {
        collectUniqueValues(deals, task?.titulo);
        collectUniqueValues(requirements, task?.requerimientos);
        if (Array.isArray(task?.kpis)) {
          task.kpis.forEach((kpi) => collectUniqueValues(kpis, kpi));
        } else {
          collectUniqueValues(kpis, task?.kpis);
        }
        collectUniqueValues(channels, task?.canal);
      });

      (dept.usuarios || []).forEach((usuario) => {
        const contact = ensureContactRecord({
          usuario,
          companyName,
          domain,
          departmentName,
          deptTasks,
          deals,
          requirements,
          kpis,
          channels,
          topics,
          companyTopics,
          contactsMap,
        });

        if (contact) {
          companyContactIds.add(contact.id);
          if (!departmentUserIds.includes(contact.id)) {
            departmentUserIds.push(contact.id);
          }
        }
      });

      departmentRecords.push({
        name: departmentName,
        taskCount: deptTasks.length,
        tasks: deptTasks,
        userIds: departmentUserIds,
      });
    });

    companies.push({
      name: companyName,
      domain,
      departments: departmentRecords,
      contactIds: Array.from(companyContactIds),
      topics: Array.from(companyTopics),
      freshNews,
    });
  });

  const contacts = Array.from(contactsMap.values()).map(finalizeContactRecord);
  if (contacts.length === 0) {
    return fallbackDataset();
  }

  return {
    companies,
    contacts,
    deals: Array.from(deals),
    requirements: Array.from(requirements),
    kpis: Array.from(kpis),
    topics: Array.from(topics),
    channels: Array.from(channels),
    departments: Array.from(departments),
    stats: {
      companies: companies.length,
      contacts: contacts.length,
    },
    source: 'empresas_mock.json',
  };
}

let datasetCache = null;

export function getMockDataset() {
  if (!datasetCache) {
    datasetCache = buildMockDataset();
  }
  return datasetCache;
}

export function refreshMockDataset() {
  datasetCache = buildMockDataset();
  return datasetCache;
}

export function getRandomContact(predicate) {
  const dataset = getMockDataset();
  const pool = predicate ? dataset.contacts.filter(predicate) : dataset.contacts;
  return randomChoice(pool);
}

export function getRandomCompany(predicate) {
  const dataset = getMockDataset();
  const pool = predicate ? dataset.companies.filter(predicate) : dataset.companies;
  return randomChoice(pool);
}

