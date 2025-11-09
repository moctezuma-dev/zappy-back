import healthRouter from './health.js';
import jobsRouter from './jobs.js';
import adminRouter from './admin.js';
import ingestRouter from './ingest.js';
import crmRouter from './crm.js';
import searchRouter from './search.js';
import chatRouter from './chat.js';
import notesRouter from './notes.js';
import alertsRouter from './alerts.js';
import aiRouter from './ai.js';
import knowledgeRouter from './knowledge.js';
import workItemsRouter from './workItems.js';

export default function registerRoutes(app) {
  app.use('/health', healthRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/ingest', ingestRouter);
  app.use('/api/crm', crmRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/work-items', workItemsRouter);
}