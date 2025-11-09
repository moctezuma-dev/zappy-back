import { Router } from 'express';
import {
  createKnowledgeEntry,
  createKnowledgeEntriesFromText,
  createKnowledgeEntriesFromUrl,
  deleteKnowledgeEntry,
  listKnowledgeEntries,
  searchKnowledge,
} from '../services/knowledgeService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { companyId, search, limit, offset } = req.query;
    const result = await listKnowledgeEntries({
      companyId,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[knowledge/list] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, content, companyId, metadata } = req.body || {};
    const entry = await createKnowledgeEntry({ title, content, companyId, metadata });
    return res.json({ ok: true, entry });
  } catch (error) {
    console.error('[knowledge/post] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const {
      title,
      content = '',
      fileBase64 = '',
      companyId,
      metadata = {},
      chunkSize,
    } = req.body || {};
    const decodedContent = content || Buffer.from(fileBase64 || '', 'base64').toString('utf8');
    if (!decodedContent) {
      return res.status(400).json({ ok: false, error: 'Se requiere content o fileBase64' });
    }
    const entries = await createKnowledgeEntriesFromText({
      title,
      content: decodedContent,
      companyId,
      metadata,
      chunkSize: chunkSize ? Number(chunkSize) : undefined,
    });
    return res.json({ ok: true, entries });
  } catch (error) {
    console.error('[knowledge/upload] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.post('/url', async (req, res) => {
  try {
    const { title, url, companyId, metadata = {}, chunkSize } = req.body || {};
    const entries = await createKnowledgeEntriesFromUrl({
      title,
      url,
      companyId,
      metadata,
      chunkSize: chunkSize ? Number(chunkSize) : undefined,
    });
    return res.json({ ok: true, entries });
  } catch (error) {
    console.error('[knowledge/url] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.post('/search', async (req, res) => {
  try {
    const { query, companyId, limit } = req.body || {};
    const results = await searchKnowledge({ query, companyId, limit });
    return res.json({ ok: true, results });
  } catch (error) {
    console.error('[knowledge/search] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteKnowledgeEntry(id);
    return res.json({ ok: true });
  } catch (error) {
    console.error('[knowledge/delete] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;

