# Documento de referencia de la API – Relay

---

## Convenciones globales
- **Base URL**: `http://localhost:4000` (ajusta según despliegue).
- **Formato de respuesta**: todos los endpoints devuelven al menos el campo `ok: boolean`. En operaciones exitosas suele añadirse `message` y datos específicos; en errores se incluye `error` o `details`.
- **Códigos HTTP**: 2xx para éxito, 4xx cuando el cliente envía datos inválidos (ver `details` de Zod o mensajes específicos) y 5xx ante errores inesperados.
- **Errores**: estructura estándar `{ ok: false, error: string, details?: any }`. Las validaciones basadas en Zod envían `details` como arreglo de `{ path, message }`.
- **Autenticación**: la API está pensada para ejecutarse detrás de Supabase con RLS. Los endpoints que escriben en las tablas requieren que la variable `SUPABASE_SERVICE_ROLE_KEY` esté presente.
- **Mock dataset**: cualquier endpoint de ingesta puede generar datos sintéticos basados en `empresas_mock.json`, el cual contiene compañías globales reales. Ejecuta `python correos_mock.py` para regenerarlo y `node scripts/seed-supabase.js --seed-completo` si necesitas cargar los datos en Supabase.
- **Gemini + búsqueda web**: al contar con `GOOGLE_GEMINI_API_KEY`, el servicio usa el modelo configurado (por defecto `gemini-2.0-flash-001`) con la capacidad `google_search_retrieval`, controlada por `GOOGLE_GEMINI_ENABLE_SEARCH_RETRIEVAL`. Las respuestas de análisis pueden incluir citas (URLs) procedentes de la búsqueda.

---

## `/health`

| Método | Ruta       | Respuesta |
|--------|------------|-----------|
| GET    | `/health/` | `{ ok: true, timestamp: string, hasSupabase: boolean, hasGemini: boolean }` |

```bash
curl http://localhost:4000/health/
```

```json
{
  "ok": true,
  "timestamp": "2025-11-09T15:23:41.102Z",
  "hasSupabase": true,
  "hasGemini": true
}
```

---

## `/api/ingest`

Todos soportan `generate: true` o body vacío para crear mocks realistas con datos empresariales actuales.

| Método | Ruta                | Descripción | Respuesta típica |
|--------|---------------------|-------------|------------------|
| POST   | `/api/ingest/email` | Ingresa un correo y lo normaliza a tabla `interactions`. | `{ ok: true, message, interactionId, contactId, companyId, generated, data? }` |
| POST   | `/api/ingest/slack` | Ingresa mensaje estilo Slack/Teams. | Igual estructura que email. |
| POST   | `/api/ingest/whatsapp` | Ingresa mensaje WhatsApp/SMS con contexto. | Igual estructura que email. |
| POST   | `/api/ingest/video` | Sube video a Supabase storage y dispara análisis opcional. | `{ ok: true, message, bucket, path, url, willProcess }` |
| POST   | `/api/ingest/audio` | Idem video pero para audio. | `{ ok: true, message, bucket, path, url, willProcess }` |

#### Ejemplo – `/api/ingest/email`

```bash
curl -X POST http://localhost:4000/api/ingest/email \
  -H "Content-Type: application/json" \
  -d '{
        "from": "Jane Wakely <jane.wakely@pepsico.com>",
        "to": "ventas@relay.ai",
        "subject": "Actualización del programa de sustentabilidad",
        "body": "Hola equipo...",
        "company": "PepsiCo"
      }'
```

**Respuesta (mock generado automáticamente si omites el body):**

```json
{
  "ok": true,
  "message": "Email ingerido correctamente. El análisis se ejecutará automáticamente.",
  "interactionId": "9e2f9403-2a47-4a3d-86ae-38bfb9ff2ea5",
  "contactId": "contact-pepsico-jw",
  "companyId": "company-pepsico",
  "generated": false,
  "data": null
}
```

#### Ejemplo – `/api/ingest/slack`

```bash
curl -X POST http://localhost:4000/api/ingest/slack \
  -H "Content-Type: application/json" \
  -d '{
        "user": {
          "name": "mike.sievert",
          "real_name": "Mike Sievert",
          "email": "mike.sievert@t-mobile.com"
        },
        "channel": { "name": "ventas" },
        "text": "Tenemos actualización sobre la cuenta enterprise 5G.",
        "company": "T-Mobile US"
      }'
```

```json
{
  "ok": true,
  "message": "Mensaje de Slack ingerido correctamente. El análisis se ejecutará automáticamente.",
  "interactionId": "f1cdbe5f-2fd8-4c9b-8a63-8f58eae1d9d4",
  "contactId": "contact-tmobile-mike",
  "companyId": "company-tmobile",
  "generated": false
}
```

