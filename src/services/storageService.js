import { adminSupabase } from './adminSupabase.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

/**
 * Sube un archivo a Supabase Storage
 * @param {string} bucket - Nombre del bucket
 * @param {string} filePath - Ruta del archivo local
 * @param {string} storagePath - Ruta en el bucket (ej: 'videos/zoom-session-123.mp4')
 * @param {object} options - Opciones adicionales (contentType, metadata, etc.)
 * @returns {Promise<{path: string, url: string}>}
 */
export async function uploadFileToStorage(bucket, filePath, storagePath, options = {}) {
  const supabase = ensureAdmin();

  // Leer archivo local
  const fileBuffer = await fs.readFile(filePath);
  const fileBlob = new Blob([fileBuffer]);

  // Subir a Supabase Storage
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, fileBlob, {
      contentType: options.contentType || 'application/octet-stream',
      upsert: options.upsert || false,
      metadata: options.metadata || {},
    });

  if (error) {
    throw new Error(`Error subiendo archivo a Storage: ${error.message}`);
  }

  // Obtener URL pública
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  return {
    path: data.path,
    url: urlData.publicUrl,
  };
}

/**
 * Descarga un archivo de Supabase Storage a un archivo temporal local
 * @param {string} bucket - Nombre del bucket
 * @param {string} storagePath - Ruta en el bucket
 * @returns {Promise<{localPath: string, buffer: Buffer, mimeType: string}>}
 */
export async function downloadFileFromStorage(bucket, storagePath) {
  const supabase = ensureAdmin();

  // Descargar archivo
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);

  if (error) {
    throw new Error(`Error descargando archivo de Storage: ${error.message}`);
  }

  // Convertir a buffer
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Guardar en archivo temporal
  const ext = path.extname(storagePath);
  const tempPath = path.join(os.tmpdir(), `relay-storage-${Date.now()}${ext}`);
  await fs.writeFile(tempPath, buffer);

  // Detectar mimeType
  const mimeType = detectMimeType(ext);

  return {
    localPath: tempPath,
    buffer,
    mimeType,
  };
}

/**
 * Obtiene la URL pública de un archivo en Storage
 * @param {string} bucket - Nombre del bucket
 * @param {string} storagePath - Ruta en el bucket
 * @returns {string} URL pública
 */
export function getPublicUrl(bucket, storagePath) {
  const supabase = ensureAdmin();
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Lista archivos en un bucket
 * @param {string} bucket - Nombre del bucket
 * @param {string} folder - Carpeta dentro del bucket (opcional)
 * @returns {Promise<Array<{name: string, path: string, size: number, created_at: string}>>}
 */
export async function listFilesInBucket(bucket, folder = '') {
  const supabase = ensureAdmin();

  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 100,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) {
    throw new Error(`Error listando archivos: ${error.message}`);
  }

  return data || [];
}

/**
 * Detecta el mimeType basado en la extensión del archivo
 */
function detectMimeType(ext) {
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Convierte un buffer a base64
 */
export function bufferToBase64(buffer) {
  return buffer.toString('base64');
}

/**
 * Limpia archivos temporales
 */
export async function cleanupTempFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignorar errores de limpieza
  }
}

