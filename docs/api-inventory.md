# Inventario de endpoints – Relay API

_Actualizado: 9 de noviembre de 2025_

## Resumen por namespace
| Base path | Archivo (`src/routes`) | Propósito principal |
| --- | --- | --- |
| `/health` | `health.js` | Ping de disponibilidad y verificación de configuración |
| `/api/ingest` | `ingest.js` | Ingesta de interacciones (email, chat, voz, multimedia) y subida directa de archivos |
| `/api/jobs` | `jobs.js` | Procesamiento diferido de audio/video con Gemini y persistencia de resultados |
| `/api/admin` | `admin.js` | Operaciones administrativas (seed, análisis manual, watchers, reindexación IA) |
| `/api/crm` | `crm.js` | Lectura de entidades CRM (contactos, empresas, interacciones, insights) |
| `/api/search` | `search.js` | Búsqueda semántica sobre `ai_contexts` vía embeddings |
| `/api/chat` | `chat.js` | Sesiones conversacionales asistidas por Gemini + acciones automáticas |
| `/api/notes` | `notes.js` | Alta de notas manuales y sincronización con `ai_contexts` |
| `/api/alerts` | `alerts.js` | Gestión de alertas (listado y resolución) |
| `/api/ai` | `ai.js` | Gestión de contextos IA persistidos |
| `/api/knowledge` | `knowledge.js` | Gestión y búsqueda de base de conocimiento (manual, archivo, URL) |
| `/api/work-items` | `workItems.js` | Creación de work items accionables |

---

## `/health`
| Método | Ruta | Servicios | Descripción | Notas |
| --- | --- | --- | --- | --- |
| GET | `/health/` | `hasGemini`, `hasSupabase` | Ping simple que devuelve `ok`, timestamp y flags de configuración. | Uso recomendado para probes de uptime. |

---

## `/api/ingest`
| Método | Ruta | Servicios principales | Descripción | Validación/Notas |
| --- | --- | --- | --- | --- |
| POST | `/api/ingest/email` | `normalizeEmail`, `insertInteraction`, `mockDataset` | Ingesta de correos; normaliza a `interactions` e intenta asociar contacto/empresa. | Valida payload con `emailIngestSchema` (Zod) cuando no se solicita generación automática. |
| POST | `/api/ingest/slack` | `normalizeSlack`, `insertInteraction`, `mockDataset` | Ingesta de mensajes Slack/Teams. Enriquecimiento contextual con dataset mock. | Valida con `slackIngestSchema`. |
| POST | `/api/ingest/whatsapp` | `normalizeWhatsApp`, `insertInteraction`, `mockDataset` | Ingesta de mensajes WhatsApp/SMS incluyendo adjuntos. Calcula timestamp robusto y contexto. | Valida con `whatsappIngestSchema`; soporta `generate` para mocks. |
| POST | `/api/ingest/video` | `uploadFileToStorage`, `processFileManually` | Sube video a Supabase Storage (`bucket` configurable) y dispara análisis manual. | Admite archivo, `base64` o `localPath`. Parámetro `process` controla análisis automático. |
| POST | `/api/ingest/audio` | `uploadFileToStorage`, `processFileManually` | Similar al endpoint de video pero para audio. | Usa `inferExtension` según `mimeType`. |

**Convenciones adicionales**  
- Los payloads que incluyan `generate: true` o estén vacíos producen mocks coherentes con `mockDataset`.  
- El dataset mock se alimenta de `empresas_mock.json` con compañías globales reales (Coca-Cola, PepsiCo, Amazon, Microsoft, Tesla, etc.). Ejecuta `python correos_mock.py` para regenerar datos actualizados antes de probar.  
- La normalización agrega `data.context` con información enriquecida (contacto + empresa) cuando hay match en el dataset mock.  

---

## `/api/jobs`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| POST | `/api/jobs/audio` | `processAudio`, `insertJob`, `createInteractionFromJob` | Procesa audio (base64) con Gemini, upserta contacto, persiste job y crea interacción derivada. | Requiere `audio.base64` y `audio.mimeType`; valida presencia de API key Gemini. |
| POST | `/api/jobs/video` | `processVideo`, `extractAudioFromVideoBase64`, `sampleVideoFramesBase64`, `createInteractionFromJob` | Procesa video (modo audio-only o combinado) y sigue el mismo flujo de persistencia que audio. | `analysis: 'audio_only' | 'video'`; valida `video.mimeType` con prefijo `video/`. |

---

## `/api/admin`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| POST | `/api/admin/seed/usuarios` | `agregarUsuarios` | Seed de contactos/usuarios desde `contactos_mock.json` o `empresas_mock.json`. | Acepta `{ generate?: boolean }`; requiere `SUPABASE_SERVICE_ROLE_KEY`. |
| POST | `/api/admin/seed/completo` | `seedCompleto` | Seed integral (companies, contacts, work-items, interactions, fresh-data). | Igual dependencia de service role. |
| POST | `/api/admin/analyze/trigger` | `triggerManualAnalysis` | Dispara análisis manual sobre interacciones/work items/contacts. | `type`, `id`, `limit`. |
| POST | `/api/admin/watchers/init` | `initializeRealtimeWatchers` | Reinicializa watchers realtime de Supabase. | Sin body. |
| POST | `/api/admin/ai/reindex` | `reindexInteractions`, `reindexWorkItems`, `reindexFreshData`, `reindexAll` | Reconstruye índices IA por tipo. | Body `{ type, limit, companyId }`. |

---