#### Ejemplo – `/api/ingest/whatsapp`

```bash
curl -X POST http://localhost:4000/api/ingest/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
        "from": "+12065551234",
        "to": "+529876543210",
        "message": "Hola, soy Greg Peters (Netflix)...",
        "company": "Netflix"
      }'
```

```json
{
  "ok": true,
  "message": "Mensaje de WhatsApp ingerido correctamente. El análisis se ejecutará automáticamente.",
  "interactionId": "5f4f99a6-02f2-4c31-8845-2f134aa94f2f",
  "contactId": "contact-netflix-greg",
  "companyId": "company-netflix",
  "generated": false
}
```

#### Ejemplo – `/api/ingest/video`

```bash
curl -X POST http://localhost:4000/api/ingest/video \
  -H "Content-Type: application/json" \
  -d '{
        "bucket": "videos",
        "filePath": "reunion-microsoft.mp4",
        "localPath": "C:/tmp/reunion.mp4",
        "process": true
      }'
```

```json
{
  "ok": true,
  "message": "Video subido correctamente. El procesamiento se ejecutará automáticamente.",
  "bucket": "videos",
  "path": "videos/reunion-microsoft.mp4",
  "url": "https://<supabase-storage-url>/videos/reunion-microsoft.mp4",
  "willProcess": true
}
```

**Notas**
- El campo `generated: true` indica que se usaron datos mock. `data` devuelve el payload generado.
- Cuando se normaliza un mensaje, se guarda en `interactions` y se activa automáticamente el análisis (`analyzer.js`), que puede generar work items y alertas basados en los resultados.

---

## `/api/jobs`

| Método | Ruta | Descripción | Respuesta |
|--------|------|-------------|-----------|
| POST | `/api/jobs/audio` | Procesa audio (base64) con Gemini, crea job y genera interacción. | `{ ok: true, jobId, interactionId }` |
| POST | `/api/jobs/video` | Procesa video (extrae audio y frames) y sigue flujo similar a audio. | `{ ok: true, jobId, interactionId }` |

```bash
curl -X POST http://localhost:4000/api/jobs/audio \
  -H "Content-Type: application/json" \
  -d '{
        "audio": {
          "base64": "<BASE64_MP3>",
          "mimeType": "audio/mpeg"
        },
        "metadata": { "company": "Apple" }
      }'
```

```json
{
  "ok": true,
  "jobId": "a0f4aa94-bd1e-4a14-8b7a-5f2601efd2be",
  "interactionId": "1732c16e-4d69-4b0d-b63b-9163a8de90db"
}
```

---

## `/api/admin`

Requiere service-role key.

| Método | Ruta | Descripción | Respuesta |
|--------|------|-------------|-----------|
| POST | `/api/admin/seed/usuarios` | Carga contactos desde `contactos_mock.json`/`empresas_mock.json` (`generate` opcional). | `{ ok: true, inserted, updated }` |
| POST | `/api/admin/seed/completo` | Seed completo (companies, contacts, work items, interactions, fresh data). | `{ ok: true, stats: { companies, contacts, ... } }` |
| POST | `/api/admin/analyze/trigger` | Fuerza análisis manual sobre interacciones/work items/contactos. | `{ ok: true, processed }` |
| POST | `/api/admin/watchers/init` | Reinicia watchers en tiempo real. | `{ ok: true }` |
| POST | `/api/admin/ai/reindex` | Reconstruye índices IA (interactions, work items, fresh data, all). | `{ ok: true, queued }` |

```bash
curl -X POST http://localhost:4000/api/admin/seed/completo \
  -H "Content-Type: application/json" \
  -d '{ "generate": true }'
```

```json
{
  "ok": true,
  "stats": {
    "companies": 10,
    "contacts": 28,
    "interactions": 45,
    "workItems": 32,
    "freshData": 25
  }
}
```

```bash
curl -X POST http://localhost:4000/api/admin/analyze/trigger \
  -H "Content-Type: application/json" \
  -d '{ "type": "interaction", "id": "1732c16e-4d69-4b0d-b63b-9163a8de90db", "limit": 1 }'
```

```json
{
  "ok": true,
  "processed": 1
}
```

---

## `/api/crm`

Todas responden con `{ ok: true, data, pagination? }`.

