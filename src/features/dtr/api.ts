import { supabase } from '@/lib/supabase/client';
import { must } from '@/hooks/useLive';
import { DEFAULT_RULES, DEFAULT_SETTINGS, type AttendanceRow, type DtrSettings, type RuleText } from './engine';

export interface Employee {
  id: string;
  committee_id: string;
  name: string;
  position: string | null;
  dept: string | null;
  active: boolean;
  signature_path: string | null;
}

export interface AttendanceRecord extends AttendanceRow {
  id: string;
  committee_id: string;
}

export async function listEmployees(committeeId: string): Promise<Employee[]> {
  return must(await supabase().from('employees').select('*').eq('committee_id', committeeId).order('name'));
}

export async function saveEmployee(e: Partial<Employee> & { committee_id: string }) {
  const sb = supabase();
  const row = { name: e.name?.trim(), position: e.position ?? null, dept: e.dept ?? null, active: e.active ?? true, committee_id: e.committee_id, signature_path: e.signature_path ?? null };
  return must(e.id ? await sb.from('employees').update(row).eq('id', e.id).select().single() : await sb.from('employees').insert(row).select().single()) as Employee;
}

export async function deleteEmployee(id: string) {
  must(await supabase().from('employees').delete().eq('id', id));
}

export async function uploadSignature(file: File, emp: Employee): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${emp.committee_id}/${emp.id}.${ext}`;
  must(await supabase().storage.from('signatures').upload(path, file, { upsert: true, contentType: file.type || undefined }));
  must(await supabase().from('employees').update({ signature_path: path }).eq('id', emp.id));
  return path;
}

export async function removeSignature(emp: Employee) {
  if (emp.signature_path) await supabase().storage.from('signatures').remove([emp.signature_path]);
  must(await supabase().from('employees').update({ signature_path: null }).eq('id', emp.id));
}

/** Downloads a signature as a data URL so it can be drawn into the PDF. */
export async function signatureDataUrl(path: string): Promise<string | undefined> {
  const { data, error } = await supabase().storage.from('signatures').download(path);
  if (error || !data) return undefined;
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => resolve(undefined);
    r.readAsDataURL(data);
  });
}

export async function getConfig(committeeId: string): Promise<{ rules: RuleText[]; settings: DtrSettings }> {
  const row = must(await supabase().from('dtr_config').select('*').eq('committee_id', committeeId).maybeSingle()) as
    | { rules: RuleText[] | null; settings: Partial<DtrSettings> | null }
    | null;
  return {
    rules: row?.rules?.length === 7 ? row.rules : DEFAULT_RULES,
    settings: { ...DEFAULT_SETTINGS, ...(row?.settings ?? {}) },
  };
}

export async function saveConfig(committeeId: string, rules: RuleText[], settings: DtrSettings) {
  must(await supabase().from('dtr_config').upsert({ committee_id: committeeId, rules, settings, updated_at: new Date().toISOString() }));
}

export async function listAttendance(committeeId: string, start: string, end: string, employeeIds?: string[]): Promise<AttendanceRecord[]> {
  let q = supabase().from('attendance').select('*').eq('committee_id', committeeId).gte('work_date', start).lte('work_date', end);
  if (employeeIds?.length) q = q.in('employee_id', employeeIds);
  return must(await q.order('work_date'));
}

/** Same as the Apps Script: old rows for these people and dates are replaced. */
export async function replaceAttendance(committeeId: string, employeeIds: string[], start: string, end: string, rows: AttendanceRow[]) {
  const sb = supabase();
  must(await sb.from('attendance').delete().eq('committee_id', committeeId).in('employee_id', employeeIds).gte('work_date', start).lte('work_date', end));
  for (let i = 0; i < rows.length; i += 500) {
    must(await sb.from('attendance').insert(rows.slice(i, i + 500).map((r) => ({ ...r, committee_id: committeeId }))));
  }
}

export async function updateAttendance(id: string, patch: Partial<AttendanceRow>) {
  must(await supabase().from('attendance').update(patch).eq('id', id));
}

export async function deleteAttendance(id: string) {
  must(await supabase().from('attendance').delete().eq('id', id));
}

const urlToDataUrl = async (url: string) => {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
};

/** Blank form images (public/dtr) and the certifying official's e-signature. */
export async function loadDtrImages(settings: { signatoryPath: string; printBackground: boolean; layout: string }) {
  const sheet = settings.layout !== 'single' && settings.printBackground;
  const [formA, formB, official] = await Promise.all([
    sheet ? urlToDataUrl('/dtr/form-a.jpg') : Promise.resolve(undefined),
    sheet ? urlToDataUrl('/dtr/form-b.jpg') : Promise.resolve(undefined),
    settings.signatoryPath ? signatureDataUrl(settings.signatoryPath) : Promise.resolve(undefined),
  ]);
  return { formA, formB, official };
}

/** E-signature of the official who certifies the DTRs (e.g. the SPM), stored in the office folder. */
export async function uploadOfficialSignature(file: File, committeeId: string): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${committeeId}/official-signature.${ext}`;
  must(await supabase().storage.from('signatures').upload(path, file, { upsert: true, contentType: file.type || undefined }));
  return path;
}
