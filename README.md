# Relay – Zero-Click CRM (Backend)

Backend in Node.js + Express that integrates Supabase (PostgreSQL/Realtime/Storage) and Google Gemini (multimodal + embeddings) to capture interactions frictionlessly, analyze them automatically, and prioritize actions.

## Requirements
- Node.js 18+
- Supabase account (URL and `anon key`)
- Google Gemini API Key (`GOOGLE_GEMINI_API_KEY` from ai.google.dev)

## Setup
1. Copy `.env.example` to `.env` and complete the variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `GOOGLE_GEMINI_API_KEY`
   - `PORT` (optional, default 4000)
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start in development:
   ```bash
   npm run dev
   ```

4. Quick verification:
   ```bash
   npm run verify
   curl http://localhost:4000/health/
   ```

## Short Description
See `docs/short-description.md` (150–300 words: problem, solution, what works, roles, and technologies).

## Endpoints
- `GET /health`: Service status and basic configuration
- `POST /api/jobs/audio`: Processes audio (base64) and returns structured JSON
- `POST /api/jobs/video`: Multimodal video processing
- `POST /api/ingest/email|slack|whatsapp`: Mock ingestion that generates interactions and automatic analysis
- `POST /api/ingest/video|audio`: Uploads files to Supabase Storage and triggers automatic processing
- `GET /api/crm/contacts|companies|interactions|work-items|fresh-data`: CRM data read API
- `POST /api/search/query`: Semantic search over interactions, tasks, and signals
- `POST /api/chat`: Corporate chat with memory and RAG
- `POST /api/admin/ai/reindex`: Rebuilds embeddings for interactions/work_items/fresh_data
- `GET /api/crm/insights/summary`: Dashboard with aggregated metrics, top deals, and upcoming pending items
- `GET /api/crm/timeline`: Chronological feed combining interactions, work items, and signals
- `GET /api/crm/companies/:id/overview`: Deep summary of a company (contacts, pipeline, tasks, signals)
- `GET /api/crm/contacts/:id/overview`: Summary of a contact's history and pending items
- `GET /api/crm/insights/actionable`: Risks and suggested next steps (contacts, alerts, overdue tasks)
- `POST /api/notes`: Register manual notes/interactions and index them for AI
- `GET /api/alerts`: Query automatic alerts (negative sentiment, urgencies, overdue tasks)
- `POST /api/alerts/:id/resolve`: Resolve open alerts
- `GET /api/ai/contexts`: List indexed contexts (data for RAG)
- `DELETE /api/ai/contexts/:id`: Delete a specific context
- `GET /api/crm/insights/trends`: Time series (interactions, work items, and signals)
- `GET/POST/DELETE /api/knowledge`: Manage knowledge base (documents, notes)
- `POST /api/work-items`: Create work items (used by AI or manually)

### `POST /api/jobs/audio`
Expected body:
```json
{
  "audio": {
    "mimeType": "audio/mp3",
    "base64": "<BASE64_AUDIO>"
  },
  "source": "call",
  "metadata": { "notes": "optional" }
}
```
Response (simplified example):
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

Additionally, the backend automatically creates an `interaction` (`channel = call`) with the transcript, budget, requirements, and next steps, indexes it in `ai_contexts`, and triggers the analysis/next_steps flow.

## Supabase (suggested tables)
See `db/schema.sql` for a minimal schema proposal (contacts, companies, deals, activities, tasks, jobs).

## Notes
- This is an MVP: the jobs flow is synchronous for simplicity. It can be migrated to asynchrony using a `jobs` table and workers.
- The Gmail webhook endpoint will be added in future iterations.

## New: Video Processing

- Endpoint: `POST /api/jobs/video`
- Allows two modes:
  - `audio_only`: audio is extracted from the video (FFmpeg) and analyzed the same as the audio endpoint.
  - `video`: audio is extracted and video frames are sampled (1 fps, max 6) for multimodal analysis with Gemini.

Body (example):
```json
{
  "video": {
    "mimeType": "video/mp4",
    "base64": "<BASE64_VIDEO>"
  },
  "analysis": "audio_only",
  "source": "call",
  "metadata": { "notes": "optional" }
}
```