| Método | Ruta | Descripción / Campos |
|--------|------|----------------------|
| GET | `/api/crm/contacts` | Lista contactos. Filtros: `companyId`, `sentiment`, `type`, `limit`, `offset`. |
| GET | `/api/crm/companies` | Lista empresas. Filtros de búsqueda e industria. |
| GET | `/api/crm/interactions` | Interacciones con filtros por fechas (`from`, `to`), `channel`, `minBudget`, `maxBudget`. |
| GET | `/api/crm/work-items` | Work items filtrables por `status`, `priority`, `onlyOverdue`. |
| GET | `/api/crm/fresh-data` | Noticias/eventos (`topic`, `source`, `tag`). |
| GET | `/api/crm/insights/summary` | Resumen agregado. |
| GET | `/api/crm/timeline` | Timeline combinada (`companyId`, `contactId`, `limit`). |
| GET | `/api/crm/companies/:id/overview` | Visión 360° de una empresa. |
| GET | `/api/crm/contacts/:id/overview` | Visión 360° de un contacto. |
| GET | `/api/crm/insights/trends` | Tendencias (volumen/sentimiento) con `days`. |
| GET | `/api/crm/insights/actionable` | Insights accionables (`companyId` opcional). |

```bash
curl "http://localhost:4000/api/crm/interactions?companyId=company-amazon&limit=3"
```

```json
{
  "ok": true,
  "data": [
    {
      "id": "9e2f9403-2a47-4a3d-86ae-38bfb9ff2ea5",
      "channel": "email",
      "occurred_at": "2025-11-08T15:12:33.911Z",
      "budget": 95000,
      "requirements": [
        "Integración ERP global",
        "Auditoría de ciberseguridad"
      ],
      "kpis": [
        "Operating margin",
        "Network uptime"
      ],
      "company": {
        "id": "company-amazon",
        "name": "Amazon"
      },
      "contact": {
        "id": "contact-amazon-ajassy",
        "name": "Andy Jassy",
        "email": "ajassy@amazon.com",
        "role": "President and CEO"
      }
    }
  ],
  "pagination": {
    "limit": 3,
    "offset": 0,
    "total": 42
  }
}
```

---

## `/api/search`

| Método | Ruta | Descripción | Respuesta |
|--------|------|-------------|-----------|
| POST | `/api/search/query` | Búsqueda semántica con embeddings. Body `{ query, companyId?, limit? }`. | `{ ok: true, results: [...] }` |

```bash
curl -X POST http://localhost:4000/api/search/query \
  -H "Content-Type: application/json" \
  -d '{ "query": "estado del proyecto de automatización", "companyId": "company-tesla", "limit": 5 }'
```

```json
{
  "ok": true,
  "results": [
    {
      "id": "ctx-4893",
      "type": "interaction",
      "score": 0.91,
      "snippet": "Elon Musk solicitó acelerar la expansión del Gigafactory...",
      "metadata": {
        "companyId": "company-tesla",
        "contactId": "contact-tesla-elon"
      }
    }
  ]
}
```

---

## `/api/chat`

| Método | Ruta | Descripción | Respuesta |
|--------|------|-------------|-----------|
| POST | `/api/chat/` | Chat IA que combina historial, timeline, insights y acciones. Body `{ question, companyId?, tools?, action?, topK? }`. | `{ ok: true, answer, actions?, citations? }` |

```bash
curl -X POST http://localhost:4000/api/chat/ \
  -H "Content-Type: application/json" \
  -d '{
        "question": "¿Qué debo preparar para la reunión con Microsoft esta semana?",
        "companyId": "company-microsoft",
        "tools": ["timeline", "alerts"]
      }'
```

```json
{
  "ok": true,
  "answer": "Microsoft espera la propuesta de modernización cloud antes del 18 de noviembre...",
  "citations": [
    {
      "source": "interaction:1732c16e-4d69-4b0d-b63b-9163a8de90db",
      "excerpt": "Amy Hood confirmó presupuesto de 95,000 USD para la modernización."
    },
    {
      "source": "web:https://news.microsoft.com/...",
      "excerpt": "Microsoft anunció inversiones adicionales en Azure AI."
    }
  ]
}
```

---

## `/api/notes`

| Método | Ruta | Descripción | Respuesta |
|--------|------|-------------|-----------|
| POST | `/api/notes/` | Inserta una nota manual como interacción. Body `{ text, companyId?, contactId?, metadata? }`. | `{ ok: true, interactionId }` |

```bash
curl -X POST http://localhost:4000/api/notes/ \
  -H "Content-Type: application/json" \
  -d '{
        "text": "Seguimiento con Apple para revisar contrato de soporte 24/7.",
        "companyId": "company-apple",
        "contactId": "contact-apple-tcook"
      }'
```

```json
{
  "ok": true,
  "interactionId": "6b990c5e-167b-4cba-8c31-6e61f6293ce3"
}
```

---

## `/api/alerts`

| Método | Ruta | Descripción | Respuesta |
|--------|------|-------------|-----------|
| GET | `/api/alerts/` | Lista alertas con filtros (`status`, `severity`, `companyId`, `contactId`). | `{ ok: true, alerts, pagination }` |
| POST | `/api/alerts/:id/resolve` | Resuelve una alerta concreta. | `{ ok: true }` |

