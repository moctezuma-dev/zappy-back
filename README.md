# Zero-Click CRM (Backend MVP)

Backend en Node.js + Express que integra Supabase (PostgreSQL) y Google Gemini 1.5 Pro para procesar audio y extraer información CRM de manera automática.

## Requisitos
- Node.js 18+
- Cuenta de Supabase (URL y `anon key`)
- API Key de Google Gemini (`GOOGLE_GEMINI_API_KEY` desde ai.google.dev)

## Configuración
1. Copia `.env.example` a `.env` y completa las variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `GOOGLE_GEMINI_API_KEY`
   - `PORT` (opcional, por defecto 4000)
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Arranca en desarrollo:
   ```bash
   npm run dev
   ```

## Endpoints
- `GET /health`: Estado del servicio y configuración básica
- `POST /api/jobs/audio`: Procesa audio (base64) y devuelve JSON estructurado
- `POST /api/jobs/video`: Procesamiento multimodal de video
- `POST /api/ingest/email|slack|whatsapp`: Ingesta mock que genera interacciones y análisis automáticos
- `POST /api/ingest/video|audio`: Sube archivos a Supabase Storage y dispara procesamiento automático
- `GET /api/crm/contacts|companies|interactions|work-items|fresh-data`: API de lectura de datos del CRM
- `POST /api/search/query`: Búsqueda semántica sobre interacciones, tareas y señales
- `POST /api/chat`: Chat corporativo con memoria y RAG
- `POST /api/admin/ai/reindex`: Reconstruye embeddings para interacciones/work_items/fresh_data
- `GET /api/crm/insights/summary`: Dashboard con métricas agregadas, top deals y pendientes próximos
- `GET /api/crm/timeline`: Feed cronológico combinando interacciones, work items y señales
- `GET /api/crm/companies/:id/overview`: Resumen profundo de una empresa (contactos, pipeline, tareas, señales)
- `GET /api/crm/contacts/:id/overview`: Resumen del historial y pendientes de un contacto
- `GET /api/crm/insights/actionable`: Riesgos y próximos pasos sugeridos (contactos, alertas, tareas vencidas)
- `POST /api/notes`: Registrar notas/interacciones manuales y indexarlas para IA
- `GET /api/alerts`: Consultar alertas automáticas (sentimiento negativo, urgencias, tareas vencidas)
- `POST /api/alerts/:id/resolve`: Resolver alertas abiertas
- `GET /api/ai/contexts`: Listar contextos indexados (datos para RAG)
- `DELETE /api/ai/contexts/:id`: Eliminar un contexto específico
- `GET /api/crm/insights/trends`: Series temporales (interacciones, work items y señales)
- `GET/POST/DELETE /api/knowledge`: Gestionar la base de conocimiento (documentos, apuntes)
- `POST /api/work-items`: Crear work items (usado por la IA o manualmente)

### `POST /api/jobs/audio`
Body esperado:
```json
{
  "audio": {
    "mimeType": "audio/mp3",
    "base64": "<BASE64_DEL_AUDIO>"
  },
  "source": "call",
  "metadata": { "notes": "opcional" }
}
```
Respuesta (ejemplo simplificado):
```json
{
  "jobId": "uuid",
  "status": "completed",
  "data": {
    "contact": { "name": "", "email": "", "phone": "", "company": "" },
    "deal": { "title": "", "value": 0, "currency": "USD", "stage": "" },
    "next_steps": [ { "title": "", "due_date": "" } ],
    "sentiment": "neutral",
    "topics": [""],
    "transcript": "..."
  }
}
```

Adicionalmente, el backend crea automáticamente una `interaction` (`channel = call`) con la transcripción, presupuesto, requisitos y próximos pasos, la indexa en `ai_contexts` y dispara el flujo de análisis/next_steps.

## Supabase (tablas sugeridas)
Consulta `db/schema.sql` para una propuesta de esquema mínimo (contacts, companies, deals, activities, tasks, jobs).

## Notas
- Este es un MVP: el flujo de jobs es síncrono por simplicidad. Se puede migrar a asincronía usando una tabla `jobs` y workers.
- El endpoint de Gmail webhook se añadirá en iteraciones siguientes.

