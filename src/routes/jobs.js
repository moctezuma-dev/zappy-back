import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { hasGemini } from '../config/env.js';
import { processAudio, processVideo } from '../services/gemini.js';
import { extractAudioFromVideoBase64, sampleVideoFramesBase64 } from '../services/media.js';
import { insertJob, updateJobById, upsertContact } from '../services/supabase.js';
import { createInteractionFromJob } from '../services/jobInteractions.js';

const router = Router();

router.post('/audio', async (req, res) => {
  try {
    if (!hasGemini()) {
      return res.status(400).json({ ok: false, error: 'Configura GOOGLE_GEMINI_API_KEY en .env' });
    }

    const { audio, source = 'call', metadata = {} } = req.body || {};
    if (!audio?.base64 || !audio?.mimeType) {
      return res.status(400).json({ ok: false, error: 'Body inválido: se requiere audio.base64 y audio.mimeType' });
    }

    const jobId = uuidv4();
    await insertJob({ id: jobId, type: 'audio', status: 'pending', input_data: { source, metadata }, created_at: new Date().toISOString() });

    const data = await processAudio({ base64: audio.base64, mimeType: audio.mimeType });

    // Persistencia mínima: intentar upsert de contacto si existe email o nombre
    let contact = null;
    if (data?.contact) {
      const { name, company, role, email, phone } = data.contact;
      const { data: contactData } = await upsertContact({ name, company, role, email, phone });
      contact = contactData || data.contact;
    }

    await updateJobById(jobId, { status: 'completed', output_data: data, completed_at: new Date().toISOString() });

    try {
      await createInteractionFromJob({
        analysis: data,
        channel: source === 'meeting' ? 'meeting' : 'call',
        source: 'jobs_audio',
        jobId,
      });
    } catch (persistError) {
      console.error('[jobs/audio] persist interaction error', persistError);
    }

    return res.json({ ok: true, jobId, status: 'completed', data, contact });
  } catch (error) {
    console.error('[jobs/audio] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;

// Nuevo endpoint: Procesamiento de video
router.post('/video', async (req, res) => {
  try {
    if (!hasGemini()) {
      return res.status(400).json({ ok: false, error: 'Configura GOOGLE_GEMINI_API_KEY en .env' });
    }

    const { video, analysis = 'audio_only', source = 'call', metadata = {} } = req.body || {};
    if (!video?.base64 || !video?.mimeType || !video?.mimeType?.startsWith('video/')) {
      return res.status(400).json({ ok: false, error: 'Body inválido: se requiere video.base64 y video.mimeType (video/*)' });
    }

    const jobId = uuidv4();
    await insertJob({ id: jobId, type: 'video', status: 'pending', input_data: { source, metadata, analysis }, created_at: new Date().toISOString() });

    // Extraer audio del video para ambos modos
    const audioData = await extractAudioFromVideoBase64({ base64: video.base64, mimeType: video.mimeType });

    let data;
    if (analysis === 'audio_only') {
      data = await processAudio({ base64: audioData.base64, mimeType: audioData.mimeType });
    } else {
      const frames = await sampleVideoFramesBase64({ base64: video.base64, mimeType: video.mimeType, fps: 1, maxFrames: 6 });
      data = await processVideo({ audio: audioData, frames });
    }

    let contact = null;
    if (data?.contact) {
      const { name, company, role, email, phone } = data.contact;
      const { data: contactData } = await upsertContact({ name, company, role, email, phone });
      contact = contactData || data.contact;
    }

    await updateJobById(jobId, { status: 'completed', output_data: data, completed_at: new Date().toISOString() });

    try {
      await createInteractionFromJob({
        analysis: data,
        channel: analysis === 'video' ? 'meeting' : 'call',
        source: 'jobs_video',
        jobId,
      });
    } catch (persistError) {
      console.error('[jobs/video] persist interaction error', persistError);
    }

    return res.json({ ok: true, jobId, status: 'completed', data, contact });
  } catch (error) {
    console.error('[jobs/video] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});