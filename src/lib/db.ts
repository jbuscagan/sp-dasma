// Names of the database tables / views the app talks to — one place to change them.
//
// Requests are read and written through the view "entry_list" (see supabase/migrations/0009_normalize.sql):
// the table "entries" stores only ids for organization, barangay and receiving office, and the view
// shows their names. Saving a name through the view links it to the right record automatically.
export const T = {
  entries: 'entry_list',
  entryOrder: 'entry_order',
  transmittals: 'transmittals',
  submissions: 'submissions',
  flags: 'entry_flags',
  publications: 'publications',
  publicationEntries: 'publication_entries',
  barangays: 'barangays',
  organizations: 'organizations',
  committees: 'committees',
  profiles: 'profiles',
} as const;

/** Realtime listens to the real table (views do not send change events). */
export const LIVE = { entries: 'entries' } as const;
