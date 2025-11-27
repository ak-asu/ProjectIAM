import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
export * from '../types';

let supabase: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });
  }
  return supabase;
}

export async function checkDbConnection() {
  try {
    const db = getSupabaseClient();
    const { error } = await db
      .from('sessions')
      .select('id')
      .limit(1);
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (acceptable for health check)
      console.error('Database connection failed:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
