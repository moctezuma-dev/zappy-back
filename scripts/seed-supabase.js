// Ejecuta: node scripts/seed-supabase.js --agregar-usuarios [--generate]
// Opcional: node scripts/seed-supabase.js --agregar-usuarios --generate
// O: node scripts/seed-supabase.js --seed-completo [--generate]
// Usa SUPABASE_SERVICE_ROLE_KEY para evitar bloqueos por RLS.

import dotenv from 'dotenv';
import { agregarUsuarios, seedCompleto } from '../src/services/seeder.js';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--agregar-usuarios')) {
    const generate = args.includes('--generate');
    await agregarUsuarios({ generate });
    return;
  }
  if (args.includes('--seed-completo')) {
    const generate = args.includes('--generate');
    await seedCompleto({ generate });
    return;
  }

  console.log('Uso:');
  console.log('  node scripts/seed-supabase.js --agregar-usuarios [--generate]');
  console.log('  node scripts/seed-supabase.js --seed-completo [--generate]');
  console.log('Variables necesarias en .env: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
}

main().catch((err) => {
  console.error('[seed] Error:', err?.message || err);
  process.exit(1);
});