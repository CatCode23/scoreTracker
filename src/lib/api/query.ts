import type { PostgrestError } from '@supabase/supabase-js';

/** Unwrap a Supabase response, throwing on error so React Query shows the error state. */
export async function rows<T>(
  p: PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function one<T>(
  p: PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<T | null> {
  const { data, error } = await p;
  if (error) throw error;
  return (data ?? null) as T | null;
}

export async function exec(p: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
  const { error } = await p;
  if (error) throw error;
}
