'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTH_COOKIE, supabaseKey, supabaseUrl } from './config';

let client: SupabaseClient | null = null;

/** One shared browser client (keeps a single realtime connection per tab). */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(supabaseUrl(), supabaseKey(), { cookieOptions: AUTH_COOKIE });
  }
  return client;
}
