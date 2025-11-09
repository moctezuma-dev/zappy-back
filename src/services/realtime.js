import { adminSupabase } from './adminSupabase.js';
import { analyzeRecord } from './analyzer.js';

let initialized = false;
let channels = [];

function ensureAdmin() {
  if (!adminSupabase) throw new Error('Supabase service role no configurado');
  return adminSupabase;
}

function subscribeTable(supabase, table) {
  const ch = supabase
    .channel(`${table}-changes`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (payload) => {
      const row = payload?.new || payload?.record || payload?.data || payload;
      analyzeRecord(table, row).catch((err) => console.error(`[realtime/${table}] analyze error`, err));
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (payload) => {
      const row = payload?.new || payload?.record || payload?.data || payload;
      analyzeRecord(table, row).catch((err) => console.error(`[realtime/${table}] analyze error`, err));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[realtime] Suscrito a ${table}`);
      }
    });
  channels.push(ch);
}

export async function initializeRealtimeWatchers(reset = false) {
  const supabase = ensureAdmin();
  if (initialized && !reset) return;
  if (reset) {
    for (const ch of channels) {
      try { await supabase.removeChannel(ch); } catch {}
    }
    channels = [];
    initialized = false;
  }
  const tables = ['contacts', 'work_items', 'interactions', 'fresh_data'];
  tables.forEach((t) => subscribeTable(supabase, t));
  initialized = true;
}