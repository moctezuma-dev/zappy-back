import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { adminSupabase } from './adminSupabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

function log(msg, obj) {
  if (obj !== undefined) console.log(`[seeder] ${msg}`, obj);
  else console.log(`[seeder] ${msg}`);
}

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado (SUPABASE_SERVICE_ROLE_KEY)');
  return adminSupabase;
}

async function loadJsonSafe(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function ensureCompaniesFromContacts(supabase, contacts) {
  const names = Array.from(new Set(contacts.map((c) => c.company).filter(Boolean)));
  if (names.length === 0) return new Map();
  const upsertPayload = names.map((name) => ({ name }));
  const { error: upsertError } = await supabase.from('companies').upsert(upsertPayload, { onConflict: 'name' });
  if (upsertError) throw upsertError;
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id,name')
    .in('name', names);
  if (error) throw error;
  const map = new Map();
  for (const c of companies || []) map.set(c.name, c.id);
  return map;
}

async function ensureDefaultDepartments(supabase, companyId) {
  const { data: existing, error } = await supabase
    .from('departments')
    .select('id')
    .eq('company_id', companyId);
  if (error) throw error;
  if ((existing || []).length > 0) return;
  const payload = [
    { name: 'Ventas', company_id: companyId },
    { name: 'Operaciones', company_id: companyId },
    { name: 'IT', company_id: companyId },
  ];
  const { error: insertError } = await supabase.from('departments').insert(payload);
  if (insertError) throw insertError;
}

function normalizeContactForDB(c) {
  return {
    name: c.name,
    company: c.company,
    role: c.role,
    email: c.email,
    phone: c.phone,
    sentiment: c.sentiment || null,
  };
}

// Mapeo de estados del mock a enums de DB
function mapTaskStatus(estatus) {
  const map = {
    'Pendiente': 'pending',
    'En proceso': 'in_progress',
    'Terminado': 'completed',
    'Bloqueado': 'blocked',
  };
  return map[estatus] || 'pending';
}

// Mapeo de canales del mock a enums de DB
function mapChannelType(canal) {
  const map = {
    'Email': 'email',
    'WhatsApp': 'chat',
    'Llamada': 'call',
    'Reunión': 'meeting',
    'Social': 'social',
    'Web': 'web',
  };
  return map[canal] || 'other';
}

// Inferir prioridad desde notas o usar default
function inferPriority(notas) {
  if (!notas) return 'medium';
  const lower = notas.toLowerCase();
  if (lower.includes('crítico') || lower.includes('critico') || lower.includes('urgente')) return 'critical';
  if (lower.includes('alta')) return 'high';
  if (lower.includes('baja')) return 'low';
  return 'medium';
}

async function upsertContactsAndLinkCompany(supabase, contacts, companyMap) {
  // Filtrar duplicados por email antes del upsert
  const seenEmails = new Set();
  const uniqueContacts = contacts.filter((c) => {
    const email = c.email?.trim().toLowerCase();
    if (!email || seenEmails.has(email)) return false;
    seenEmails.add(email);
    return true;
  });
  
  if (uniqueContacts.length === 0) {
    log('No hay contactos únicos para insertar');
    return;
  }
  
  const payload = uniqueContacts.map(normalizeContactForDB);
  
  // Upsert en lotes para evitar problemas con duplicados
  const batchSize = 50;
  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize);
    const { error: upsertError } = await supabase
      .from('contacts')
      .upsert(batch, { onConflict: 'email' });
    if (upsertError) throw upsertError;
  }
  
  // Actualizar company_id para cada contacto
  for (const c of uniqueContacts) {
    const companyId = companyMap.get(c.company);
    if (!companyId) continue;
    const email = c.email?.trim().toLowerCase();
    if (!email) continue;
    
    const { error: updateError } = await supabase
      .from('contacts')
      .update({ company_id: companyId })
      .eq('email', email);
    if (updateError) {
      console.warn(`[seeder] Error actualizando company_id para ${email}:`, updateError.message);
    }
  }
}

function runPythonGeneratorIfRequested(generate) {
  if (!generate) return;
  log('Generando datos con correos_mock.py...');
  let result = spawnSync('python', ['correos_mock.py'], { cwd: rootDir, stdio: 'inherit' });
  if (result.error) {
    result = spawnSync('py', ['correos_mock.py'], { cwd: rootDir, stdio: 'inherit' });
  }
  if (result.status !== 0) {
    throw new Error('Fallo al ejecutar correos_mock.py');
  }
}