## Nuevo: Procesamiento de Video

- Endpoint: `POST /api/jobs/video`
- Permite dos modos:
  - `audio_only`: se extrae el audio del video (FFmpeg) y se analiza igual que el endpoint de audio.
  - `video`: se extrae audio y se muestrean frames del video (1 fps, máx 6) para análisis multimodal con Gemini.

Body (ejemplo):
```json
{
  "video": {
    "mimeType": "video/mp4",
    "base64": "<BASE64_DEL_VIDEO>"
  },
  "analysis": "audio_only",
  "source": "call",
  "metadata": { "notes": "opcional" }
}
```

Respuesta (ejemplo simplificado):
## Lectura de datos del CRM

### `GET /api/crm/interactions`
Parámetros opcionales: `channel`, `startDate`, `endDate`, `minBudget`, `maxBudget`, `search`.

```bash
curl "http://localhost:4000/api/crm/interactions?companyId=<uuid>&channel=email&startDate=2025-01-01"
```

### `GET /api/crm/work-items`
Parámetros disponibles: `status`, `priority`, `dueBefore`, `dueAfter`, `onlyOverdue=true`.

```bash
curl "http://localhost:4000/api/crm/work-items?companyId=<uuid>&onlyOverdue=true"
```

### `GET /api/crm/contacts`
Permite filtrar por `sentiment`, `personKind`, `isClient`, `updatedAfter`, `updatedBefore`.

```bash
curl "http://localhost:4000/api/crm/contacts?companyId=<uuid>&sentiment=negative&isClient=true"
```

## Búsqueda Semántica y Chat

### `GET /api/crm/insights/summary`
```bash
curl "http://localhost:4000/api/crm/insights/summary?companyId=<uuid>&limit=5"
```

Respuesta:
```json
{
  "ok": true,
  "summary": {
    "interactions": {
      "total": 42,
      "last7Days": 6,
      "last30Days": 18,
      "uniqueContacts": 12
    },
    "workItems": {
      "total": 15,
      "open": 11,
      "overdue": 2,
      "dueNext7Days": 3
    },
    "freshData": {
      "total": 9,
      "last30Days": 4
    },
    "contacts": {
      "total": 25,
      "updatedLast30Days": 8
    },
    "pipeline": {
      "totalBudget": 185000,
      "avgBudget": 30833.33
    }
  },
  "workItemsStatus": [
    { "status": "pending", "total": 6 },
    { "status": "in_progress", "total": 3 },
    { "status": "blocked", "total": 2 },
    { "status": "completed", "total": 4 }
  ],
  "sentiment": [
    { "sentiment": "positive", "total": 9 },
    { "sentiment": "neutral", "total": 10 },
    { "sentiment": "negative", "total": 2 }
  ],
  "topDeals": [
    { "id": "...", "budget": 50000, "company": { "name": "TechSmart" }, "contact": { "name": "Juan Pérez" } }
  ],
  "upcomingWorkItems": [
    { "id": "...", "title": "Enviar propuesta", "due_date": "2025-01-20T12:00:00Z" }
  ],
  "recentInteractions": [
    { "id": "...", "channel": "email", "occurred_at": "2025-01-15T10:30:00Z" }
  ]
}
```

### `GET /api/crm/timeline`
```bash
curl "http://localhost:4000/api/crm/timeline?companyId=<uuid>&limit=30"
```

Respuesta:
```json
{
  "ok": true,
  "entries": [
    {
      "type": "interaction",
      "id": "uuid",
      "occurredAt": "2025-01-17T16:20:00Z",
      "channel": "email",
      "summary": "Asunto: Cotización...",
      "company": { "id": "...", "name": "TechSmart" },
      "contact": { "id": "...", "name": "Juan Pérez" }
    },
    {
      "type": "work_item",
      "id": "uuid",
      "title": "Preparar demo técnica",
      "status": "in_progress",
      "priority": "high",
      "dueDate": "2025-01-20T12:00:00Z",
      "company": { "id": "...", "name": "TechSmart" },
      "assignee": { "id": "...", "name": "María García" }
    },
    {
      "type": "fresh_data",
      "id": "uuid",
      "topic": "Transformación digital",
      "title": "TechSmart gana premio de innovación",
      "source": "Google News",
      "detectedAt": "2025-01-18T09:10:00Z"
    }
  ],
  "total": 30
}
```

