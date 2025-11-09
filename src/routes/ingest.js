import { Router } from 'express';
import {
  normalizeEmail,
  normalizeSlack,
  normalizeWhatsApp,
  insertInteraction,
} from '../services/ingestService.js';
import {
  generateEmailMock,
  generateSlackMock,
  generateWhatsAppMock,
} from '../services/mockDataGenerator.js';
import {
  emailIngestSchema,
  slackIngestSchema,
  whatsappIngestSchema,
  formatZodError,
} from '../schemas/ingestSchemas.js';
import { uploadFileToStorage } from '../services/storageService.js';
import { processFileManually } from '../services/storageWatcher.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const router = Router();

function inferExtension(mimeType, fallback = '.bin') {
  if (!mimeType) return fallback;
  const map = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
    'audio/ogg': '.ogg',
  };
  return map[mimeType] || fallback;
}

/**
 * POST /api/ingest/email
 * Recibe datos mock de un email y los normaliza a interactions
 * Si no se envía body, genera datos mock automáticamente
 * 
 * Body opcional:
 * {
 *   "from": "Juan Pérez <juan@empresa.com>",
 *   "to": "ventas@miempresa.com",
 *   "subject": "Cotización para proyecto",
 *   "body": "Hola, necesito una cotización...",
 *   "date": "2025-01-15T10:30:00Z",
 *   "attachments": [],
 *   "metadata": {}
 * }
 * 
 * Si no se envía body, se generan datos mock automáticamente
 */
router.post('/email', async (req, res) => {
  try {
    const payload = req.body || {};
    const generateMock = Object.keys(payload).length === 0 || payload.generate === true;
    let emailData;

    if (generateMock) {
      console.log('[ingest/email] Generando datos mock automáticamente...');
      emailData = generateEmailMock();
    } else {
      const { generate, ...domainPayload } = payload;
      const parsed = emailIngestSchema.safeParse(domainPayload);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'Payload inválido para email',
          details: formatZodError(parsed.error),
        });
      }
      emailData = parsed.data;
    }

    // Normalizar datos de email
    const normalized = normalizeEmail(emailData);

    // Extraer información de contacto del remitente
    const fromMatch = emailData.from?.match(/^(.+?)\s*<(.+?)>$/) || [null, emailData.from, emailData.from];
    const normalizedContext = normalized?.data?.context || {};
    const contactInfo = {
      name: fromMatch[1]?.trim() || emailData.from,
      email: fromMatch[2]?.trim() || emailData.from,
      company: emailData.company || normalizedContext.company?.name || null,
    };

    // Insertar en interactions (esto disparará automáticamente el watcher)
    const result = await insertInteraction(normalized, contactInfo);

    return res.json({
      ok: true,
      message: 'Email ingerido correctamente. El análisis se ejecutará automáticamente.',
      interactionId: result.interactionId,
      contactId: result.contactId,
      companyId: result.companyId,
      generated: generateMock,
      data: generateMock ? emailData : undefined,
    });
  } catch (error) {
    console.error('[ingest/email] error', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Error interno',
    });
  }
});

/**
 * POST /api/ingest/slack
 * Recibe datos mock de un mensaje de Slack y los normaliza a interactions
 * Si no se envía body, genera datos mock automáticamente
 * 
 * Body opcional:
 * {
 *   "user": {"name": "maria.garcia", "real_name": "María García"},
 *   "channel": {"name": "ventas"},
 *   "text": "Hola equipo, tenemos una nueva oportunidad...",
 *   "ts": "1705320600.123456",
 *   "thread_ts": null,
 *   "attachments": [],
 *   "metadata": {}
 * }
 * 
 * Si no se envía body, se generan datos mock automáticamente
 */