// Obtener o crear departamento por nombre y company_id
async function getOrCreateDepartment(supabase, companyId, departmentName) {
  const { data: existing, error: findError } = await supabase
    .from('departments')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', departmentName)
    .single();
  if (findError && findError.code !== 'PGRST116') throw findError;
  if (existing) return existing.id;
  const { data: inserted, error: insertError } = await supabase
    .from('departments')
    .insert({ company_id: companyId, name: departmentName })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return inserted.id;
}

// Obtener contact_id por nombre y email
async function getContactId(supabase, name, email, companyId) {
  // Si hay email, buscar por email primero
  if (email) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', email)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (data) return data.id;
  }
  // Si no existe o no hay email, buscar por nombre y company_id
  if (name && companyId) {
    const { data: byName, error: byNameError } = await supabase
      .from('contacts')
      .select('id')
      .eq('name', name)
      .eq('company_id', companyId)
      .limit(1)
      .single();
    if (!byNameError && byName) return byName.id;
  }
  return null;
}

// Seed de teams y team_members
async function seedTeams(supabase, empresasData, companyMap, contactMap, departmentMap) {
  const teamsToInsert = [];
  const teamMembersToInsert = [];
  const teamMap = new Map(); // (companyId, teamName) -> teamId

  for (const empresa of empresasData) {
    const companyId = companyMap.get(empresa.empresa);
    if (!companyId) continue;

    for (const dept of empresa.departamentos || []) {
      const departmentId = departmentMap.get(`${companyId}:${dept.nombre}`);
      if (!departmentId) continue;

      for (const usuario of dept.usuarios || []) {
        const contactId = contactMap.get(usuario.nombre) || contactMap.get(usuario.email);
        if (!contactId) continue;

        // Procesar equipos del usuario
        for (const miembroEquipo of usuario.equipo || []) {
          const teamName = `Equipo ${miembroEquipo.nombre}`;
          const teamKey = `${companyId}:${teamName}`;
          let teamId = teamMap.get(teamKey);

          if (!teamId) {
            // Crear team si no existe
            const { data: existingTeam, error: findTeamError } = await supabase
              .from('teams')
              .select('id')
              .eq('company_id', companyId)
              .eq('name', teamName)
              .single();
            if (findTeamError && findTeamError.code !== 'PGRST116') throw findTeamError;

            if (existingTeam) {
              teamId = existingTeam.id;
            } else {
              const leadContactId = usuario.a_cargo_de_equipo ? contactId : null;
              const { data: newTeam, error: insertTeamError } = await supabase
                .from('teams')
                .insert({
                  company_id: companyId,
                  department_id: departmentId,
                  name: teamName,
                  lead_contact_id: leadContactId,
                })
                .select('id')
                .single();
              if (insertTeamError) throw insertTeamError;
              teamId = newTeam.id;
            }
            teamMap.set(teamKey, teamId);
          }

          // Agregar miembro al equipo
          const miembroContactId = await getContactId(supabase, miembroEquipo.nombre, null, companyId);
          if (miembroContactId) {
            teamMembersToInsert.push({
              team_id: teamId,
              contact_id: miembroContactId,
              role: miembroEquipo.puesto,
              is_lead: usuario.a_cargo_de_equipo || false,
            });
          }
        }
      }
    }
  }

  // Insertar team_members (filtrar duplicados primero)
  if (teamMembersToInsert.length > 0) {
    // Filtrar duplicados por (team_id, contact_id)
    const seenKeys = new Set();
    const uniqueTeamMembers = teamMembersToInsert.filter((member) => {
      const key = `${member.team_id}:${member.contact_id}`;
      if (seenKeys.has(key)) {
        return false; // Duplicado, omitir
      }
      seenKeys.add(key);
      return true;
    });
    
    if (uniqueTeamMembers.length > 0) {
      // Insertar en lotes para evitar problemas
      const batchSize = 50;
      for (let i = 0; i < uniqueTeamMembers.length; i += batchSize) {
        const batch = uniqueTeamMembers.slice(i, i + batchSize);
        const { error } = await supabase.from('team_members').upsert(batch, {
          onConflict: 'team_id,contact_id',
        });
        if (error) throw error;
      }
      log(`Insertados ${uniqueTeamMembers.length} miembros de equipos (de ${teamMembersToInsert.length} totales, ${teamMembersToInsert.length - uniqueTeamMembers.length} duplicados omitidos)`);
    }
  }

  return teamMap;
}