```bash
curl "http://localhost:4000/api/alerts/?companyId=company-tesla&status=open"
```

```json
{
  "ok": true,
  "alerts": [
    {
      "id": "alert-539c",
      "severity": "high",
      "message": "Interacción con sentimiento negativo y urgencia high",
      "entity_type": "interaction",
      "entity_id": "5f4f99a6-02f2-4c31-8845-2f134aa94f2f",
      "created_at": "2025-11-08T18:15:22.402Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

```bash
curl -X POST http://localhost:4000/api/alerts/alert-539c/resolve
```

```json
{
  "ok": true
}
```

---

## `/api/ai`

| Método | Ruta | Descripción | Respuesta |
|--------|------|-------------|-----------|
| GET | `/api/ai/contexts` | Lista contextos IA (paginado). | `{ ok: true, data, pagination }` |
| DELETE | `/api/ai/contexts/:id` | Elimina un contexto. | `{ ok: true }` |

```bash
curl "http://localhost:4000/api/ai/contexts?companyId=company-netflix&limit=5"
```

```json
{
  "ok": true,
  "data": [
    {
      "id": "ctx-001",
      "type": "interaction",
      "title": "Seguimiento con Greg Peters",
      "content": "Netflix revisará personalización de recomendaciones...",
      "company": { "id": "company-netflix", "name": "Netflix" },
      "contact": { "id": "contact-netflix-greg", "name": "Greg Peters" }
    }
  ],
  "pagination": {
    "limit": 5,
    "offset": 0,
    "total": 12
  }
}
```

---

## `/api/knowledge`

| Método | Ruta | Descripción | Respuesta |
|--------|------|-------------|-----------|
| GET | `/api/knowledge/` | Lista entradas de conocimiento filtrables. | `{ ok: true, records, pagination }` |
| POST | `/api/knowledge/` | Crea entrada simple. Body `{ title, content, companyId?, metadata? }`. | `{ ok: true, id }` |
| POST | `/api/knowledge/upload` | Ingresa texto plano (directo/base64) y lo trocea. | `{ ok: true, created }` |
| POST | `/api/knowledge/url` | Ingresa contenido desde URL. | `{ ok: true, created }` |
| POST | `/api/knowledge/search` | Búsqueda textual/semántica. Body `{ query, companyId?, limit? }`. | `{ ok: true, results }` |
| DELETE | `/api/knowledge/:id` | Elimina una entrada. | `{ ok: true }` |

```bash
curl -X POST http://localhost:4000/api/knowledge/ \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Estrategia de sostenibilidad de PepsiCo 2025",
        "content": "Resumen de iniciativas...",
        "companyId": "company-pepsico",
        "metadata": { "type": "brief" }
      }'
```

```json
{
  "ok": true,
  "id": "kn-204"
}
```

```bash
curl -X POST http://localhost:4000/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{ "query": "5G enterprise connectivity", "companyId": "company-tmobile" }'
```

```json
{
  "ok": true,
  "results": [
    {
      "id": "kn-311",
      "title": "Programa 5G para clientes enterprise",
      "score": 0.84,
      "snippet": "T-Mobile US lanzó bundle 5G enterprise..."
    }
  ]
}
```

---

## `/api/work-items`

| Método | Ruta | Descripción | Respuesta |
|--------|------|-------------|-----------|
| POST | `/api/work-items/` | Crea trabajo accionable manualmente. Body `{ title, description?, companyId?, assigneeContactId?, ownerContactId?, dueDate?, priority? }`. | `{ ok: true, id }` |

```bash
curl -X POST http://localhost:4000/api/work-items/ \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Preparar demo para Alphabet",
        "description": "Demostración de la plataforma de insights para Sundar Pichai.",
        "companyId": "company-alphabet",
        "assigneeContactId": "contact-google-ops",
        "dueDate": "2025-11-18T15:00:00Z",
        "priority": "high"
      }'
```

```json
{
  "ok": true,
  "id": "wi-88f21c8d"
}
```

---

## Ejemplo de flujo de prueba

```bash
# Regenerar dataset con compañías reales
python correos_mock.py

# (Opcional) Seed completo de Supabase
node scripts/seed-supabase.js --seed-completo

# Ingesta automática de un correo
curl -X POST http://localhost:4000/api/ingest/email

# Revisar interacciones creadas
curl "http://localhost:4000/api/crm/interactions?limit=5"

# Forzar análisis manual de una interacción
curl -X POST http://localhost:4000/api/admin/analyze/trigger \
  -H "Content-Type: application/json" \
  -d '{ "type": "interaction", "id": "<UUID>", "limit": 1 }'
```

---
