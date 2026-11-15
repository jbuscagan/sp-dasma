'use client';
// City logo: the image the administrator uploaded in Admin › Offices & permissions (storage bucket "branding").
// Until one is uploaded, the placeholder public/logo.svg is shown.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export const LOGO_PATH = 'city-logo';
const FALLBACK = '/logo.svg';

export function logoUrl(version = '') {
  try {
    const url = supabase().storage.from('branding').getPublicUrl(LOGO_PATH).data.publicUrl;
    return version ? `${url}?v=${version}` : url;
  } catch {
    return FALLBACK;
  }
}

export function Logo({ size = 36 }: { size?: number }) {
  const [src, setSrc] = useState(FALLBACK);
  useEffect(() => {
    let v = '';
    try {
      v = localStorage.getItem('logo-version') ?? '';
    } catch {}
    const url = logoUrl(v);
    // Load in the background first, so a missing logo never shows a broken image.
    const img = new Image();
    img.onload = () => setSrc(url);
    img.src = url;
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt="City of Dasmariñas" className="shrink-0 object-contain" style={{ width: size, height: size }} />
  );
}