router.post('/slack', async (req, res) => {
  try {
    const payload = req.body || {};
    const generateMock = Object.keys(payload).length === 0 || payload.generate === true;
    let slackData;

    if (generateMock) {
      console.log('[ingest/slack] Generando datos mock automáticamente...');
      slackData = generateSlackMock();
    } else {
      const { generate, ...domainPayload } = payload;
      const parsed = slackIngestSchema.safeParse(domainPayload);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'Payload inválido para Slack',
          details: formatZodError(parsed.error),
        });
      }
      slackData = parsed.data;
    }

    // Normalizar datos de Slack
    const normalized = normalizeSlack(slackData);

    // Extraer información de contacto del usuario
    const user = slackData.user || {};
    const normalizedContext = normalized?.data?.context || {};
    const contactInfo = {
      name: user.real_name || user.name || 'Usuario Slack',
      email: user.email || null,
      company: slackData.company || normalizedContext.company?.name || null, // Opcional
    };

    // Insertar en interactions
    const result = await insertInteraction(normalized, contactInfo);

    return res.json({
      ok: true,
      message: 'Mensaje de Slack ingerido correctamente. El análisis se ejecutará automáticamente.',
      interactionId: result.interactionId,
      contactId: result.contactId,
      companyId: result.companyId,
      generated: generateMock,
      data: generateMock ? slackData : undefined,
    });
  } catch (error) {
    console.error('[ingest/slack] error', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Error interno',
    });
  }
});

/**
 * POST /api/ingest/whatsapp
 * Recibe datos mock de un mensaje de WhatsApp y los normaliza a interactions
 * Si no se envía body, genera datos mock automáticamente
 * 
 * Body opcional:
 * {
 *   "from": "+521234567890",
 *   "to": "+529876543210",
 *   "message": "Hola, me interesa el producto...",
 *   "timestamp": "2025-01-15T10:30:00Z",
 *   "media": null,
 *   "metadata": {}
 * }
 * 
 * Si no se envía body, se generan datos mock automáticamente
 */
router.post('/whatsapp', async (req, res) => {
  try {
    const payload = req.body || {};
    const generateMock = Object.keys(payload).length === 0 || payload.generate === true;
    let whatsappData;

    if (generateMock) {
      console.log('[ingest/whatsapp] Generando datos mock automáticamente...');
      whatsappData = generateWhatsAppMock();
    } else {
      const { generate, ...domainPayload } = payload;
      const parsed = whatsappIngestSchema.safeParse(domainPayload);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'Payload inválido para WhatsApp',
          details: formatZodError(parsed.error),
        });
      }
      whatsappData = parsed.data;
    }

    // Normalizar datos de WhatsApp
    const normalized = normalizeWhatsApp(whatsappData);

    // Extraer información de contacto
    const normalizedContext = normalized?.data?.context || {};
    const contactInfo = {
      name: whatsappData.contactName || whatsappData.from || normalizedContext.contact?.name || 'Contacto WhatsApp',
      phone: whatsappData.from,
      email: whatsappData.email || normalizedContext.contact?.email || null,
      company: whatsappData.company || normalizedContext.company?.name || null,
    };

    // Insertar en interactions
    const result = await insertInteraction(normalized, contactInfo);

    return res.json({
      ok: true,
      message: 'Mensaje de WhatsApp ingerido correctamente. El análisis se ejecutará automáticamente.',
      interactionId: result.interactionId,
      contactId: result.contactId,
      companyId: result.companyId,
      generated: generateMock,
      data: generateMock ? whatsappData : undefined,
    });
  } catch (error) {
    console.error('[ingest/whatsapp] error', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Error interno',
    });
  }
});

/**
 * POST /api/ingest/video
 * Sube un video a Supabase Storage y lo procesa automáticamente
 * 
 * Body opcional:
 * {
 *   "bucket": "videos",
 *   "filePath": "zoom-session-123.mp4",
 *   "localPath": "/path/to/video.mp4",
 *   "process": true
 * }
 * 
 * O envía el archivo directamente como multipart/form-data
 */