### `GET /api/crm/companies/:id/overview`
```bash
curl "http://localhost:4000/api/crm/companies/<uuid>/overview?interactionsLimit=5&workItemsLimit=5"
```

Respuesta:
```json
{
  "ok": true,
  "company": {
    "id": "uuid",
    "name": "TechSmart",
    "industry": "Technology",
    "website": "https://techsmart.com",
    "domain": "techsmart.com"
  },
  "contacts": [
    { "id": "uuid", "name": "Juan Pérez", "email": "juan@techsmart.com", "role": "Gerente de Operaciones", "sentiment": "positive" }
  ],
  "workItems": [
    {
      "id": "uuid",
      "title": "Preparar demo técnica",
      "status": "in_progress",
      "priority": "high",
      "due_date": "2025-01-20T12:00:00Z",
      "assignee": { "id": "uuid", "name": "María García" }
    }
  ],
  "interactions": [
    {
      "id": "uuid",
      "occurred_at": "2025-01-17T16:20:00Z",
      "channel": "email",
      "budget": 50000,
      "requirements": ["Integración ERP"]
    }
  ],
  "freshData": [
    { "id": "uuid", "title": "TechSmart gana premio de innovación", "source": "Google News" }
  ],
  "pipeline": {
    "totalBudget": 185000,
    "avgBudget": 30833.33,
    "dealsCount": 6
  },
  "sentiment": [
    { "sentiment": "positive", "total": 3 },
    { "sentiment": "neutral", "total": 1 }
  ],
  "workItemsStatus": [
    { "status": "pending", "total": 2 },
    { "status": "in_progress", "total": 1 }
  ]
}
```

### `GET /api/crm/contacts/:id/overview`
```bash
curl "http://localhost:4000/api/crm/contacts/<uuid>/overview?interactionsLimit=5&workItemsLimit=5"
```

Respuesta:
```json
{
  "ok": true,
  "contact": {
    "id": "uuid",
    "name": "Juan Pérez",
    "email": "juan@techsmart.com",
    "role": "Gerente de Operaciones",
    "sentiment": "positive",
    "company": { "id": "uuid", "name": "TechSmart" }
  },
  "interactions": [
    { "id": "uuid", "occurred_at": "2025-01-17T16:20:00Z", "channel": "email", "budget": 50000, "requirements": ["Integración ERP"] }
  ],
  "workItems": [
    { "id": "uuid", "title": "Preparar demo técnica", "status": "in_progress", "priority": "high", "due_date": "2025-01-20T12:00:00Z" }
  ],
  "freshData": [
    { "id": "uuid", "title": "TechSmart gana premio de innovación", "source": "Google News" }
  ],
  "pipeline": {
    "totalBudget": 85000,
    "dealsCount": 2
  },
  "workItemsStatus": [
    { "status": "pending", "total": 1 },
    { "status": "in_progress", "total": 1 }
  ]
}
```

### `POST /api/notes`
Permite capturar notas manuales (llamadas, reuniones, recordatorios) y se indexan en `ai_contexts` para búsquedas y chat.

```bash
curl -X POST http://localhost:4000/api/notes \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "<uuid opcional>",
    "contactId": "<uuid opcional>",
    "author": "María García",
    "channel": "note",
    "text": "Llamada con Juan. Comentó que necesitan propuesta final el lunes.",
    "occurredAt": "2025-01-18T10:30:00Z",
    "metadata": {
      "origin": "phone",
      "importance": "high"
    }
  }'
```

Respuesta:
```json
{
  "ok": true,
  "interactionId": "uuid"
}
```
### `POST /api/search/query`
```json
{
  "query": "¿qué pendientes críticos tenemos con TechSmart?",
  "companyId": "uuid-opcional",
  "type": "work_item",
  "limit": 5
}
```
Devuelve los fragmentos más relevantes (cosine similarity) usando embeddings (`text-embedding-004`) almacenados en `ai_contexts`.

