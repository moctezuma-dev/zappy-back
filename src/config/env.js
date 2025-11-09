import dotenv from 'dotenv';
dotenv.config();

export const env = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY || '',
  PORT: process.env.PORT || 4000,
};

export function hasSupabase() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

export function hasGemini() {
  return Boolean(env.GOOGLE_GEMINI_API_KEY);
}

export function hasSupabaseServiceRole() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}