Response (simplified example):
## CRM Data Reading

### `GET /api/crm/interactions`
Optional parameters: `channel`, `startDate`, `endDate`, `minBudget`, `maxBudget`, `search`.

```bash
curl "http://localhost:4000/api/crm/interactions?companyId=<uuid>&channel=email&startDate=2025-01-01"
```

### `GET /api/crm/work-items`
Available parameters: `status`, `priority`, `dueBefore`, `dueAfter`, `onlyOverdue=true`.

```bash
curl "http://localhost:4000/api/crm/work-items?companyId=<uuid>&onlyOverdue=true"
```

### `GET /api/crm/contacts`
Allows filtering by `sentiment`, `personKind`, `isClient`, `updatedAfter`, `updatedBefore`.

```bash
curl "http://localhost:4000/api/crm/contacts?companyId=<uuid>&sentiment=negative&isClient=true"
```

## Semantic Search and Chat

### `GET /api/crm/insights/summary`
```bash
curl "http://localhost:4000/api/crm/insights/summary?companyId=<uuid>&limit=5"
```

Response:
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
    { "id": "...", "title": "Send proposal", "due_date": "2025-01-20T12:00:00Z" }
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

Response:
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

Response:
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

Response:
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
Allows capturing manual notes (calls, meetings, reminders) and indexes them in `ai_contexts` for search and chat.

```bash
curl -X POST http://localhost:4000/api/notes \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "<uuid optional>",
    "contactId": "<uuid optional>",
    "author": "María García",
    "channel": "note",
    "text": "Call with Juan. He mentioned they need the final proposal on Monday.",
    "occurredAt": "2025-01-18T10:30:00Z",
    "metadata": {
      "origin": "phone",
      "importance": "high"
    }
  }'
```

Response:
```json
{
  "ok": true,
  "interactionId": "uuid"
}
```
### `POST /api/search/query`
```json
{
  "query": "what critical pending items do we have with TechSmart?",
  "companyId": "uuid-optional",
  "type": "work_item",
  "limit": 5
}
```
Returns the most relevant fragments (cosine similarity) using embeddings (`text-embedding-004`) stored in `ai_contexts`.

### `POST /api/chat`
```json
{
  "sessionId": null,
  "question": "Give me a summary of the current situation with TechSmart",
  "companyId": "uuid-optional",
  "userId": "uuid-optional",
  "topK": 5
}
```
The service:
1. Records the message and creates the session if it doesn't exist.
2. Searches context in `ai_contexts` (interactions, work items, news).
3. Invokes Gemini with a corporate prompt and context.
4. Returns response + sources used.

#### Advanced mode with tools
You can extend the context by requesting tools in the request:

- `alerts`: open high-priority alerts.
- `risk_contacts`: contacts at risk (negative sentiment or no follow-up).
- `timeline`: latest interactions/work_items/signals (limit 5).
- `trends`: metrics from the last 30 days.
- `knowledge`: related documents in the knowledge base.

```json
{
  "question": "What should I do with TechSmart this week?",
  "companyId": "uuid-company",
  "tools": ["alerts", "risk_contacts", "timeline"]
}
```

The response will include `tools` with the aggregated data used in addition to `sources`.

#### Execute actions (create work items)
You can request a simple action along with the question:

```json
{
  "question": "Schedule follow-up for Monday",
  "companyId": "uuid-company",
  "action": {
    "type": "create_work_item",
    "payload": {
      "title": "Follow-up with TechSmart",
      "dueDate": "2025-01-20T15:00:00Z",
      "assigneeContactId": "uuid-contacto"
    }
  }
}
```

The system will create the work item automatically, record it in `ai_tool_calls`, and reflect it in the response's `toolData`.

