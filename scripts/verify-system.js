#!/usr/bin/env node

/**
 * Script de verificación del sistema completo
 * 
 * Verifica que todos los componentes estén funcionando correctamente:
 * - Configuración de variables de entorno
 * - Conexión a Supabase
 * - Watchers de realtime
 * - Storage watcher
 * - Generación de datos
 * - Análisis automático
 * 
 * Uso: node scripts/verify-system.js
 */

import { env, hasSupabase, hasGemini, hasSupabaseServiceRole } from '../src/config/env.js';
import { adminSupabase } from '../src/services/adminSupabase.js';
import { supabase } from '../src/services/supabase.js';
import { initializeRealtimeWatchers } from '../src/services/realtime.js';
import { startStorageWatcher, stopStorageWatcher } from '../src/services/storageWatcher.js';
import { triggerManualAnalysis } from '../src/services/analyzer.js';
import { agregarUsuarios, seedCompleto } from '../src/services/seeder.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const results = {
  passed: [],
  failed: [],
  warnings: [],
};

function log(message, type = 'info') {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
  }[type] || 'ℹ️';
  console.log(`${prefix} ${message}`);
}

async function check(name, testFn) {
  try {
    const result = await testFn();
    if (result === true || (result && result.ok !== false)) {
      results.passed.push(name);
      const message = result?.warning ? `${name} (${result.warning})` : name;
      log(message, 'success');
      return true;
    } else {
      results.failed.push(name);
      log(`${name} - ${result?.error || 'Falló'}`, 'error');
      return false;
    }
  } catch (error) {
    results.failed.push(name);
    log(`${name} - ${error.message}`, 'error');
    return false;
  }
}

async function checkWarning(name, testFn) {
  try {
    const result = await testFn();
    if (result === false) {
      results.warnings.push(name);
      log(`${name} - No configurado (opcional)`, 'warning');
      return false;
    }
    return true;
  } catch (error) {
    results.warnings.push(name);
    log(`${name} - ${error.message}`, 'warning');
    return false;
  }
}

// Verificaciones
async function verifyEnvironment() {
  log('\n📋 Verificando configuración de entorno...\n');
  
  await check('SUPABASE_URL configurado', () => Boolean(env.SUPABASE_URL));
  await check('SUPABASE_ANON_KEY configurado', () => Boolean(env.SUPABASE_ANON_KEY));
  await check('SUPABASE_SERVICE_ROLE_KEY configurado', () => Boolean(env.SUPABASE_SERVICE_ROLE_KEY));
  await checkWarning('GOOGLE_GEMINI_API_KEY configurado', () => hasGemini());
}

async function verifySupabaseConnection() {
  log('\n🔌 Verificando conexión a Supabase...\n');
  
  await check('Conexión a Supabase (anon)', async () => {
    if (!hasSupabase()) return { ok: false, error: 'Supabase no configurado' };
    const { data, error } = await supabase.from('companies').select('count').limit(1);
    return !error;
  });
  
  await check('Conexión a Supabase (service role)', async () => {
    if (!hasSupabaseServiceRole()) return { ok: false, error: 'Service role no configurado' };
    const { data, error } = await adminSupabase.from('companies').select('count').limit(1);
    return !error;
  });
}

async function verifyDatabaseTables() {
  log('\n🗄️  Verificando tablas de base de datos...\n');
  
  const tables = [
    'companies',
    'contacts',
    'interactions',
    'work_items',
    'fresh_data',
    'alerts',
    'ai_contexts',
    'knowledge_entries',
    'jobs',
  ];
  
  for (const table of tables) {
    await check(`Tabla ${table} existe`, async () => {
      const { error } = await adminSupabase.from(table).select('count').limit(1);
      return !error;
    });
  }
}

async function verifyStorageBuckets() {
  log('\n📦 Verificando buckets de Storage...\n');
  
  await check('Bucket "videos" existe', async () => {
    const { data, error } = await adminSupabase.storage.from('videos').list('', { limit: 1 });
    return !error;
  });
  
  await check('Bucket "audios" existe', async () => {
    const { data, error } = await adminSupabase.storage.from('audios').list('', { limit: 1 });
    return !error;
  });
}

