// Scanned letters attached to requests (private storage bucket "attachments").
import { supabase } from '@/lib/supabase/client';
import { must } from '@/hooks/useLive';

export async function uploadAttachment(file: Blob, committeeId: string, ext = 'jpg'): Promise<string> {
  const path = `${committeeId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  must(await supabase().storage.from('attachments').upload(path, file, { contentType: file.type || undefined }));
  return path;
}

/** Temporary (10-minute) link to view a file. */
export async function attachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase().storage.from('attachments').createSignedUrl(path, 600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
