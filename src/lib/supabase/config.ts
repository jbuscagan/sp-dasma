// Where the app finds Supabase.
// Normal use: NEXT_PUBLIC_SUPABASE_URL = https://xxxx.supabase.co (from Supabase › Project Settings › API).
// Local demo/preview only: NEXT_PUBLIC_SUPABASE_URL = "same-origin" → the browser uses the site's own address,
// and the server uses SUPABASE_INTERNAL_URL.
const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export function supabaseUrl(): string {
  if (PUBLIC_URL === 'same-origin') {
    return typeof window !== 'undefined' ? window.location.origin : process.env.SUPABASE_INTERNAL_URL ?? 'http://localhost:8080';
  }
  return PUBLIC_URL;
}

export const supabaseKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Fixed cookie name so the browser and the server always read the same login cookie. */
export const AUTH_COOKIE = { name: 'sb-sp-dasma-auth' };