Response:
```json
{
  "ok": true,
  "sessionId": "uuid",
  "answer": "Currently TechSmart requested integrations...",
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

Extra variables in `.env`:
```
SUPABASE_STORAGE_BUCKET=videos
SUPABASE_STORAGE_FOLDER=
SUPABASE_STORAGE_WATCH_INTERVAL=30000
SUPABASE_STORAGE_WATCH_ENABLED=true
```

### Manually reindex embeddings

```
POST http://localhost:4000/api/admin/ai/reindex
{
  "type": "all",
  "limit": 200,
  "companyId": null
}
```

`type` can be `interactions`, `work_items`, `fresh_data`, or `all`. This reuses the analyzer to recalculate summaries and reindex in `ai_contexts`.

### `GET /api/alerts`
```bash
curl "http://localhost:4000/api/alerts?status=open&severity=high"
```

### `POST /api/alerts/:id/resolve`
```bash
curl -X POST http://localhost:4000/api/alerts/<uuid>/resolve
```

Automatic alerts when:
- An interaction has negative sentiment or high/critical urgency.
- Detected next steps expire.
- Work items become overdue.

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

Response:
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

Response:
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
      "title": "Send final proposal",
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
    "companyId": "<uuid optional>",
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
    "companyId": "<uuid optional>",
    "limit": 5
  }'
```

Documents are automatically chunked (1,600 characters by default), embeddings are generated, and they are registered in `ai_contexts` as type `knowledge`, so chat can cite them with `tools:["knowledge"]`.

### `POST /api/work-items`
```bash
curl -X POST http://localhost:4000/api/work-items \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Prepare final proposal TechSmart",
    "companyId": "<uuid>",
    "assigneeContactId": "<uuid>",
    "dueDate": "2025-01-25T15:00:00Z",
    "priority": "high"
  }'
```

## CRM Schema (Companies → Departments → Users → Tasks)

Summary of main entities (see `db/schema.sql` for complete definitions):
- `companies`: company/organization, with `domain`, `website`, `industry`, `company_type`.
- `departments`: departments per company.
- `contacts`: CRM people (users), extended with:
  - `company_id`, `person_kind` (`employee|client|supplier|partner|other`), `is_client`, `is_supplier`.
  - `personal_notes` and `preferences` (JSON) for personal context.
- `teams` and `team_members`: teams, leader, and member relationships.
- `work_items`: tasks/jobs/pending items with:
  - `status` (`pending|in_progress|blocked|completed`), `priority`, `is_external`.
  - `owner_contact_id`, `assignee_contact_id`, `company_id`, `department_id`, `team_id`.
  - `budget`, `requirements` (JSON), `kpis` (JSON), `data` (JSON), `due_date`.
- `interactions`: latest interactions with:
  - `channel` (`email|call|meeting|chat|social|web|other`), `occurred_at`, `participants` (JSON), `budget`, `requirements`, `kpis`, `data`, `deadline`.
  - View `latest_interaction_per_contact` to get the date of the last interaction per contact.
- `fresh_data`: "data fresh collector" for news/signals with `source`, `source_url`, `title`, `summary`, `tags`, `published_at`, `detected_at`.

How to apply the schema in Supabase:
- Open the SQL editor of your Supabase project and paste the content of `db/schema.sql`.
- Execute the script. Tables and types will be created if they don't exist.
- Review and adjust RLS/policies according to your access needs.

## Documentation and Resources
- Detailed API: `docs-api.md` and `docs/api-inventory.md`
- OpenAPI: `docs/openapi.yaml` (if applicable)
- One-Pager (PDF): generate from `docs/one-pager.md` (e.g., `npx md-to-pdf docs/one-pager.md`)
- Video scripts:
  - Demo (≤60s): `docs/video-scripts/demo-60s.md`
  - Tech (≤60s): `docs/video-scripts/tech-60s.md`

## Dataset
- Mock files included: `contactos_mock.json`, `conversaciones_mock.json`, `empresas_mock.json`, `metadatos_mock.json`
- Regeneration (optional): `python correos_mock.py` (no external dependencies required)
- Full seed to Supabase: `npm run seed:completo` (or via `POST /api/admin/seed/completo`)

## Deliverables
- Public repository: [add URL]
- Code ZIP: `Relay.zip`
- `requirements.txt`: this project is Node.js; no Python dependencies (see `package.json`)