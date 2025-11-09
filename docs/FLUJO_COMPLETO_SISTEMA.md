# Flujo Completo del Sistema Relay CRM

Este documento describe el flujo completo del sistema desde la generación de datos hasta el análisis automático de audio/video.

## 🎯 Resumen del Flujo

```
1. Generación de Datos (Seeder)
   ↓
2. Ingesta de Interacciones (Email/Slack/WhatsApp/Audio/Video)
   ↓
3. Detección Automática (Watchers)
   ↓
4. Análisis Automático (Gemini + Analyzer)
   ↓
5. Indexación para Búsqueda Semántica (AI Contexts)
   ↓
6. Generación de Work Items y Alertas
```

## 📋 Componentes del Sistema

### 1. Generación de Datos

**Endpoints:**
- `POST /api/admin/seed/usuarios` - Genera contactos/usuarios
- `POST /api/admin/seed/completo` - Genera datos completos (companies, contacts, work items, interactions, fresh data)

**Flujo:**
1. Lee archivos mock (`empresas_mock.json`, `contactos_mock.json`)
2. Crea/actualiza companies en Supabase
3. Crea/actualiza contacts vinculados a companies
4. Crea departments, teams, work items, interactions, fresh data

**Verificación:**
```bash
npm run seed:completo
# o
curl -X POST http://localhost:4000/api/admin/seed/completo
```

### 2. Ingesta de Interacciones

**Endpoints:**
- `POST /api/ingest/email` - Ingesta emails
- `POST /api/ingest/slack` - Ingesta mensajes Slack
- `POST /api/ingest/whatsapp` - Ingesta mensajes WhatsApp
- `POST /api/ingest/audio` - Sube audio a Storage
- `POST /api/ingest/video` - Sube video a Storage

**Flujo:**
1. Recibe datos de la interacción (o genera mocks si `generate=true`)
2. Normaliza los datos a formato estándar
3. Busca/crea contacto y empresa en la base de datos
4. Inserta interacción en la tabla `interactions`
5. **El watcher de realtime detecta el INSERT automáticamente**

**Ejemplo:**
```bash
# Ingesta email con datos mock
curl -X POST http://localhost:4000/api/ingest/email \
  -H "Content-Type: application/json" \
  -d '{"generate": true}'
```

### 3. Detección Automática (Watchers)

#### 3.1 Watchers de Realtime

**Tablas monitoreadas:**
- `interactions` - Detecta nuevas interacciones
- `work_items` - Detecta nuevos work items
- `contacts` - Detecta nuevos contactos
- `fresh_data` - Detecta nuevos fresh data

**Flujo:**
1. Se suscribe a cambios en tiempo real usando Supabase Realtime
2. Cuando detecta un INSERT o UPDATE:
   - Llama automáticamente a `analyzeRecord()`
   - Analiza el registro con Gemini (si está configurado)
   - Indexa el contexto para búsqueda semántica
   - Genera work items si hay next_steps
   - Crea alertas si hay sentimiento negativo o urgencia alta

**Inicialización:**
- Se inicia automáticamente al arrancar el servidor
- Requiere `SUPABASE_SERVICE_ROLE_KEY`
- Se puede reinicializar: `POST /api/admin/watchers/init`

#### 3.2 Storage Watcher

**Buckets monitoreados:**
- `videos` - Detecta nuevos videos
- `audios` - Detecta nuevos audios

**Flujo:**
1. Verifica periódicamente (cada 30s por defecto) los buckets
2. Cuando detecta un archivo nuevo:
   - Descarga el archivo desde Storage
   - Procesa con Gemini (extrae audio, frames, transcripción)
   - Crea una interacción automáticamente
   - **El watcher de realtime analiza la interacción**

**Configuración:**
```env
SUPABASE_STORAGE_BUCKET=videos
SUPABASE_STORAGE_FOLDER=
SUPABASE_STORAGE_WATCH_INTERVAL=30000
SUPABASE_STORAGE_WATCH_ENABLED=true
```

**Inicialización:**
- Se inicia automáticamente al arrancar el servidor
- Requiere `SUPABASE_SERVICE_ROLE_KEY`

### 4. Análisis Automático

**Servicio:** `src/services/analyzer.js`

**Flujo para Interacciones:**
1. Extrae texto de la interacción (notes)
2. Analiza con Gemini (si está configurado):
   - Genera resumen
   - Detecta sentimiento
   - Extrae requirements, KPIs, budget
   - Identifica next_steps
   - Detecta topics, risks, opportunities
3. Si Gemini no está disponible, usa análisis heurístico básico
4. Actualiza la interacción con datos extraídos
5. Crea work items automáticamente desde next_steps
6. Crea alertas si hay sentimiento negativo o urgencia alta
7. Indexa el contexto en `ai_contexts` para búsqueda semántica
8. Actualiza el sentimiento del contacto
9. Recalcula health scores

**Flujo para Work Items:**
1. Detecta si está atrasado (due_date < now)
2. Crea alerta si está atrasado
3. Indexa el contexto en `ai_contexts`

**Flujo para Fresh Data:**
1. Indexa el contexto en `ai_contexts`
2. Recalcula health score de la empresa

### 5. Indexación para Búsqueda Semántica

**Servicio:** `src/services/contextIndexer.js`

**Flujo:**
1. Genera embedding del texto usando Gemini
2. Inserta/actualiza en `ai_contexts` con:
   - `type`: interaction, work_item, fresh_data, knowledge, note
   - `source_id`: ID del registro original
   - `text`: Texto indexado
   - `embedding`: Vector de embeddings (1536 dimensiones)
   - `metadata`: Metadatos adicionales