// Seed de work_items
async function seedWorkItems(supabase, empresasData, companyMap, contactMap, departmentMap, teamMap) {
  const workItemsToInsert = [];

  for (const empresa of empresasData) {
    const companyId = companyMap.get(empresa.empresa);
    if (!companyId) continue;

    for (const dept of empresa.departamentos || []) {
      const departmentId = departmentMap.get(`${companyId}:${dept.nombre}`);

      // Work items de usuarios (status_tareas)
      for (const usuario of dept.usuarios || []) {
        const ownerContactId = contactMap.get(usuario.nombre) || contactMap.get(usuario.email);
        if (!ownerContactId) continue;

        for (const tarea of usuario.status_tareas || []) {
          const assigneeContactId = contactMap.get(tarea.usuario_responsable) || ownerContactId;
          workItemsToInsert.push({
            title: tarea.titulo,
            description: tarea.notas || null,
            status: mapTaskStatus(tarea.estatus),
            priority: inferPriority(tarea.notas),
            owner_contact_id: ownerContactId,
            assignee_contact_id: assigneeContactId,
            company_id: companyId,
            department_id: departmentId,
            budget: tarea.presupuesto || null,
            currency: 'USD',
            requirements: tarea.requerimientos ? { text: tarea.requerimientos } : null,
            kpis: tarea.kpis || null,
            data: tarea.datos || null,
            due_date: tarea.plazo ? new Date(tarea.plazo).toISOString() : null,
          });
        }
      }

      // Work items de departamento (tareas)
      for (const tarea of dept.tareas || []) {
        const assigneeContactId = contactMap.get(tarea.usuario_responsable);
        workItemsToInsert.push({
          title: tarea.titulo,
          description: tarea.notas || null,
          status: mapTaskStatus(tarea.estatus),
          priority: inferPriority(tarea.notas),
          owner_contact_id: assigneeContactId || null,
          assignee_contact_id: assigneeContactId || null,
          company_id: companyId,
          department_id: departmentId,
          budget: tarea.presupuesto || null,
          currency: 'USD',
          requirements: tarea.requerimientos ? { text: tarea.requerimientos } : null,
          kpis: tarea.kpis || null,
          data: tarea.datos || null,
          due_date: tarea.plazo ? new Date(tarea.plazo).toISOString() : null,
        });
      }
    }
  }

  if (workItemsToInsert.length > 0) {
    const { error } = await supabase.from('work_items').insert(workItemsToInsert);
    if (error) throw error;
    log(`Insertados ${workItemsToInsert.length} work_items`);
  }

  return workItemsToInsert.length;
}

// Seed de interactions
async function seedInteractions(supabase, empresasData, companyMap, contactMap, departmentMap) {
  const interactionsToInsert = [];

  for (const empresa of empresasData) {
    const companyId = companyMap.get(empresa.empresa);
    if (!companyId) continue;

    for (const dept of empresa.departamentos || []) {
      const departmentId = departmentMap.get(`${companyId}:${dept.nombre}`);

      for (const usuario of dept.usuarios || []) {
        const contactId = contactMap.get(usuario.nombre) || contactMap.get(usuario.email);
        if (!contactId) continue;

        for (const interaccion of usuario.ultimas_interacciones || []) {
          interactionsToInsert.push({
            contact_id: contactId,
            company_id: companyId,
            department_id: departmentId,
            channel: mapChannelType(interaccion.canal),
            occurred_at: interaccion.fecha ? new Date(interaccion.fecha).toISOString() : new Date().toISOString(),
            participants: interaccion.participantes || null,
            budget: interaccion.presupuesto || null,
            currency: 'USD',
            requirements: interaccion.requerimientos ? { text: interaccion.requerimientos } : null,
            kpis: interaccion.kpis || null,
            data: interaccion.datos || null,
            deadline: interaccion.plazo ? new Date(interaccion.plazo).toISOString() : null,
          });
        }
      }
    }
  }

  if (interactionsToInsert.length > 0) {
    const { error } = await supabase.from('interactions').insert(interactionsToInsert);
    if (error) throw error;
    log(`Insertadas ${interactionsToInsert.length} interacciones`);
  }

  return interactionsToInsert.length;
}

