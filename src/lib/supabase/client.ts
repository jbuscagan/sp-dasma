'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTH_COOKIE, supabaseKey, supabaseUrl } from './config';
import { announcingFetch } from '@/lib/liveBus';

let client: SupabaseClient | null = null;

/** One shared browser client (keeps a single realtime connection per tab). */
export function supabase(): SupabaseClient {
  if (!client) {
    // Saves made in this tab refresh every list showing that table at once (see lib/liveBus.ts).
    client = createBrowserClient(supabaseUrl(), supabaseKey(), { cookieOptions: AUTH_COOKIE, global: { fetch: announcingFetch() } });
  }
  return client;
}
