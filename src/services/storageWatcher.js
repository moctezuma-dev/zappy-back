import { adminSupabase } from './adminSupabase.js';
import { downloadFileFromStorage, bufferToBase64, cleanupTempFile } from './storageService.js';
import { extractAudioFromVideoBase64, sampleVideoFramesBase64 } from './media.js';
import { processAudio, processVideo } from './gemini.js';
import { insertInteraction } from './ingestService.js';
import path from 'path';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

let initialized = false;
let watchInterval = null;
const processedFiles = new Set(); // Cache de archivos ya procesados

/**
 * Procesa un archivo de video/audio desde Storage
 */
async function processStorageFile(bucket, filePath, file) {
  const supabase = ensureAdmin();

  try {
    console.log(`[storage-watcher] Procesando archivo: ${filePath}`);

    // Descargar archivo
    const { localPath, buffer, mimeType } = await downloadFileFromStorage(bucket, filePath);
    const base64 = bufferToBase64(buffer);

    let analysisResult = null;

    // Procesar según tipo
    if (mimeType.startsWith('video/')) {
      // Extraer audio del video
      const audioData = await extractAudioFromVideoBase64({
        base64,
        mimeType,
        targetAudioMimeType: 'audio/wav',
      });

      // Extraer frames del video
      const frames = await sampleVideoFramesBase64({
        base64,
        mimeType,
        fps: 1,
        maxFrames: 6,
      });

      // Analizar con Gemini (audio + frames)
      analysisResult = await processVideo({
        audio: audioData,
        frames,
      });
    } else if (mimeType.startsWith('audio/')) {
      // Analizar audio directamente
      analysisResult = await processAudio({
        base64,
        mimeType,
      });
    } else {
      console.warn(`[storage-watcher] Tipo de archivo no soportado: ${mimeType}`);
      await cleanupTempFile(localPath);
      return;
    }

    // Limpiar archivo temporal
    await cleanupTempFile(localPath);

    // Generar interacción desde el análisis
    if (analysisResult) {
      await createInteractionFromAnalysis(analysisResult, filePath, mimeType, bucket);
    }

    // Marcar como procesado
    processedFiles.add(filePath);
    console.log(`[storage-watcher] Archivo procesado exitosamente: ${filePath}`);
  } catch (error) {
    console.error(`[storage-watcher] Error procesando archivo ${filePath}:`, error);
  }
}

/**
 * Crea una interacción desde el análisis de video/audio
 */
async function createInteractionFromAnalysis(analysis, filePath, mimeType, bucket) {
  const supabase = ensureAdmin();

  // Extraer información del contacto
  const contactInfo = {
    name: analysis.contact?.name || null,
    email: analysis.contact?.email || null,
    company: analysis.contact?.company || null,
  };

  // Construir notas desde la transcripción y análisis
  const notes = `Transcripción: ${analysis.transcript || 'N/A'}\n\n` +
    `Análisis: ${JSON.stringify(analysis, null, 2)}`;

  // Normalizar a estructura de interactions
  const normalized = {
    channel: mimeType.startsWith('video/') ? 'meeting' : 'call',
    occurred_at: new Date().toISOString(),
    notes,
    participants: [
      analysis.contact?.name || 'Desconocido',
      ...(analysis.contact?.company ? [analysis.contact.company] : []),
    ].filter(Boolean),
    budget: analysis.deal?.value || null,
    currency: analysis.deal?.currency || 'USD',
    requirements: analysis.requirements || [],
    kpis: analysis.kpis || [],
    data: {
      source: 'storage',
      bucket,
      file_path: filePath,
      mime_type: mimeType,
      transcript: analysis.transcript,
      visual_summary: analysis.visual_summary || null,
      key_visual_elements: analysis.key_visual_elements || [],
    },
    deadline: analysis.next_steps?.[0]?.due_date
      ? new Date(analysis.next_steps[0].due_date).toISOString()
      : null,
  };

  // Insertar interacción (esto disparará automáticamente el watcher de interactions)
  const result = await insertInteraction(normalized, contactInfo);

  // Guardar referencia del archivo procesado en jobs
  await supabase.from('jobs').insert({
    type: 'video_analysis',
    status: 'completed',
    input_data: {
      bucket,
      file_path: filePath,
      mime_type: mimeType,
    },
    output_data: analysis,
    created_at: new Date().toISOString(),
  });

  console.log(`[storage-watcher] Interacción creada: ${result.interactionId}`);
  return result;
}

/**
 * Verifica nuevos archivos en el bucket y los procesa
 */
async function checkForNewFiles(bucket, folder = '') {
  const supabase = ensureAdmin();

  try {
    // Listar archivos en el bucket
    const files = await supabase.storage.from(bucket).list(folder, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' },
    });

    if (files.error) {
      console.error(`[storage-watcher] Error listando archivos: ${files.error.message}`);
      return;
    }

    // Procesar archivos nuevos
    for (const file of files.data || []) {
      const filePath = folder ? `${folder}/${file.name}` : file.name;

      // Saltar si ya fue procesado
      if (processedFiles.has(filePath)) {
        continue;
      }

      // Solo procesar videos y audios
      const isVideo = file.name.match(/\.(mp4|webm|mov)$/i);
      const isAudio = file.name.match(/\.(mp3|wav|m4a|aac|ogg)$/i);

      if (isVideo || isAudio) {
        await processStorageFile(bucket, filePath, file);
      }
    }
  } catch (error) {
    console.error('[storage-watcher] Error verificando archivos:', error);
  }
}

/**
 * Inicia el watcher para detectar nuevos archivos en el bucket
 * @param {string} bucket - Nombre del bucket
 * @param {string} folder - Carpeta dentro del bucket (opcional)
 * @param {number} intervalMs - Intervalo de verificación en milisegundos (default: 30000 = 30s)
 */
export async function startStorageWatcher(bucket, folder = '', intervalMs = 30000) {
  if (initialized) {
    console.log('[storage-watcher] Watcher ya está inicializado');
    return;
  }

  const supabase = ensureAdmin();
  if (!supabase) {
    throw new Error('Supabase service role no configurado');
  }

  console.log(`[storage-watcher] Iniciando watcher para bucket: ${bucket}, carpeta: ${folder || 'raíz'}`);

  // Verificar inmediatamente
  await checkForNewFiles(bucket, folder);

  // Configurar intervalo
  watchInterval = setInterval(async () => {
    await checkForNewFiles(bucket, folder);
  }, intervalMs);

  initialized = true;
  console.log(`[storage-watcher] Watcher iniciado (verifica cada ${intervalMs / 1000}s)`);
}

/**
 * Detiene el watcher
 */
export function stopStorageWatcher() {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
    initialized = false;
    console.log('[storage-watcher] Watcher detenido');
  }
}

/**
 * Procesa un archivo específico manualmente
 */
export async function processFileManually(bucket, filePath) {
  const supabase = ensureAdmin();
  if (!supabase) {
    throw new Error('Supabase service role no configurado');
  }

  // Verificar que el archivo existe
  const folder = path.dirname(filePath) || '';
  const fileName = path.basename(filePath);
  
  const { data: files, error } = await supabase.storage.from(bucket).list(folder === '.' ? '' : folder, {
    limit: 1000,
  });

  if (error) {
    throw new Error(`Error verificando archivo: ${error.message}`);
  }

  const file = files?.find((f) => f.name === fileName);
  if (!file) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }

  await processStorageFile(bucket, filePath, file);
}

