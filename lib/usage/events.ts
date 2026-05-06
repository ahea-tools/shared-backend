import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function logGenerationEvent(event: Record<string, unknown>) {
  await getSupabaseAdmin().from('generation_events').insert(event);
}