**Búsqueda:**
- `POST /api/search/query` - Búsqueda semántica usando embeddings
- Usa la función PostgreSQL `match_ai_contexts` para búsqueda por similitud

### 6. Generación de Work Items y Alertas

**Work Items:**
- Se crean automáticamente desde `next_steps` extraídos del análisis
- Se vinculan al contacto y empresa de la interacción
- Se asignan fechas de vencimiento si están disponibles

**Alertas:**
- Se crean automáticamente si:
  - Sentimiento negativo
  - Urgencia alta o crítica
  - Work item atrasado
- Se resuelven automáticamente cuando se soluciona el problema

## 🔄 Flujo Completo: Ejemplo de Audio/Video

### Escenario: Subir un video de Zoom

1. **Subida del archivo:**
```bash
curl -X POST http://localhost:4000/api/ingest/video \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "videos",
    "filePath": "zoom-session-123.mp4",
    "localPath": "/ruta/al/video.mp4",
    "process": true
  }'
```

2. **Storage Watcher detecta el archivo:**
   - Lista archivos en el bucket `videos`
   - Detecta `zoom-session-123.mp4` como nuevo
   - Descarga el archivo

3. **Procesamiento con Gemini:**
   - Extrae audio del video
   - Extrae frames del video (6 frames)
   - Envía a Gemini para análisis multimodal
   - Obtiene transcripción y análisis

4. **Creación de interacción:**
   - Crea interacción en `interactions` con:
     - Channel: `meeting`
     - Notes: Transcripción + análisis
     - Participants: Contactos detectados
     - Budget, requirements, KPIs extraídos
     - Next steps identificados

5. **Watcher de Realtime detecta la interacción:**
   - Detecta el INSERT en `interactions`
   - Llama automáticamente a `analyzeInteraction()`

6. **Análisis automático:**
   - Analiza la interacción (ya analizada por Gemini, pero refina)
   - Crea work items desde next_steps
   - Crea alertas si es necesario
   - Indexa en `ai_contexts`

7. **Resultado:**
   - Interacción creada y analizada
   - Work items creados automáticamente
   - Contexto indexado para búsqueda semántica
   - Alertas creadas si hay problemas

## ✅ Verificación del Sistema

Ejecuta el script de verificación para asegurar que todo funcione:

```bash
npm run verify
```

Este script verifica:
- ✅ Configuración de entorno
- ✅ Conexión a Supabase
- ✅ Tablas de base de datos
- ✅ Buckets de Storage
- ✅ Watchers de realtime
- ✅ Storage watcher
- ✅ Generación de datos
- ✅ Análisis automático
- ⚠️ Integración con Gemini (opcional)

## 🐛 Solución de Problemas

### Watchers no funcionan

**Síntomas:**
- No se analizan las interacciones automáticamente
- No se procesan archivos de Storage

**Solución:**
1. Verifica que `SUPABASE_SERVICE_ROLE_KEY` esté configurado
2. Reinicia el servidor
3. Reinicializa watchers: `POST /api/admin/watchers/init`
4. Verifica los logs del servidor

### Storage watcher no detecta archivos

**Síntomas:**
- Los archivos no se procesan automáticamente

**Solución:**
1. Verifica que el bucket exista
2. Verifica que `SUPABASE_STORAGE_WATCH_ENABLED` no sea `false`
3. Procesa manualmente: `POST /api/ingest/audio` o `/api/ingest/video`
4. Verifica los logs: `[storage-watcher]`

### Análisis no se ejecuta

**Síntomas:**
- Las interacciones no se analizan automáticamente

**Solución:**
1. Verifica que los watchers de realtime estén activos
2. Dispara análisis manual: `POST /api/admin/analyze/trigger`
3. Verifica los logs: `[realtime/interactions]` o `[analyzer]`

### Gemini no funciona

**Síntomas:**
- Errores al generar embeddings o analizar

**Solución:**
1. Verifica que `GOOGLE_GEMINI_API_KEY` esté configurado y sea válido
2. El sistema funciona sin Gemini (usa análisis heurístico)
3. Verifica los logs para errores específicos

## 📊 Estado del Sistema

Para verificar el estado actual:

```bash
# Verificación completa
npm run verify

# Verificar salud del servidor
curl http://localhost:4000/health

# Verificar watchers
curl -X POST http://localhost:4000/api/admin/watchers/init

# Verificar análisis
curl -X POST http://localhost:4000/api/admin/analyze/trigger \
  -H "Content-Type: application/json" \
  -d '{"type": "interactions", "limit": 5}'
```

## 🎯 Checklist de Funcionalidad

- [x] Generación de datos funciona
- [x] Ingesta de emails funciona
- [x] Ingesta de Slack funciona
- [x] Ingesta de WhatsApp funciona
- [x] Subida de audio/video funciona
- [x] Storage watcher detecta archivos nuevos
- [x] Procesamiento automático de audio/video funciona
- [x] Watchers de realtime detectan cambios
- [x] Análisis automático funciona
- [x] Indexación en ai_contexts funciona
- [x] Generación automática de work items funciona
- [x] Generación automática de alertas funciona
- [x] Búsqueda semántica funciona

## 🚀 Próximos Pasos

1. **Configurar Gemini API Key** (opcional pero recomendado)
2. **Generar datos iniciales:** `npm run seed:completo`
3. **Probar ingesta:** Enviar emails/Slack/WhatsApp
4. **Probar audio/video:** Subir archivos a Storage
5. **Verificar análisis:** Revisar que se creen work items y alertas
6. **Probar búsqueda:** Usar `/api/search/query` para búsqueda semántica

