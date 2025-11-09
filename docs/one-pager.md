# Relay – Zero-Click CRM (1-Page Report)

## 1) Challenge you have tackled

Business-critical information lives scattered across emails, Slack/WhatsApp messages, and audio/video meetings. Manual data entry is slow, error-prone, and reactive—making it difficult to prioritize risks, next steps, and opportunities in real time. Teams struggle to maintain a unified view of customer interactions, leading to missed deadlines, overlooked alerts, and fragmented context across channels.

Our challenge: build a Zero-Click CRM backend that automatically ingests multi-channel interactions, normalizes them into a unified schema, and uses AI to extract actionable insights (sentiment, requirements, KPIs, budget, next steps) without manual intervention. The system must enable semantic search, provide contextual chat with source citations, and generate work items and alerts automatically.

## 2) Tools / ML models you have used

**Backend & Infrastructure:**
- Node.js + Express (API server)
- Supabase (PostgreSQL for data, Realtime for watchers, Storage for media)
- Zod (schema validation)
- FFmpeg (audio/video extraction)

**AI/ML Models:**
- Google Gemini 2.0 Flash (`gemini-2.0-flash-001`) with multimodal capabilities (text, audio, video frames)
- Google Gemini Embeddings (`text-embedding-004`) for semantic search (1536 dimensions)
- Google Search Retrieval (enabled via `google_search_retrieval` capability for real-time web context)

**Development Tools:**
- Swagger UI (API documentation)
- Python (mock data generation, no external dependencies)

## 3) What has worked well with these tools?

**Gemini Multimodal Analysis:** Gemini excelled at extracting structured data from unstructured text, audio transcripts, and video frames. It consistently identified sentiment, requirements, KPIs, budget ranges, and next steps with high accuracy. The multimodal capability allowed us to process video meetings by combining audio transcription with visual context (frames), providing richer insights than audio-only analysis.

**Supabase Realtime Watchers:** The realtime subscriptions enabled automatic analysis triggers without polling. When a new interaction is inserted, watchers immediately detect it and trigger the analyzer, creating a seamless zero-click flow. Storage watchers similarly detect new audio/video files and process them automatically.

**Embeddings for Semantic Search:** Using Gemini's `text-embedding-004` for vector embeddings enabled powerful semantic search across interactions, work items, and knowledge base entries. The PostgreSQL `match_ai_contexts` function with cosine similarity provided fast, accurate results for RAG-based chat responses.

**Heuristic Fallback:** When Gemini API is unavailable or rate-limited, the system gracefully falls back to rule-based analysis, ensuring the core functionality remains operational. This resilience was crucial during development and testing.

**Mock Dataset Generation:** The Python script (`correos_mock.py`) generates realistic mock data using real company names (Coca-Cola, PepsiCo, Amazon, Microsoft, Tesla, etc.), making demos and testing more credible without requiring production data.

## 4) What was challenging?

**AI Quotas and Latency:** Gemini API has rate limits and quotas that can throttle processing, especially for long videos. We had to implement retry logic, batch processing, and the heuristic fallback to handle these constraints. Video processing (extracting audio + sampling frames) also adds significant latency.

**Normalization Across Heterogeneous Channels:** Each channel (email, Slack, WhatsApp, audio, video) has different data structures and metadata. Creating a unified normalization layer that handles missing fields, inconsistent formats, and channel-specific quirks required careful schema design and validation (Zod schemas).

**RLS Policies and Service-Role Management:** Supabase Row Level Security (RLS) required careful configuration to allow service-role operations (like watchers and admin endpoints) while maintaining security. Balancing administrative access with user-level permissions was complex.

**Real-time Processing at Scale:** The watchers system needed to handle concurrent inserts without overwhelming the analyzer. We implemented queuing and rate limiting, but scaling this further would require a proper job queue (e.g., Bull/BullMQ) instead of synchronous processing.

**Audio/Video Processing:** FFmpeg integration for extracting audio and sampling video frames worked, but handling various codecs, file sizes, and error cases (corrupted files, unsupported formats) required robust error handling and validation.

## 5) How have you spent your time?

**Week 1 (Architecture & Foundation):** Designed the database schema (companies, contacts, interactions, work_items, ai_contexts), set up Express routes structure, implemented health checks, and configured Supabase connection.

**Week 2 (Ingestion Layer):** Built ingestion endpoints for email/Slack/WhatsApp with Zod validation, created mock data generator (`correos_mock.py`), implemented normalization logic, and added seed scripts for Supabase.

**Week 3 (AI Integration):** Integrated Gemini for analysis (sentiment, requirements, KPIs, budget, next steps), implemented embedding generation and semantic search, built the `ai_contexts` indexing system, and created the `/api/search/query` endpoint.

**Week 4 (Real-time Processing):** Implemented Supabase Realtime watchers for automatic analysis triggers, built Storage watcher for audio/video files, created `/api/jobs/audio` and `/api/jobs/video` endpoints with FFmpeg integration, and added heuristic fallback for AI-free operation.

**Week 5 (Chat & Actions):** Built `/api/chat` with RAG capabilities, implemented tool system (alerts, timeline, trends, knowledge), added work item creation from chat actions, built alerts system (automatic generation and resolution), and created CRM overview endpoints.

**Week 6 (Documentation & Hardening):** Wrote comprehensive API documentation (`docs-api.md`, `api-inventory.md`), created verification scripts (`npm run verify`), added OpenAPI spec, wrote video scripts, created one-pager, and tested end-to-end flows.

**Total Time Distribution:**
- Backend/API development: ~35%
- AI/ML integration (Gemini, embeddings): ~25%
- Real-time watchers and processing: ~15%
- Database schema and Supabase setup: ~10%
- Documentation and testing: ~15%