router.post('/video', async (req, res) => {
  try {
    const bucket = req.body.bucket || 'videos';
    const filePath = req.body.filePath || `zoom-session-${Date.now()}.mp4`;
    const localPath = req.body.localPath;
    const base64 = req.body.base64;
    const mimeType = req.body.mimeType || 'video/mp4';
    const process = req.body.process !== false; // Por defecto procesar

    if (!localPath && !base64 && !req.file) {
      return res.status(400).json({
        ok: false,
        error: 'Se requiere localPath, base64 o archivo en multipart/form-data',
      });
    }

    // Si hay archivo en multipart, guardarlo temporalmente
    let tempPath = localPath;
    let shouldCleanup = false;
    if (req.file) {
      tempPath = path.join(os.tmpdir(), `relay-upload-${Date.now()}${path.extname(req.file.originalname)}`);
      await fs.writeFile(tempPath, req.file.buffer);
      shouldCleanup = true;
    } else if (!localPath && base64) {
      const extension = inferExtension(mimeType, '.mp4');
      tempPath = path.join(os.tmpdir(), `relay-upload-${Date.now()}${extension}`);
      await fs.writeFile(tempPath, Buffer.from(base64, 'base64'));
      shouldCleanup = true;
    }

    try {
      // Subir a Storage
      const uploadResult = await uploadFileToStorage(bucket, tempPath, filePath, {
        contentType: mimeType || 'video/mp4',
        metadata: {
          source: 'zoom',
          uploaded_at: new Date().toISOString(),
        },
      });

      // Si se solicita procesar, procesar inmediatamente (en background)
      if (process) {
        processFileManually(bucket, filePath).catch((err) => {
          console.error('[ingest/video] Error procesando archivo:', err);
        });
      }

      return res.json({
        ok: true,
        message: 'Video subido correctamente. El procesamiento se ejecutará automáticamente.',
        bucket,
        path: uploadResult.path,
        url: uploadResult.url,
        willProcess: process,
      });
    } finally {
      // Limpiar archivo temporal si fue creado
      if (shouldCleanup && tempPath) {
        try {
          await fs.unlink(tempPath);
        } catch {}
      }
    }
  } catch (error) {
    console.error('[ingest/video] error', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Error interno',
    });
  }
});

/**
 * POST /api/ingest/audio
 * Sube un audio a Supabase Storage y lo procesa automáticamente
 * 
 * Body opcional:
 * {
 *   "bucket": "audios",
 *   "filePath": "call-recording-123.mp3",
 *   "localPath": "/path/to/audio.mp3",
 *   "process": true
 * }
 */
router.post('/audio', async (req, res) => {
  try {
    const bucket = req.body.bucket || 'audios';
    const filePath = req.body.filePath || `call-recording-${Date.now()}.mp3`;
    const localPath = req.body.localPath;
    const base64 = req.body.base64;
    const mimeType = req.body.mimeType || 'audio/mpeg';
    const process = req.body.process !== false;

    if (!localPath && !base64 && !req.file) {
      return res.status(400).json({
        ok: false,
        error: 'Se requiere localPath, base64 o archivo en multipart/form-data',
      });
    }

    // Si hay archivo en multipart, guardarlo temporalmente
    let tempPath = localPath;
    let shouldCleanup = false;
    if (req.file) {
      tempPath = path.join(os.tmpdir(), `relay-upload-${Date.now()}${path.extname(req.file.originalname)}`);
      await fs.writeFile(tempPath, req.file.buffer);
      shouldCleanup = true;
    } else if (!localPath && base64) {
      const extension = inferExtension(mimeType, '.mp3');
      tempPath = path.join(os.tmpdir(), `relay-upload-${Date.now()}${extension}`);
      await fs.writeFile(tempPath, Buffer.from(base64, 'base64'));
      shouldCleanup = true;
    }

    try {
      // Subir a Storage
      const uploadResult = await uploadFileToStorage(bucket, tempPath, filePath, {
        contentType: mimeType || 'audio/mpeg',
        metadata: {
          source: 'call',
          uploaded_at: new Date().toISOString(),
        },
      });

      // Si se solicita procesar, procesar inmediatamente (en background)
      if (process) {
        processFileManually(bucket, filePath).catch((err) => {
          console.error('[ingest/audio] Error procesando archivo:', err);
        });
      }

      return res.json({
        ok: true,
        message: 'Audio subido correctamente. El procesamiento se ejecutará automáticamente.',
        bucket,
        path: uploadResult.path,
        url: uploadResult.url,
        willProcess: process,
      });
    } finally {
      // Limpiar archivo temporal si fue creado
      if (shouldCleanup && tempPath) {
        try {
          await fs.unlink(tempPath);
        } catch {}
      }
    }
  } catch (error) {
    console.error('[ingest/audio] error', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Error interno',
    });
  }
});

export default router;

