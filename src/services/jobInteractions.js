import { insertInteraction } from './ingestService.js';

export async function createInteractionFromJob({
  analysis,
  channel = 'call',
  source = 'jobs',
  jobId,
}) {
  if (!analysis) throw new Error('analysis requerido');

  const contactInfo = {
    name: analysis.contact?.name || null,
    email: analysis.contact?.email || null,
    company: analysis.contact?.company || null,
  };

  const nextSteps = analysis.next_steps || [];
  const firstDeadline = nextSteps
    .map((step) => step.due_date)
    .filter(Boolean)
    .sort()[0];

  const notesSections = [
    analysis.summary ? `Resumen: ${analysis.summary}` : null,
    analysis.transcript ? `Transcripción:\n${analysis.transcript}` : null,
  ].filter(Boolean);
  const notes = notesSections.join('\n\n') || 'Sin notas';

  const normalized = {
    channel,
    occurred_at: new Date().toISOString(),
    notes,
    participants: [analysis.contact?.name, analysis.contact?.company].filter(Boolean),
    budget: analysis.deal?.value || null,
    currency: analysis.deal?.currency || (analysis.deal?.value ? 'USD' : null),
    requirements: analysis.requirements || [],
    kpis: analysis.kpis || [],
    data: {
      source,
      jobId,
      sentiment: analysis.sentiment,
      topics: analysis.topics,
      next_steps: nextSteps,
      deal: analysis.deal,
      opportunities: analysis.opportunities,
      risks: analysis.risks,
    },
    deadline: firstDeadline ? new Date(firstDeadline).toISOString() : null,
  };

  return insertInteraction(normalized, contactInfo);
}

