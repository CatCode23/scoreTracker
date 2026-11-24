import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isConfigured } from './env';

// The anon key is designed to be shipped to browsers. Every sensitive read/write is
// enforced by Postgres Row Level Security. NEVER use the service-role key here.
export const supabase: SupabaseClient = createClient(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'public-anon-key-not-configured',
  {
    auth: {
      // PKCE returns "?code=" in the query string, which coexists with HashRouter
      // (the implicit flow would put tokens in the #hash and collide with routes).
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

export { isConfigured };

/** Turn a Supabase/Postgres error into plain language for field users. */
export function friendlyError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  const msg = e?.message ?? String(err ?? 'Unknown error');
  if (e?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'You are not authorized to do that. Check your assignment with the operations cell.';
  }
  if (e?.code === '23505' || /duplicate key/i.test(msg)) {
    return 'That record already exists (duplicate).';
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return 'Network unavailable. Use the paper scorecard and report to the sport manager or operations cell.';
  }
  return msg.replace(/^SLOT_OCCUPIED:\s*/, '');
}