### `POST /api/chat`
```json
{
  "sessionId": null,
  "question": "Dame un resumen de la situación actual con TechSmart",
  "companyId": "uuid-opcional",
  "userId": "uuid-opcional",
  "topK": 5
}
```
El servicio:
1. Registra el mensaje y crea la sesión si no existe.
2. Busca contexto en `ai_contexts` (interacciones, work items, noticias).
3. Invoca Gemini con un prompt corporativo y contexto.
4. Devuelve respuesta + fuentes utilizadas.

#### Modo avanzado con herramientas
Puedes extender el contexto solicitando herramientas en el request:

- `alerts`: alertas abiertas de alta prioridad.
- `risk_contacts`: contactos con riesgo (sentimiento negativo o sin seguimiento).
- `timeline`: últimas interacciones/work_items/señales (límite 5).
- `trends`: métricas de los últimos 30 días.
- `knowledge`: documentos en la base de conocimiento relacionados.

```json
{
  "question": "¿Qué debo hacer con TechSmart esta semana?",
  "companyId": "uuid-empresa",
  "tools": ["alerts", "risk_contacts", "timeline"]
}
```

La respuesta incluirá `tools` con los datos agregados utilizados además de `sources`.

#### Ejecutar acciones (crear work items)
Puedes solicitar una acción simple junto con la pregunta:

```json
{
  "question": "Agenda seguimiento para el lunes",
  "companyId": "uuid-empresa",
  "action": {
    "type": "create_work_item",
    "payload": {
      "title": "Seguimiento con TechSmart",
      "dueDate": "2025-01-20T15:00:00Z",
      "assigneeContactId": "uuid-contacto"
    }
  }
}
```

El sistema creará el work item automáticamente, lo registrará en `ai_tool_calls` y lo reflejará en el `toolData` de la respuesta.

Respuesta:
```json
{
  "ok": true,
  "sessionId": "uuid",
  "answer": "Actualmente TechSmart solicitó integraciones...",
  "sources": [
    {
      "id": "context-uuid",
      "type": "interaction",
      "similarity": 0.82,
      "metadata": { "channel": "email", "next_steps": [...] }
    }
  ]
}
```

Variables extra en `.env`:
```
SUPABASE_STORAGE_BUCKET=videos
SUPABASE_STORAGE_FOLDER=
SUPABASE_STORAGE_WATCH_INTERVAL=30000
SUPABASE_STORAGE_WATCH_ENABLED=true
```

### Reindexar embeddings manualmente

```
POST http://localhost:4000/api/admin/ai/reindex
{
  "type": "all",
  "limit": 200,
  "companyId": null
}
```

`type` puede ser `interactions`, `work_items`, `fresh_data` o `all`. Esto reutiliza el analizador para recalcular resúmenes y volver a indexar en `ai_contexts`.

### `GET /api/alerts`
```bash
curl "http://localhost:4000/api/alerts?status=open&severity=high"
```

### `POST /api/alerts/:id/resolve`
```bash
curl -X POST http://localhost:4000/api/alerts/<uuid>/resolve
```

Alertas automáticas cuando:
- Una interacción tiene sentimiento negativo o urgencia alta/crítica.
- Próximos pasos detectados vencen.
- Work items quedan atrasados.

### `GET /api/ai/contexts`
```bash
curl "http://localhost:4000/api/ai/contexts?type=interaction&companyId=<uuid>&limit=10"
```

### `DELETE /api/ai/contexts/:id`
```bash
curl -X DELETE http://localhost:4000/api/ai/contexts/<uuid>
```

### `GET /api/crm/insights/trends`
```bash
curl "http://localhost:4000/api/crm/insights/trends?companyId=<uuid>&days=30"
```

Respuesta:
```json
{
  "ok": true,
  "interactions": [
    { "day": "2025-01-10", "total": 5, "with_budget": 2 }
  ],
  "workItems": [
    { "day": "2025-01-10", "created": 3, "completed": 1 }
  ],
  "freshData": [
    { "day": "2025-01-10", "total": 2 }
  ]
}
```

### `GET /api/crm/insights/actionable`
```bash
curl "http://localhost:4000/api/crm/insights/actionable?companyId=<uuid>"
```