// Seed de fresh_data
async function seedFreshData(supabase, empresasData, companyMap) {
  const freshDataToInsert = [];

  for (const empresa of empresasData) {
    const companyId = companyMap.get(empresa.empresa);
    if (!companyId) continue;

    for (const noticia of empresa.data_fresh_collector || []) {
      freshDataToInsert.push({
        company_id: companyId,
        topic: noticia.tema_relacionado || null,
        source: noticia.fuente || 'Google News',
        source_url: null,
        title: noticia.noticia || null,
        summary: null,
        tags: null,
        published_at: noticia.fecha ? new Date(noticia.fecha).toISOString() : new Date().toISOString(),
      });
    }
  }

  if (freshDataToInsert.length > 0) {
    const { error } = await supabase.from('fresh_data').insert(freshDataToInsert);
    if (error) throw error;
    log(`Insertados ${freshDataToInsert.length} registros de fresh_data`);
  }

  return freshDataToInsert.length;
}

export async function agregarUsuarios({ generate = false } = {}) {
  runPythonGeneratorIfRequested(generate);
  const contacts =
    (await loadJsonSafe('contacts.json')) ||
    (await loadJsonSafe('contactos_mock.json')) ||
    [];
  if (!Array.isArray(contacts) || contacts.length === 0) {
    throw new Error('No se encontraron contactos en contacts.json/contactos_mock.json');
  }
  const supabase = ensureAdmin();
  log(`Subiendo ${contacts.length} contactos a Supabase...`);
  const companyMap = await ensureCompaniesFromContacts(supabase, contacts);
  for (const companyId of companyMap.values()) {
    await ensureDefaultDepartments(supabase, companyId);
  }
  await upsertContactsAndLinkCompany(supabase, contacts, companyMap);
  log('Usuarios agregados y vinculados a empresas/departamentos.');
  return { count: contacts.length };
}

