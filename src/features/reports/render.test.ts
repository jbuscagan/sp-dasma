// Smoke test: every report format renders. Set REPORT_OUT=<folder> to also save the files for a visual check.
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setFontSource } from '@/lib/pdfFonts';
import type { Committee, Entry } from '@/lib/types';
import { TYPES } from '@/features/transmittal/config';
import { buildHeader } from './header';
import { buildReport } from './build';
import { renderPdf } from './pdf';
import { renderDocx } from './docx';
import { renderXlsx } from './xlsx';
import { renderDtrPdf } from '@/features/dtr/pdf';
import { buildLedger, renderLedger, totals } from '@/features/budget/ledger';
import { parseMoney, peso } from '@/features/budget/money';
import { DEFAULT_SETTINGS, type FormPlan } from '@/features/dtr/engine';

const committee: Committee = { id: 'c', name: 'Office of SPM Robin Cantimbuhan', spm_name: 'Robin Cantimbuhan', code_prefix: 'SPMRC' };
const base = { committee_id: 'c', organization: null, request: null, request_details: null, event_date: null, remarks: null, assistance_status: 'pending', assistance_date: null, status: 'draft', archived_reason: null, transmittal_id: null, attachment_paths: [] as string[], position: null, submitted_at: null, received_by: null, received_at: null, created_at: '', updated_at: '' } as const;
const medical: Entry[] = [
  { ...base, id: '1', type: 'medical', date_received: '2026-10-08', solicitor_name: 'Cecil Arcenal', patient_name: 'Jonifer JR V. Arcenal', barangay: 'Zone I', diagnosis: 'Cerebral Palsy, Focal Epilepsy Global Development Delay', purpose: 'For Maintenance', assistance_spec: 'ECG Test: Php13,311.50\nPhenobarbital 60mg, Levit 500mg, Tegretol 200mg', contact_number: '09398331352' },
  { ...base, id: '2', type: 'medical', date_received: '2026-10-12', solicitor_name: null, patient_name: 'Sonny C. Autencio', barangay: 'Sampaloc III', diagnosis: 'Bullous Cellulitis', purpose: 'For Hospital Bill', assistance_spec: 'Php 34,945.67', contact_number: '09171123781' },
  { ...base, id: '3', type: 'medical', date_received: '2026-10-13', solicitor_name: 'Claristo Bachicha', patient_name: 'Arkien Ace Bachicha', barangay: 'San Antonio de Padua I', diagnosis: 'Generalized Peritonitis Secondary to Ruptured Appendicitis', purpose: 'For Hospital Bill (DLSUMC)', assistance_spec: 'No provided amount.', contact_number: '09510675646' },
];
const christmas: Entry[] = [
  { ...base, id: '4', type: 'christmas', date_received: '2026-10-29', solicitor_name: 'Glenda Sescar', patient_name: null, organization: 'Dasmariñas Third Gen', barangay: 'Burol Main', purpose: 'Christmas Party', request: 'Cash/In-Kind', diagnosis: null, assistance_spec: null, contact_number: '9388293438', event_date: 'December 13, 2026' },
  { ...base, id: '5', type: 'christmas', date_received: '2026-10-29', solicitor_name: 'Jennifer Potente', patient_name: null, organization: 'PWD', barangay: 'Salitran I', purpose: 'Christmas Party', request: 'Cash/Raffle', request_details: 'rice cooker, grocery packs', diagnosis: null, assistance_spec: null, contact_number: '9284639999', event_date: 'December 20, 2026' },
];

const pub = path.resolve(__dirname, '../../../public');
setFontSource(async (file) => readFileSync(`${pub}/fonts/${file}`).toString('base64'));
const dataUrl = (file: string, mime: string) => `data:${mime};base64,${readFileSync(`${pub}/${file}`).toString('base64')}`;

