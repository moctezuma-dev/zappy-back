import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const VIDEO_EXT_MAP = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

function ensureFfmpegConfigured() {
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
}

function getTempPath(prefix, ext) {
  const safeExt = ext?.startsWith('.') ? ext : `.${ext || 'bin'}`;
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}${safeExt}`);
}

export async function extractAudioFromVideoBase64({ base64, mimeType, targetAudioMimeType = 'audio/wav' }) {
  if (!base64 || !mimeType?.startsWith('video/')) {
    throw new Error('Datos de video inválidos para extracción de audio');
  }

  ensureFfmpegConfigured();

  const ext = VIDEO_EXT_MAP[mimeType] || '.mp4';
  const videoPath = getTempPath('relay-video', ext);
  const audioPath = getTempPath('relay-audio', '.wav');

  await fs.writeFile(videoPath, Buffer.from(base64, 'base64'));

  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .format('wav')
      .output(audioPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  const audioBuffer = await fs.readFile(audioPath);
  const audioBase64 = audioBuffer.toString('base64');

  // Limpieza
  try { await fs.unlink(videoPath); } catch {}
  try { await fs.unlink(audioPath); } catch {}

  return { base64: audioBase64, mimeType: targetAudioMimeType };
}

export async function sampleVideoFramesBase64({ base64, mimeType, fps = 1, maxFrames = 6 }) {
  if (!base64 || !mimeType?.startsWith('video/')) {
    throw new Error('Datos de video inválidos para muestreo de frames');
  }

  ensureFfmpegConfigured();

  const ext = VIDEO_EXT_MAP[mimeType] || '.mp4';
  const videoPath = getTempPath('relay-video', ext);
  const framesDir = path.join(os.tmpdir(), `relay-frames-${Date.now()}`);

  await fs.writeFile(videoPath, Buffer.from(base64, 'base64'));
  await fs.mkdir(framesDir, { recursive: true });

  const framePattern = path.join(framesDir, 'frame-%03d.jpg');

  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([`-vf fps=${fps}`, `-frames:v ${maxFrames}`])
      .output(framePattern)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  // Leer frames generados
  const files = (await fs.readdir(framesDir))
    .filter((f) => f.startsWith('frame-') && f.endsWith('.jpg'))
    .sort()
    .slice(0, maxFrames);

  const frames = [];
  for (const file of files) {
    const buf = await fs.readFile(path.join(framesDir, file));
    frames.push({ base64: buf.toString('base64'), mimeType: 'image/jpeg' });
  }

  // Limpieza
  try { await fs.unlink(videoPath); } catch {}
  try {
    for (const file of files) {
      try { await fs.unlink(path.join(framesDir, file)); } catch {}
    }
    await fs.rmdir(framesDir);
  } catch {}

  return frames;
}