// Nueva función para seed completo desde empresas_mock.json
export async function seedCompleto({ generate = false } = {}) {
  runPythonGeneratorIfRequested(generate);
  const supabase = ensureAdmin();

  // 1. Cargar empresas_mock.json
  const empresasData = await loadJsonSafe('empresas_mock.json');
  if (!Array.isArray(empresasData) || empresasData.length === 0) {
    throw new Error('No se encontró empresas_mock.json o está vacío');
  }

  log(`Procesando ${empresasData.length} empresas desde empresas_mock.json...`);

  // 2. Crear companies y obtener mapa
  const companyNames = empresasData.map((e) => e.empresa);
  const companyMap = new Map();
  for (const name of companyNames) {
    const { data: existing, error: findError } = await supabase
      .from('companies')
      .select('id')
      .eq('name', name)
      .single();
    if (findError && findError.code !== 'PGRST116') throw findError;

    if (existing) {
      companyMap.set(name, existing.id);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('companies')
        .insert({ name })
        .select('id')
        .single();
      if (insertError) throw insertError;
      companyMap.set(name, inserted.id);
    }
  }
  log(`Procesadas ${companyMap.size} empresas`);

  // 3. Crear departments y obtener mapa
  const departmentMap = new Map(); // (companyId, deptName) -> deptId
  for (const empresa of empresasData) {
    const companyId = companyMap.get(empresa.empresa);
    if (!companyId) continue;

    for (const dept of empresa.departamentos || []) {
      const deptId = await getOrCreateDepartment(supabase, companyId, dept.nombre);
      departmentMap.set(`${companyId}:${dept.nombre}`, deptId);
    }
  }
  log(`Procesados ${departmentMap.size} departamentos`);

  // 4. Crear/actualizar contacts desde empresas_mock.json y obtener mapa
  const contactMap = new Map(); // name -> contactId (puede haber duplicados entre empresas, se usa el último)
  const contactMapByKey = new Map(); // (name:company_id) -> contactId (clave única)
  
  // Primero, recopilar todos los contactos únicos (por nombre + company_id)
  const contactKeyMap = new Map(); // (name, companyId) -> contact data
  
  for (const empresa of empresasData) {
    const companyId = companyMap.get(empresa.empresa);
    if (!companyId) continue;

    for (const dept of empresa.departamentos || []) {
      for (const usuario of dept.usuarios || []) {
        const key = `${usuario.nombre}:${companyId}`;
        // Solo agregar si no hemos visto este contacto antes
        if (!contactKeyMap.has(key)) {
          contactKeyMap.set(key, {
            name: usuario.nombre,
            company: empresa.empresa,
            company_id: companyId,
            role: usuario.puesto,
            person_kind: usuario.es_cliente ? 'client' : usuario.es_proveedor ? 'supplier' : 'employee',
            is_client: usuario.es_cliente || false,
            is_supplier: usuario.es_proveedor || false,
            personal_notes: usuario.notas_personales || null,
          });
        }
      }
    }
  }
  
  // Buscar contactos existentes por nombre y company_id
  const allNames = Array.from(new Set(Array.from(contactKeyMap.values()).map(c => c.name)));
  const allCompanyIds = Array.from(new Set(Array.from(contactKeyMap.values()).map(c => c.company_id)));
  
  const { data: existingContacts, error: findError } = await supabase
    .from('contacts')
    .select('id,name,company_id')
    .in('name', allNames)
    .in('company_id', allCompanyIds);
  
  if (findError) throw findError;
  
  // Crear mapa de contactos existentes: (name, company_id) -> contactId
  const existingMap = new Map();
  if (existingContacts) {
    for (const contact of existingContacts) {
      const key = `${contact.name}:${contact.company_id}`;
      existingMap.set(key, contact.id);
      contactMap.set(contact.name, contact.id); // Para compatibilidad con código existente
      contactMapByKey.set(key, contact.id); // Clave única
    }
  }
  
  // Separar contactos nuevos de los existentes
  const contactsToInsert = [];
  const contactsToUpdate = [];
  
  for (const [key, contactData] of contactKeyMap.entries()) {
    if (existingMap.has(key)) {
      // Contacto existe, preparar para actualizar
      const contactId = existingMap.get(key);
      contactsToUpdate.push({
        id: contactId,
        ...contactData,
        updated_at: new Date().toISOString(),
      });
    } else {
      // Contacto nuevo, preparar para insertar
      contactsToInsert.push(contactData);
    }
  }
  
  // Insertar contactos nuevos en lotes
  if (contactsToInsert.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < contactsToInsert.length; i += batchSize) {
      const batch = contactsToInsert.slice(i, i + batchSize);
      const { data: inserted, error: insertError } = await supabase
        .from('contacts')
        .insert(batch)
        .select('id,name,company_id');
      
      if (insertError) throw insertError;
      
      if (inserted) {
        for (const contact of inserted) {
          const key = `${contact.name}:${contact.company_id}`;
          contactMap.set(contact.name, contact.id); // Para compatibilidad
          contactMapByKey.set(key, contact.id); // Clave única
        }
      }
    }
    log(`Insertados ${contactsToInsert.length} contactos nuevos`);
  }
  
  // Actualizar contactos existentes en lotes
  if (contactsToUpdate.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < contactsToUpdate.length; i += batchSize) {
      const batch = contactsToUpdate.slice(i, i + batchSize);
      // Actualizar uno por uno para evitar conflictos
      for (const contact of batch) {
        const { id, ...updateData } = contact;
        const { error: updateError } = await supabase
          .from('contacts')
          .update(updateData)
          .eq('id', id);
        
        if (updateError) {
          console.warn(`[seeder] Error actualizando contacto ${id}:`, updateError.message);
        }
      }
    }
    log(`Actualizados ${contactsToUpdate.length} contactos existentes`);
  }
  
  log(`Procesados ${contactMap.size} contactos`);

  // 5. Seed de teams y team_members
  const teamMap = await seedTeams(supabase, empresasData, companyMap, contactMap, departmentMap);

  // 6. Seed de work_items
  const workItemsCount = await seedWorkItems(supabase, empresasData, companyMap, contactMap, departmentMap, teamMap);

  // 7. Seed de interactions
  const interactionsCount = await seedInteractions(supabase, empresasData, companyMap, contactMap, departmentMap);

  // 8. Seed de fresh_data
  const freshDataCount = await seedFreshData(supabase, empresasData, companyMap);

  log('Seed completo finalizado.');
  return {
    companies: companyMap.size,
    departments: departmentMap.size,
    contacts: contactMap.size,
    teams: teamMap.size,
    workItems: workItemsCount,
    interactions: interactionsCount,
    freshData: freshDataCount,
  };
}