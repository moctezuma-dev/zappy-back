import app from './app.js';
import { env, hasSupabaseServiceRole } from './config/env.js';
import { initializeRealtimeWatchers } from './services/realtime.js';
import { startStorageWatcher } from './services/storageWatcher.js';

const port = Number(env.PORT) || 4000;

app.listen(port, async () => {
  console.log(`[server] Zero-Click CRM backend escuchando en http://localhost:${port}`);
  
  if (hasSupabaseServiceRole()) {
    // Inicializar watchers de tiempo real
    initializeRealtimeWatchers().catch((err) => console.error('[server] realtime init error', err));
    
    // Inicializar watcher de Storage (opcional, configurable por env)
    const storageBucket = env.SUPABASE_STORAGE_BUCKET || 'videos';
    const storageFolder = env.SUPABASE_STORAGE_FOLDER || '';
    const storageWatchInterval = Number(env.SUPABASE_STORAGE_WATCH_INTERVAL) || 30000; // 30s por defecto
    
    if (env.SUPABASE_STORAGE_WATCH_ENABLED !== 'false') {
      startStorageWatcher(storageBucket, storageFolder, storageWatchInterval).catch((err) => {
        console.error('[server] storage watcher init error', err);
      });
    } else {
      console.log('[server] Storage watcher desactivado (SUPABASE_STORAGE_WATCH_ENABLED=false)');
    }
  } else {
    console.log('[server] SUPABASE_SERVICE_ROLE_KEY no configurado; watchers desactivados');
  }
});