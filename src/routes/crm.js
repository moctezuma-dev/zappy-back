import { Router } from 'express';
import {
  getContacts,
  getCompanies,
  getInteractions,
  getWorkItems,
  getFreshData,
} from '../services/crmQuery.js';
import { getInsightsSummary } from '../services/crmInsights.js';
import { getTimeline } from '../services/crmTimeline.js';
import { getCompanyOverview, getContactOverview } from '../services/crmOverview.js';
import { getTrends } from '../services/crmTrends.js';
import { getActionableInsights } from '../services/crmActionable.js';

const router = Router();

function parsePaginationParams(req) {
  const { limit, offset } = req.query;
  return {
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  };
}

function parseBoolean(value) {
  if (value === undefined) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}

router.get('/contacts', async (req, res) => {
  try {
    const {
      companyId,
      search,
      sentiment,
      personKind,
      isClient,
      updatedAfter,
      updatedBefore,
    } = req.query;
    const page = parsePaginationParams(req);
    const result = await getContacts({
      companyId,
      search,
      sentiment,
      personKind,
      isClient: parseBoolean(isClient),
      updatedAfter,
      updatedBefore,
      ...page,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[crm/contacts] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/companies', async (req, res) => {
  try {
    const { search, industry } = req.query;
    const page = parsePaginationParams(req);
    const result = await getCompanies({ search, industry, ...page });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[crm/companies] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/interactions', async (req, res) => {
  try {
    const {
      contactId,
      companyId,
      channel,
      search,
      startDate,
      endDate,
      minBudget,
      maxBudget,
    } = req.query;
    const page = parsePaginationParams(req);
    const result = await getInteractions({
      contactId,
      companyId,
      channel,
      search,
      startDate,
      endDate,
      minBudget,
      maxBudget,
      ...page,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[crm/interactions] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/work-items', async (req, res) => {
  try {
    const {
      status,
      companyId,
      assigneeId,
      search,
      priority,
      dueBefore,
      dueAfter,
      onlyOverdue,
    } = req.query;
    const page = parsePaginationParams(req);
    const result = await getWorkItems({
      status,
      companyId,
      assigneeId,
      search,
      priority,
      dueBefore,
      dueAfter,
      onlyOverdue: parseBoolean(onlyOverdue),
      ...page,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[crm/work-items] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/fresh-data', async (req, res) => {
  try {
    const { companyId, topic, source, tag, search } = req.query;
    const page = parsePaginationParams(req);
    const result = await getFreshData({ companyId, topic, source, tag, search, ...page });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[crm/fresh-data] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/insights/summary', async (req, res) => {
  try {
    const { companyId, limit } = req.query;
    const data = await getInsightsSummary({ companyId, limit });
    return res.json({ ok: true, ...data });
  } catch (error) {
    console.error('[crm/insights/summary] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/timeline', async (req, res) => {
  try {
    const { companyId, contactId, limit } = req.query;
    const result = await getTimeline({ companyId, contactId, limit });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[crm/timeline] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/companies/:id/overview', async (req, res) => {
  try {
    const { id } = req.params;
    const { interactionsLimit, workItemsLimit } = req.query;
    const data = await getCompanyOverview(id, { interactionsLimit, workItemsLimit });
    return res.json({ ok: true, ...data });
  } catch (error) {
    console.error('[crm/companies/:id/overview] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/contacts/:id/overview', async (req, res) => {
  try {
    const { id } = req.params;
    const { interactionsLimit, workItemsLimit } = req.query;
    const data = await getContactOverview(id, { interactionsLimit, workItemsLimit });
    return res.json({ ok: true, ...data });
  } catch (error) {
    console.error('[crm/contacts/:id/overview] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/insights/trends', async (req, res) => {
  try {
    const { companyId, days } = req.query;
    const data = await getTrends({
      companyId,
      days: days ? Number(days) : undefined,
    });
    return res.json({ ok: true, ...data });
  } catch (error) {
    console.error('[crm/insights/trends] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

router.get('/insights/actionable', async (req, res) => {
  try {
    const { companyId } = req.query;
    const data = await getActionableInsights({ companyId });
    return res.json({ ok: true, ...data });
  } catch (error) {
    console.error('[crm/insights/actionable] error', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error interno' });
  }
});

export default router;