async function verifyRealtimeWatchers() {
  log('\n👁️  Verificando watchers de realtime...\n');
  
  await check('Watchers de realtime se inicializan', async () => {
    try {
      await initializeRealtimeWatchers(true);
      return true;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

async function verifyStorageWatcher() {
  log('\n📁 Verificando storage watcher...\n');
  
  await check('Storage watcher se puede iniciar', async () => {
    try {
      await startStorageWatcher('videos', '', 60000); // 1 minuto para pruebas
      await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2 segundos
      stopStorageWatcher();
      return true;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

async function verifyMockDataFiles() {
  log('\n📄 Verificando archivos de datos mock...\n');
  
  const files = [
    'empresas_mock.json',
    'contactos_mock.json',
    'conversaciones_mock.json',
    'metadatos_mock.json',
  ];
  
  for (const file of files) {
    await checkWarning(`Archivo ${file} existe`, async () => {
      const filePath = path.join(rootDir, file);
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    });
  }
}

async function verifyDataGeneration() {
  log('\n🌱 Verificando generación de datos...\n');
  
  await check('Seeder puede generar usuarios', async () => {
    try {
      // Solo verificar que la función existe y puede ejecutarse
      // No ejecutar realmente para evitar duplicados en la base de datos
      const result = await agregarUsuarios({ generate: false });
      return result && result.count !== undefined;
    } catch (error) {
      // Si falla por duplicados, es normal si ya hay datos
      if (error.message.includes('ON CONFLICT') || error.message.includes('duplicate')) {
        return { ok: true, warning: 'Ya existen datos en la base de datos' };
      }
      return { ok: false, error: error.message };
    }
  });
}

async function verifyAnalysis() {
  log('\n🔍 Verificando análisis automático...\n');
  
  await check('Análisis manual funciona', async () => {
    try {
      // Verificar que hay al menos una interacción para analizar
      const { data: interactions } = await adminSupabase
        .from('interactions')
        .select('id')
        .limit(1);
      
      if (!interactions || interactions.length === 0) {
        return { ok: true, warning: 'No hay interacciones para analizar (normal si la base está vacía)' };
      }
      
      const result = await triggerManualAnalysis({ type: 'interactions', limit: 1 });
      return result && result.analyzed !== undefined;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

async function verifyGeminiIntegration() {
  log('\n🤖 Verificando integración con Gemini...\n');
  
  await checkWarning('Gemini API Key configurado', () => hasGemini());
  
  if (hasGemini()) {
    await checkWarning('Gemini puede generar embeddings', async () => {
      try {
        const { embedText } = await import('../src/services/gemini.js');
        const embedding = await embedText({ text: 'test', taskType: 'RETRIEVAL_QUERY' });
        return embedding && embedding.length > 0;
      } catch (error) {
        // Si la API key no es válida, es una advertencia, no un error crítico
        if (error.message.includes('API key') || error.message.includes('API_KEY')) {
          return false; // Retornar false para que sea una advertencia
        }
        throw error;
      }
    });
  }
}

async function main() {
  console.log('🔧 Verificación del Sistema Relay CRM\n');
  console.log('='.repeat(50));
  
  await verifyEnvironment();
  await verifySupabaseConnection();
  await verifyDatabaseTables();
  await verifyStorageBuckets();
  await verifyRealtimeWatchers();
  await verifyStorageWatcher();
  await verifyMockDataFiles();
  await verifyDataGeneration();
  await verifyAnalysis();
  await verifyGeminiIntegration();
  
  // Resumen
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Resumen de Verificación\n');
  console.log(`✅ Pasados: ${results.passed.length}`);
  console.log(`❌ Fallidos: ${results.failed.length}`);
  console.log(`⚠️  Advertencias: ${results.warnings.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Verificaciones fallidas:');
    results.failed.forEach(name => console.log(`   - ${name}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  Advertencias (opcionales):');
    results.warnings.forEach(name => console.log(`   - ${name}`));
  }
  
  const total = results.passed.length + results.failed.length;
  const successRate = total > 0 ? (results.passed.length / total) * 100 : 0;
  
  console.log(`\n📈 Tasa de éxito: ${successRate.toFixed(1)}%`);
  
  if (results.failed.length === 0) {
    console.log('\n🎉 ¡Sistema verificado exitosamente!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Hay problemas que deben resolverse antes de usar el sistema.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Error fatal en verificación:', error);
  process.exit(1);
});

