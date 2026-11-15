import { NextResponse, type NextRequest } from 'next/server';

// This file runs before every page. It ONLY checks that the Supabase keys are set in Vercel and,
// if not, shows a clear "setup needed" page instead of a crash.
// The login check itself happens in src/app/(app)/layout.tsx (signed-out visitors are sent to /login),
// so this file does not load the Supabase library (which does not run on Vercel's Edge runtime).

function setupProblem(detail: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup needed</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.6;color:#13241b">
<h1 style="color:#0e4f33">The website is not connected to the database yet</h1>
<p>${detail}</p>
<ol>
<li>Open <b>vercel.com</b> → your project → <b>Settings</b> → <b>Environment Variables</b>.</li>
<li>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> = your Supabase Project URL (looks like <code>https://abcd.supabase.co</code>).</li>
<li>Add <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> = your Supabase <b>anon public</b> key.</li>
<li>Go to <b>Deployments</b> → the newest one → <b>⋯</b> → <b>Redeploy</b>.</li>
</ol></body></html>`;
  return new NextResponse(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export function middleware(_request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return setupProblem('The two Supabase keys are missing in Vercel.');

  let validUrl = url === 'same-origin'; // local demo mode (see src/lib/supabase/config.ts)
  if (!validUrl) try {
    const u = new URL(url);
    validUrl = /^https?:$/.test(u.protocol) && (u.pathname === '/' || u.pathname === '');
  } catch {
    validUrl = false;
  }
  if (!validUrl) {
    return setupProblem('<code>NEXT_PUBLIC_SUPABASE_URL</code> looks wrong. It must look like <code>https://abcd.supabase.co</code> (nothing after .co).');
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg|icon.svg|fonts/|dtr/|.*\\.(?:png|jpg|svg|ico|ttf)$).*)'],
};