## `/api/crm`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| GET | `/api/crm/contacts` | `getContacts` | Listado filtrable por empresa, sentiment, tipo de persona, fechas. | Paginación (`limit`, `offset`). |
| GET | `/api/crm/companies` | `getCompanies` | Listado de empresas con filtros de búsqueda/industria. | Paginación. |
| GET | `/api/crm/interactions` | `getInteractions` | Listado de interacciones con filtros por fechas, canal y presupuesto. | Paginación y filtros numéricos. |
| GET | `/api/crm/work-items` | `getWorkItems` | Listado de work items (estado, prioridad, vencimientos). | `onlyOverdue` se interpreta como booleano. |
| GET | `/api/crm/fresh-data` | `getFreshData` | Noticias/eventos recientes (fresh_data). | Filtros por tema/fuente/etiqueta. |
| GET | `/api/crm/insights/summary` | `getInsightsSummary` | Resumen de insights agregados. | `companyId`, `limit`. |
| GET | `/api/crm/timeline` | `getTimeline` | Timeline combinada contacto/empresa. | `companyId`, `contactId`, `limit`. |
| GET | `/api/crm/companies/:id/overview` | `getCompanyOverview` | Visión 360° de una empresa. | `interactionsLimit`, `workItemsLimit`. |
| GET | `/api/crm/contacts/:id/overview` | `getContactOverview` | Visión 360° de un contacto. | Igual a anterior. |
| GET | `/api/crm/insights/trends` | `getTrends` | Tendencias (volumen, sentimiento) por periodo. | `days` opcional. |
| GET | `/api/crm/insights/actionable` | `getActionableInsights` | Lista de insights accionables priorizados. | `companyId` opcional. |

---

## `/api/search`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| POST | `/api/search/query` | `embedText`, `match_ai_contexts` | Búsqueda semántica sobre `ai_contexts` via RPC `match_ai_contexts`. | Requiere `query` (`string`). Controla top-K con `limit`. |

---

## `/api/chat`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| POST | `/api/chat/` | `generateChatResponse`, `getTimeline`, `getActionableInsights`, `listAlerts`, `getTrends` | Administra sesiones de chat IA, agrega contexto (embeddings), ejecuta acciones (crear work item, resolver alerta) y registra mensajes. | Requiere `question`. Puede recibir `tools`, `action` y `topK`. |

---

## `/api/notes`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| POST | `/api/notes/` | `interactions` table (via Supabase), `upsertAiContext` | Inserta una nota manual como interacción y sincroniza contexto IA asociado. | Requiere `text`; acepta `companyId`, `contactId`, `metadata`. |

---

## `/api/alerts`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| GET | `/api/alerts/` | `listAlerts` | Lista alertas con filtros de status/severidad/empresa/contacto. | `limit` y `offset` soportados. |
| POST | `/api/alerts/:id/resolve` | `resolveAlertById` | Marca una alerta como resuelta. | Devuelve `{ ok: true }` al completar. |

---

## `/api/ai`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| GET | `/api/ai/contexts` | `ai_contexts` (Supabase) | Listado paginado de contextos IA con joins a company/contact. | Filtros por `type`, `companyId`, `contactId`, `search`. |
| DELETE | `/api/ai/contexts/:id` | `ai_contexts` (Supabase) | Elimina un contexto IA específico. | Requiere service-role key. |

---

## `/api/knowledge`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| GET | `/api/knowledge/` | `listKnowledgeEntries` | Lista entradas de conocimiento con filtros. | Query params `companyId`, `search`, paginación. |
| POST | `/api/knowledge/` | `createKnowledgeEntry` | Crea entrada simple (texto). | Requiere `title`/`content`. |
| POST | `/api/knowledge/upload` | `createKnowledgeEntriesFromText` | Ingresa texto plano (directo o base64) y lo particiona. | `chunkSize` opcional. |
| POST | `/api/knowledge/url` | `createKnowledgeEntriesFromUrl` | Extrae contenido desde URL y genera entradas. | Requiere `url`. |
| POST | `/api/knowledge/search` | `searchKnowledge` | Búsqueda textual/semántica dentro de conocimiento. | Body `{ query, companyId?, limit? }`. |
| DELETE | `/api/knowledge/:id` | `deleteKnowledgeEntry` | Elimina entrada por id. | Devuelve `{ ok: true }`. |

---

## `/api/work-items`
| Método | Ruta | Servicios principales | Descripción | Notas |
| --- | --- | --- | --- | --- |
| POST | `/api/work-items/` | `createWorkItem` | Crea un work item manualmente (tareas accionables). | Body con `title`, `description`, `companyId`, `assigneeContactId`, etc. |

---

### Observaciones adicionales
- Todos los endpoints devuelven `{ ok: boolean, ... }` como convención primaria, facilitando el manejo uniforme de respuestas.  
- Los endpoints que interactúan con Supabase requieren que `adminSupabase` esté correctamente inicializado (service role).  
- La nueva capa de validación de `ingest` usa Zod (`src/schemas/ingestSchemas.js`) y produce respuestas 400 consistentes (`details` con `path` y `message`).  
- Las normalizaciones de `ingest` se enriquecen con `mockDataset`, generando un bloque `context` reutilizable para analítica y trazabilidad en `data`.  
- Gemini se inicializa con `google_search_retrieval` habilitado para enriquecer respuestas con búsquedas web en tiempo real; se puede desactivar configurando `GOOGLE_GEMINI_ENABLE_SEARCH_RETRIEVAL=false`.