Respuesta:
```json
{
  "ok": true,
  "risky_contacts": [
    {
      "id": "uuid",
      "name": "Juan Pérez",
      "company_name": "TechSmart",
      "sentiment": "negative",
      "last_interaction_at": "2024-12-20T10:00:00Z"
    }
  ],
  "open_alerts": [
    {
      "id": "alert-uuid",
      "severity": "high",
      "message": "Interacción con sentimiento negative y urgencia high",
      "created_at": "2025-01-18T10:35:00Z"
    }
  ],
  "overdue_work_items": [
    {
      "id": "work-uuid",
      "title": "Enviar propuesta final",
      "due_date": "2025-01-15T12:00:00Z",
      "assignee_name": "María García"
    }
  ],
  "stale_companies": [
    {
      "id": "company-uuid",
      "name": "Finanzas Next",
      "last_interaction_at": "2024-12-10T09:00:00Z",
      "open_work_items": 3
    }
  ]
}
```

### `POST /api/knowledge`
```bash
curl -X POST http://localhost:4000/api/knowledge \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Caso de éxito 2024",
    "content": "Resumen del proyecto de modernización con TechSmart...",
    "companyId": "<uuid opcional>",
    "metadata": { "tipo": "caso" }
  }'
```

### `GET /api/knowledge`
```bash
curl "http://localhost:4000/api/knowledge?companyId=<uuid>&limit=10"
```

### `DELETE /api/knowledge/:id`
```bash
curl -X DELETE http://localhost:4000/api/knowledge/<uuid>"
```

### `POST /api/knowledge/upload`
```bash
curl -X POST http://localhost:4000/api/knowledge/upload \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Notas de onboarding",
    "fileBase64": "<BASE64_DE_TXT>",
    "chunkSize": 1500,
    "companyId": "<uuid opcional>"
  }'
```

### `POST /api/knowledge/search`
```bash
curl -X POST http://localhost:4000/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "integración ERP",
    "companyId": "<uuid opcional>",
    "limit": 5
  }'
```

Los documentos se trocean automáticamente (1,600 caracteres por defecto), se generan embeddings y se registran en `ai_contexts` como tipo `knowledge`, por lo que el chat puede citarlos con `tools:["knowledge"]`.

### `POST /api/work-items`
```bash
curl -X POST http://localhost:4000/api/work-items \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Preparar propuesta final TechSmart",
    "companyId": "<uuid>",
    "assigneeContactId": "<uuid>",
    "dueDate": "2025-01-25T15:00:00Z",
    "priority": "high"
  }'
```

## Esquema CRM (Empresas → Departamentos → Usuarios → Tareas)

Resumen de las entidades principales (ver `db/schema.sql` para definiciones completas):
- `companies`: empresa/organización, con `domain`, `website`, `industry`, `company_type`.
- `departments`: departamentos por empresa.
- `contacts`: personas del CRM (usuarios), ampliado con:
  - `company_id`, `person_kind` (`employee|client|supplier|partner|other`), `is_client`, `is_supplier`.
  - `personal_notes` y `preferences` (JSON) para contexto personal.
- `teams` y `team_members`: equipos, líder, y relación de integrantes.
- `work_items`: tareas/trabajos/pendientes con:
  - `status` (`pending|in_progress|blocked|completed`), `priority`, `is_external`.
  - `owner_contact_id`, `assignee_contact_id`, `company_id`, `department_id`, `team_id`.
  - `budget`, `requirements` (JSON), `kpis` (JSON), `data` (JSON), `due_date`.
- `interactions`: últimas interacciones con:
  - `channel` (`email|call|meeting|chat|social|web|other`), `occurred_at`, `participants` (JSON), `budget`, `requirements`, `kpis`, `data`, `deadline`.
  - Vista `latest_interaction_per_contact` para obtener la fecha de la última interacción por contacto.
- `fresh_data`: “data fresh collector” de noticias/señales con `source`, `source_url`, `title`, `summary`, `tags`, `published_at`, `detected_at`.

Cómo aplicar el esquema en Supabase:
- Abre el editor SQL de tu proyecto Supabase y pega el contenido de `db/schema.sql`.
- Ejecuta el script. Las tablas y tipos se crearán si no existen.
- Revisa y ajusta RLS/policies según tus necesidades de acceso.