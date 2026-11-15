// Database calls for the Budget module (SP contribution, solicitation monitoring, barangay budgets).
import { supabase } from '@/lib/supabase/client';
import { must } from '@/hooks/useLive';

export interface ContributionReport {
  id: string;
  report_date: string;
  title: string;
  beginning_balance: number;
  notes: string | null;
  created_at?: string;
}
export interface ContributionLine {
  id?: string;
  report_id?: string;
  kind: 'addition' | 'disbursement';
  grp: string | null;
  label: string;
  amount: number;
  sort: number;
}
export interface MonitoringBatch {
  id: string;
  category: string;
  title: string | null;
  week_no: number | null;
  covering: string | null;
  released_on: string;
  created_at?: string;
}
export interface MonitoringItem {
  id?: string;
  batch_id?: string;
  entry_id: string | null;
  requestor: string | null;
  association: string | null;
  event_date: string | null;
  contact_number: string | null;
  amount: number | null;
  given_by: string | null;
  date_claimed: string | null;
  remarks: string | null;
  attachment_paths: string[];
  sort: number;
}
export interface BarangayBudget {
  id?: string;
  year: number;
  barangay: string;
  brgy_budget: number | null;
  sk_budget: number | null;
  remarks: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ---------- SP contribution ----------
export async function listContributions(): Promise<ContributionReport[]> {
  const rows = must(await supabase().from('sp_contribution_reports').select('*').order('report_date', { ascending: false })) as ContributionReport[];
  return rows.map((r) => ({ ...r, beginning_balance: Number(r.beginning_balance) }));
}

export async function listContributionLines(reportIds?: string[]): Promise<ContributionLine[]> {
  let q = supabase().from('sp_contribution_lines').select('*');
  if (reportIds) q = q.in('report_id', reportIds);
  const rows = must(await q.order('sort')) as ContributionLine[];
  return rows.map((l) => ({ ...l, amount: Number(l.amount) }));
}

export async function saveContribution(report: Partial<ContributionReport>, lines: ContributionLine[]): Promise<string> {
  const sb = supabase();
  const row = { report_date: report.report_date, title: report.title || 'SP CONTRIBUTION REPORT', beginning_balance: report.beginning_balance ?? 0, notes: report.notes || null, updated_at: new Date().toISOString() };
  const saved = must(report.id ? await sb.from('sp_contribution_reports').update(row).eq('id', report.id).select().single() : await sb.from('sp_contribution_reports').insert(row).select().single()) as ContributionReport;
  must(await sb.from('sp_contribution_lines').delete().eq('report_id', saved.id));
  const clean = lines.filter((l) => l.label.trim()).map((l, i) => ({ report_id: saved.id, kind: l.kind, grp: l.grp?.trim() || null, label: l.label.trim(), amount: l.amount || 0, sort: i }));
  if (clean.length) must(await sb.from('sp_contribution_lines').insert(clean));
  return saved.id;
}

export async function deleteContribution(id: string) {
  must(await supabase().from('sp_contribution_reports').delete().eq('id', id));
}

// ---------- monitoring ----------
export async function listBatches(): Promise<MonitoringBatch[]> {
  return must(await supabase().from('monitoring_batches').select('*').order('released_on', { ascending: false }).order('created_at', { ascending: false }));
}

export async function listItems(batchIds?: string[]): Promise<MonitoringItem[]> {
  let q = supabase().from('monitoring_items').select('*');
  if (batchIds) {
    if (!batchIds.length) return [];
    q = q.in('batch_id', batchIds);
  }
  const rows = must(await q.order('sort')) as MonitoringItem[];
  return rows.map((r) => ({ ...r, amount: num(r.amount) }));
}

export async function saveBatch(b: Partial<MonitoringBatch>): Promise<MonitoringBatch> {
  const sb = supabase();
  const row = { category: b.category, title: b.title || null, week_no: b.week_no ?? null, covering: b.covering || null, released_on: b.released_on };
  return must(b.id ? await sb.from('monitoring_batches').update(row).eq('id', b.id).select().single() : await sb.from('monitoring_batches').insert(row).select().single());
}

export async function deleteBatch(id: string) {
  must(await supabase().from('monitoring_batches').delete().eq('id', id));
}

export async function saveItem(batchId: string, item: MonitoringItem): Promise<MonitoringItem> {
  const sb = supabase();
  const row = {
    batch_id: batchId,
    entry_id: item.entry_id,
    requestor: item.requestor?.trim() || null,
    association: item.association?.trim() || null,
    event_date: item.event_date?.trim() || null,
    contact_number: item.contact_number?.replace(/[\s-]/g, '') || null,
    amount: item.amount,
    given_by: item.given_by?.trim() || null,
    date_claimed: item.date_claimed || null,
    remarks: item.remarks?.trim() || null,
    attachment_paths: item.attachment_paths ?? [],
    sort: item.sort,
  };
  return must(item.id ? await sb.from('monitoring_items').update(row).eq('id', item.id).select().single() : await sb.from('monitoring_items').insert(row).select().single());
}

export async function deleteItem(id: string) {
  must(await supabase().from('monitoring_items').delete().eq('id', id));
}

export async function uploadBudgetAttachment(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `budget/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  must(await supabase().storage.from('attachments').upload(path, file, { contentType: file.type || undefined }));
  return path;
}

// ---------- barangay annual budgets ----------
export async function listBarangayBudgets(year: number): Promise<BarangayBudget[]> {
  const rows = must(await supabase().from('barangay_budgets').select('*').eq('year', year)) as BarangayBudget[];
  return rows.map((r) => ({ ...r, brgy_budget: num(r.brgy_budget), sk_budget: num(r.sk_budget) }));
}

export async function upsertBarangayBudget(b: BarangayBudget) {
  must(
    await supabase()
      .from('barangay_budgets')
      .upsert({ year: b.year, barangay: b.barangay, brgy_budget: b.brgy_budget, sk_budget: b.sk_budget, remarks: b.remarks, updated_at: new Date().toISOString() }, { onConflict: 'year,barangay' }),
  );
}
