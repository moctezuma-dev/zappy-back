Title: Tech Overview – Relay (≤60s)

Structure (narration + suggested visuals):
0–5s: [Title + simple diagram] "Architecture: Express + Supabase + Gemini"
      - Routes (`/health`, `/api/ingest`, `/api/jobs`, `/api/crm`, `/api/search`, `/api/chat`, `/api/alerts`, `/api/ai`, `/api/knowledge`, `/api/work-items`)

5–15s: [Box "Ingestion" → "interactions"]
      - Email/Slack/WhatsApp/Audio/Video → normalization (Zod) → `interactions` table
      - Optional mock with `generate: true` and `*.json` dataset

15–25s: [Box "Watchers (Realtime + Storage)"]
      - Realtime: detects INSERT/UPDATE in `interactions/work_items/...` and triggers `analyzer`
      - Storage watcher: detects new `videos/audios`, downloads and processes

25–35s: [Box "Analyzer (Gemini)"]
      - Extracts summary, sentiment, requirements, KPIs, budget, next steps
      - Generates `work_items`, creates alerts, and updates contact/company

35–45s: [Box "Indexing and Search"]
      - `contextIndexer` generates embeddings → `ai_contexts`
      - `/api/search/query` and `/api/chat` (RAG with citations and tools)

45–55s: ["What worked / What didn't"]
      - Worked: end-to-end flow with AI-free fallback, stable watchers, realistic mocks
      - Challenges: Gemini quotas/latency, audio/video cleanup, RLS and service-role

55–60s: [Tools]
      - Node.js/Express, Supabase (PostgreSQL/Realtime/Storage), Google Gemini, FFmpeg, Zod, Swagger

Recording tips:
- Show `npm run verify` and `/health` for status.
- Include 1 ingestion example and one semantic search.
- Add arrows in the diagram for the flow (Ingestion → Analyzer → Indexing → Chat).
