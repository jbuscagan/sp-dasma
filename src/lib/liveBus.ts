// "Something changed" signal inside this browser tab.
// Every save / delete / tick made from this tab announces which table changed, and every list
// that shows that table reloads at once — without waiting for Supabase's live feed and without
// refreshing the page. (Changes made by OTHER people still arrive through the live feed.)
type Listener = (tables: Set<string>) => void;
const listeners = new Set<Listener>();

/** Views and functions → the tables whose lists must reload. '*' = reload everything. */
const ALIASES: Record<string, string[]> = { entry_list: ['entries'] };

export function announceChange(names: string[]) {
  const tables = new Set<string>();
  names.forEach((n) => (ALIASES[n] ?? [n]).forEach((t) => tables.add(t)));
  listeners.forEach((l) => l(tables));
}

export function onChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Wraps fetch for the Supabase client: after a successful insert / update / delete
 * (or a database action such as Transmit or Publish) it announces the change.
 */
export function announcingFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const res = await base(input, init);
    try {
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (res.ok && method !== 'GET' && method !== 'HEAD') {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const m = url.match(/\/rest\/v1\/(rpc\/)?([A-Za-z0-9_]+)/);
        if (m) announceChange(m[1] ? ['*'] : [m[2]]);
        else if (/\/storage\/v1\//.test(url)) announceChange(['*storage']);
      }
    } catch {
      /* never let the signal break a save */
    }
    return res;
  };
}
