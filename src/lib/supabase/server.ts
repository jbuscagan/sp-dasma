import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, supabaseKey, supabaseUrl } from './config';

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseKey(), {
      cookieOptions: AUTH_COOKIE,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: the middleware refreshes the session instead.
          }
        },
      },
    });
}
