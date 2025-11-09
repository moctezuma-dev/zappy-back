Title: Demo – Relay Zero-Click CRM (≤60s)

Structure (suggested captions/narration + visuals):
0–3s: [Title screen] "Relay – Zero-Click CRM"
3–8s: [Terminal] `npm run dev` + `curl http://localhost:4000/health/`
      Narration: "The backend is active and configured with Supabase and Gemini."
8–18s: [Terminal] Email ingestion (mock):
      `curl -X POST http://localhost:4000/api/ingest/email`
      JSON response with `ok: true`, `interactionId`.
      Narration: "We ingest an email; it normalizes and creates an interaction."
18–30s: [Terminal] View recent interactions:
      `curl "http://localhost:4000/api/crm/interactions?limit=3"`
      Show fields: `channel`, `budget`, `requirements`, `kpis`.
      Narration: "The analyzer extracts budget, requirements, KPIs, and next steps."
30–40s: [Terminal] Semantic search:
      `curl -X POST http://localhost:4000/api/search/query -H "Content-Type: application/json" -d '{"query":"automation project status","limit":3}'`
      Narration: "We index embeddings for semantic search and contextualized responses."
40–50s: [Terminal] Chat with tools:
      `curl -X POST http://localhost:4000/api/chat/ -H "Content-Type: application/json" -d '{"question":"What should I prepare for Microsoft?","companyId":"company-microsoft","tools":["timeline","alerts"]}'`
      Show `answer` + `citations`.
      Narration: "The chat combines timeline, alerts, and knowledge with source citations."
50–58s: [Terminal] Open alerts:
      `curl "http://localhost:4000/api/alerts?status=open&severity=high"`
      Narration: "Alerts and work items are generated automatically."
58–60s: [Closing screen] "Zero-Click capture → Prioritize actions in seconds."

Recording notes:
- Use 125–150% zoom in terminal for readability.
- Add brief captions aligned to each command.
- Optional: Postman with the same calls for a more friendly visual.