const out = process.env.REPORT_OUT;
const save = async (name: string, blob: Blob) => {
  const buf = Buffer.from(await blob.arrayBuffer());
  expect(buf.length).toBeGreaterThan(1000);
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/${name}`, buf);
  }
};

describe('report rendering', () => {
  for (const [label, list] of [['medical', medical], ['christmas', christmas]] as const) {
    const type = list[0].type;
    const doc = buildReport({
      header: buildHeader(type, committee, list, '2026-10-15'),
      columns: TYPES[type].columns,
      entries: list,
      headerColor: TYPES[type].headerColor,
      headerText: TYPES[type].headerText,
      encoderName: 'Joseph Aguilar',
      encoderPosition: 'Administrative Assistant',
      paper: 'A4',
      orientation: 'landscape',
      blankRows: 2,
      received: () => 'Office of SPM Two',
    });
    it(`${label}: pdf, docx, xlsx`, async () => {
      expect(doc.header.code).toBe(`SPMRC-${TYPES[type].code}-041`);
      await save(`${label}.pdf`, await renderPdf(doc));
      await save(`${label}.docx`, await renderDocx(doc));
      await save(`${label}.xlsx`, await renderXlsx(doc));
    });
  }

  it('dtr pdf: 3 forms per A4 landscape, alternating 1-15 / 16-31', async () => {
    const t = { amIn: 450, amOut: 720, pmIn: 765, pmOut: 1110 };
    const two = (): FormPlan[] => [
      { type: 'A' as const, key: 'A', days: { 3: t, 4: t, 5: t } },
      { type: 'B' as const, key: 'B', days: { 21: t, 22: t, 23: t } },
    ];
    const sig = `data:image/png;base64,${readFileSync(path.resolve(__dirname, '../dtr/__fixtures__/signature.png')).toString('base64')}`;
    const people = ['Emerson Virata', 'Elvina Bequillo', 'Maria Clarissa Dela Cruz-Villanueva'].map((name, i) => ({ id: String(i), name, position: 'Driver', dept: 'SP', forms: two(), signature: sig }));
    const r = await renderDtrPdf(
      people,
      { ...DEFAULT_SETTINGS, signatoryName: 'Robin Chester J. Cantimbuhan' },
      { formA: dataUrl('dtr/form-a.jpg', 'image/jpeg'), formB: dataUrl('dtr/form-b.jpg', 'image/jpeg'), official: sig },
    );
    expect(r.pages).toBe(2);
    expect(r.order.map((o) => [o.from, o.to])).toEqual([[1, 1], [1, 2], [2, 2]]);
    await save('dtr.pdf', r.blob);

    const single = await renderDtrPdf(people.slice(0, 1), { ...DEFAULT_SETTINGS, layout: 'single' }, {}, { guides: true });
    expect(single.pages).toBe(2);
  });

  it('monitoring-style report with subtitle, totals and peso sign', async () => {
    const doc = buildReport({
      header: { code: 'Released Date: 45th | November 12, 2026', dateText: '', covering: '', office: '', title: 'CSO| WEEKLY SOLICITATION MONITORING', subtitle: '(44th | Nov 03 - 05, 2026)', week: 44 },
      columns: [
        { label: 'Requestor', width: 20, value: (e) => e.solicitor_name ?? '' },
        { label: 'Amount', width: 10, value: () => '₱2,000.00' },
      ],
      entries: christmas,
      headerColor: '#b6d7a8',
      headerText: '#000000',
      encoderName: '',
      encoderPosition: '',
      paper: 'FOLIO',
      orientation: 'landscape',
      note: '',
      footRow: ['', 'TOTAL', '₱4,000.00'],
      alignRight: [2],
    });
    await save('monitoring.pdf', await renderPdf(doc));
    await save('monitoring.xlsx', await renderXlsx(doc));
  });

  it('SP contribution ledger matches the Nov 9 sample totals', async () => {
    const report = { id: 'r', report_date: '2026-11-09', title: 'SP CONTRIBUTION REPORT', beginning_balance: -14000, notes: '₱5,000 - Vice\n₱9,000 - RJC' };
    const lines = [
      { kind: 'addition' as const, grp: null, label: 'SP Contribution', amount: 75000, sort: 0 },
      { kind: 'disbursement' as const, grp: 'Solicitation', label: 'CSO', amount: 23000, sort: 1 },
      { kind: 'disbursement' as const, grp: 'Solicitation', label: 'SK', amount: 7000, sort: 2 },
      { kind: 'disbursement' as const, grp: 'Solicitation', label: 'Brgy', amount: 5000, sort: 3 },
    ];
    const t = totals(report, lines);
    expect([t.available, t.disbursements, t.remaining]).toEqual([61000, 35000, 26000]);
    expect(peso(-14000)).toBe('- ₱14,000');
    expect(parseMoney('₱2,000.50')).toBe(2000.5);
    expect(parseMoney('(1,500)')).toBe(-1500);
    const ledger = buildLedger(report, lines);
    expect(ledger.dateLine).toBe('(NOVEMBER 9, 2026)');
    for (const f of ['pdf', 'xlsx', 'docx'] as const) await save(`ledger.${f}`, await renderLedger(ledger, f, 'A4', 'portrait'));
    // Nov 3 sample: no addition -> "Ending Balance"; an item without a group ("Ms. Base")
    const nov3 = buildLedger({ ...report, report_date: '2026-11-03', beginning_balance: 22000, notes: '' }, [
      { kind: 'disbursement', grp: 'Solicitation', label: 'CSO', amount: 26000, sort: 0 },
      { kind: 'disbursement', grp: 'Solicitation', label: 'SK', amount: 7000, sort: 1 },
      { kind: 'disbursement', grp: null, label: 'Ms. Base', amount: 3000, sort: 2 },
    ]);
    expect(nov3.rows[nov3.rows.length - 1].label).toBe('Ending Balance (Nov 3, 2026)');
    expect(nov3.rows[nov3.rows.length - 1].amount).toBe('- ₱14,000');
    await save('ledger-nov3.pdf', await renderLedger(nov3, 'pdf', 'A4', 'portrait'));
  });
});
