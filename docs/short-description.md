Relay is a Zero-Click CRM backend that eliminates the friction of capturing and understanding business interactions. The problem: critical information lives scattered across emails, chats (Slack/WhatsApp), and meetings (audio/video), forcing manual data entry and making it difficult to prioritize risks, next steps, and opportunities.

Our solution automatically ingests multiple channels, normalizes data into a CRM schema, and runs analysis with Google Gemini to extract summaries, sentiment, requirements, KPIs, budget, and next steps. Everything is indexed with embeddings to enable semantic search and a corporate chat with source citations. Based on the analysis, the system generates work items and real-time alerts, and maintains a 360° timeline per company/contact.

What works today:
- Email/Slack/WhatsApp/Audio/Video ingestion with realistic mock generation.
- Automatic analysis (Gemini) and AI-free flow (heuristic) as fallback.
- Indexing and semantic search; chat with actions (create tasks, resolve alerts).
- Real-time watchers (Supabase Realtime + Storage) that trigger analysis and reindexing.
- CRM read API (contacts, companies, interactions, work items, fresh data).

Who did what (roles):
- Backend/API and architecture: route design, services, and validations (Zod).
- AI integration (Gemini) and embeddings: multimodal analysis and RAG.
- Data and seeders: updated mocks from `*.json` files and Python script.
- Infrastructure with Supabase (PostgreSQL, Storage, Realtime) and comprehensive verification.
- Documentation and DX: API inventory, end-to-end flow, and cURL examples.

Technologies: Node.js + Express, Supabase (PostgreSQL/Storage/Realtime), Google Gemini (multimodal + embeddings), FFmpeg, Zod, Swagger UI, `@supabase/supabase-js`, `@google/generative-ai`. The result is a backend ready to demonstrate "zero-click capture" and actionable prioritization in seconds.
