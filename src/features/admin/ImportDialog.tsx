'use client';
// Bulk import of barangays or organizations from Excel (.xlsx), CSV, or text pasted from a spreadsheet.
import { useState } from 'react';
import { Alert, Button, Field, Modal } from '@/components/ui';
import { supabase } from '@/lib/supabase/client';

type Target = 'barangays' | 'organizations';

/** Splits CSV / tab text into rows of cells (handles "quoted, values"). */
export function parseTable(text: string): string[][] {
  const sep = text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === sep && !quoted) {
        cells.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

async function readFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const out: string[][] = [];
    ws.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => (v === null || v === undefined ? '' : typeof v === 'object' && v && 'text' in v ? String((v as { text: string }).text) : String(v)).trim());
      out.push(vals);
    });
    return out;
  }
  return parseTable(await file.text());
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [target, setTarget] = useState<Target>('organizations');
  const [rows, setRows] = useState<string[][]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Skip a header row like "Name, Barangay"
  const data = rows.filter((r, i) => !(i === 0 && /^(name|barangay|organization)/i.test(r[0] ?? '')) && (r[0] ?? '').trim());

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const sb = supabase();
      if (target === 'barangays') {
        const list = Array.from(new Set(data.map((r) => r[0].trim())));
        const { error } = await sb.from('barangays').upsert(list.map((name) => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
        setMsg({ kind: 'ok', text: `Imported ${list.length} barangay(s). Existing ones were kept.` });
      } else {
        // One record per organization: skip names that already exist (ignoring letter case and spaces).
        const existing = new Set(((await sb.from('organizations').select('name').limit(20000)).data ?? []).map((o) => o.name.trim().toLowerCase()));
        const seen = new Set<string>();
        const list = data
          .map((r) => r[0].trim())
          .filter((n) => {
            const k = n.toLowerCase();
            if (!n || existing.has(k) || seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .map((name) => ({ name }));
        for (let i = 0; i < list.length; i += 500) {
          const { error } = await sb.from('organizations').insert(list.slice(i, i + 500));
          if (error) throw new Error(error.message);
        }
        setMsg({ kind: 'ok', text: `Added ${list.length} new organization(s). Names already in the list were skipped.` });
      }
      setRows([]);
      setText('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Import official list"
      footer={
        <>
          <span className="mr-auto self-center text-sm text-muted">{data.length} row(s) ready</span>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button busy={busy} disabled={!data.length} onClick={run}>Import {data.length} row(s)</Button>
        </>
      }
    >
      <div className="space-y-3">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <div className="flex gap-2">
          {(['organizations', 'barangays'] as Target[]).map((t) => (
            <Button key={t} variant={target === t ? 'primary' : 'secondary'} onClick={() => setTarget(t)}>
              {t === 'organizations' ? 'Organizations' : 'Barangays'}
            </Button>
          ))}
        </div>
        <Alert kind="info">
          {target === 'organizations'
            ? 'Column A = Organization name (one per row, no barangay needed). A header row is skipped automatically.'
            : 'Column A = Barangay name. A header row is skipped automatically.'}
        </Alert>
        <Field label="Upload Excel (.xlsx) or CSV">
          <input type="file" accept=".xlsx,.csv,.txt" className="input" onChange={async (e) => e.target.files?.[0] && setRows(await readFile(e.target.files[0]))} />
        </Field>
        <Field label="…or paste from Excel / Google Sheets">
          <textarea
            className="input min-h-[110px] font-mono text-xs"
            value={text}
            placeholder={target === 'organizations' ? 'KBDM\nSenior Citizens Association\nPWD' : 'Burol Main\nZone I'}
            onChange={(e) => {
              setText(e.target.value);
              setRows(parseTable(e.target.value));
            }}
          />
        </Field>
        {data.length > 0 && (
          <div className="max-h-48 overflow-auto rounded-lg border border-line">
            <table className="table-base text-xs">
              <thead><tr><th>#</th><th>{target === 'organizations' ? 'Organization' : 'Barangay'}</th></tr></thead>
              <tbody>
                {data.slice(0, 50).map((r, i) => (
                  <tr key={i}><td>{i + 1}</td><td>{r[0]}</td></tr>
                ))}
              </tbody>
            </table>
            {data.length > 50 && <p className="p-2 text-xs text-muted">…and {data.length - 50} more</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
