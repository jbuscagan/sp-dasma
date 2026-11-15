'use client';
// Upload & scan: many photos and/or PDFs at once → read → REVIEW and correct → add to the table as drafts.
// Nothing is saved until the user confirms, and nothing is published automatically.
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Modal } from '@/components/ui';
import { Combobox } from '@/components/ui/Combobox';
import { EventDateInput } from '@/components/ui/EventDateInput';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/features/auth/session';
import { useDirectory } from '@/features/directory/useDirectory';
import { listEntries, saveEntry, setReceived, uploadAttachment } from '@/features/transmittal/api';
import { MEDICAL_PURPOSE_OPTIONS, PURPOSE_OPTIONS, REQUEST_OPTIONS, TYPES } from '@/features/transmittal/config';
import { todayIso } from '@/lib/dates';
import type { Entry, EntryInput, TransmittalType } from '@/lib/types';
import { batchDuplicates, findDuplicateEntry } from './duplicates';
import type { Confidence, Extracted } from './extract';
import { CONFIDENCE_STYLE, processFiles, type Progress, type ScanDoc } from './process';

type Key = keyof Extracted;

export function BulkScanDialog({
  open,
  type,
  onClose,
  onSaved,
  onConfirm,
}: {
  open: boolean;
  type: TransmittalType;
  onClose: () => void;
  onSaved: (n: number) => void;
  /** Use the checked results somewhere else (e.g. Solicitation Monitoring) instead of saving transmittal drafts. */
  onConfirm?: (docs: ScanDoc[], files: File[]) => Promise<void>;
}) {
  const cfg = TYPES[type];
  const medical = type === 'medical';
  const { committee, committeeName } = useSession();
  const dir = useDirectory();
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<'pick' | 'working' | 'review'>('pick');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [docs, setDocs] = useState<ScanDoc[]>([]);
  const [existing, setExisting] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ScanDoc | null>(null);
  const [onePerPage, setOnePerPage] = useState(false); // multi-page PDF: every page is its own request
  const [addAnyway, setAddAnyway] = useState<Set<string>>(new Set()); // duplicates the user still wants as new rows

  const reset = () => {
    setFiles([]);
    setDocs([]);
    setStep('pick');
    setProgress(null);
    setError('');
    setAddAnyway(new Set());
  };
  const close = () => {
    if (step === 'working') return;
    reset();
    onClose();
  };

  const run = async () => {
    setStep('working');
    setError('');
    try {
      const [found, ex] = await Promise.all([
        processFiles(files, { barangays: dir.barangays, orgs: dir.orgs.map((o) => o.name), medical, type: onConfirm ? undefined : type, onePerPage }, setProgress),
        listEntries({ status: ['draft', 'submitted', 'transmitted'] }).catch(() => [] as Entry[]),
      ]);
      setExisting(ex);
      setDocs(found);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('pick');
    }
  };

  const setField = (key: string, k: Key, value: string) =>
    setDocs((list) => list.map((d) => (d.key === key ? { ...d, fields: { ...d.fields, [k]: { value, confidence: 'high' as Confidence } } } : d)));
  const toggle = (key: string) => setDocs((list) => list.map((d) => (d.key === key ? { ...d, include: !d.include } : d)));

  // Required fields of this transmittal type, in scan terms
  const requiredKeys: Key[] = useMemo(() => {
    const map: Partial<Record<string, Key>> = { solicitor_name: 'name', patient_name: 'name', barangay: 'barangay', purpose: 'purpose', request: 'request', date_received: 'dateReceived' };
    return Array.from(new Set(cfg.fields.filter((f) => f.required).map((f) => map[String(f.key)]).filter(Boolean) as Key[]));
  }, [cfg.fields]);
  const missing = (d: ScanDoc) => requiredKeys.filter((k) => !d.fields[k].value.trim());

  const dupInputs = docs.map((d) => ({ name: d.fields.name.value, organization: d.fields.organization.value, contact: d.fields.contact.value, dateReceived: d.fields.dateReceived.value }));
  const inBatch = batchDuplicates(dupInputs);

  /**
   * What happens to each scanned request:
   *  • new   — added to the table as a draft
   *  • tick  — the solicitor is already in this office's list: that record is ticked as received instead of added again
   *  • same  — the same request appears earlier in this upload: added once, and ticked as received
   *  • other — looks like a request of another office (shown as a warning; added unless unticked)
   */
  type Plan = { kind: 'new' } | { kind: 'tick'; entry: Entry } | { kind: 'same'; first: number } | { kind: 'other'; entry: Entry };
  const plans: Plan[] = docs.map((d, i) => {
    if (onConfirm || addAnyway.has(d.key)) return { kind: 'new' };
    const e = findDuplicateEntry(dupInputs[i], existing);
    if (e && e.committee_id === committee?.id && e.type === type) return { kind: 'tick', entry: e };
    if (inBatch.has(i)) return { kind: 'same', first: inBatch.get(i)! };
    if (e) return { kind: 'other', entry: e };
    return { kind: 'new' };
  });

  const chosen = docs.filter((d) => d.include);
  const chosenNew = docs.filter((d, i) => d.include && (plans[i].kind === 'new' || plans[i].kind === 'other'));
  const chosenTick = docs.filter((d, i) => d.include && (plans[i].kind === 'tick' || plans[i].kind === 'same'));
  const blocked = chosenNew.filter((d) => missing(d).length);

  const save = async () => {
    if (!committee) return;
    setSaving(true);
    setError('');
    try {
      if (onConfirm) {
        await onConfirm(chosen, files);
        onSaved(chosen.length);
        reset();
        onClose();
        return;
      }
      const paths = new Map<number, string>(); // upload each original file once
      const created = new Map<number, string>(); // doc index → new record id
      for (const [i, d] of docs.entries()) {
        if (!d.include || !(plans[i].kind === 'new' || plans[i].kind === 'other')) continue;
        if (!paths.has(d.fileIndex)) {
          const f = files[d.fileIndex];
          paths.set(d.fileIndex, await uploadAttachment(f, committee.id, f.name.split('.').pop() || 'jpg'));
        }
        const v = (k: Key) => d.fields[k].value.trim() || null;
        const input: EntryInput = {
          type,
          committee_id: committee.id,
          status: 'draft',
          date_received: v('dateReceived') ?? todayIso(),
          solicitor_name: medical ? d.solicitor ?? null : v('name'),
          patient_name: medical ? v('name') : null,
          organization: medical ? null : v('organization'),
          barangay: v('barangay'),
          purpose: v('purpose'),
          request: medical ? null : v('request'),
          diagnosis: medical ? v('diagnosis') : null,
          event_date: medical ? null : v('eventDate'),
          contact_number: v('contact'),
          remarks: d.source === 'letter' ? 'Added from scanned letter' : 'Imported from transmittal PDF',
          assistance_status: 'pending',
          attachment_paths: [paths.get(d.fileIndex)!],
        };
        created.set(i, (await saveEntry(input)).id);
      }
      // Already there → tick as received (no second copy)
      const tick = new Set<string>();
      docs.forEach((d, i) => {
        const p = plans[i];
        if (!d.include) return;
        if (p.kind === 'tick') tick.add(p.entry.id);
        if (p.kind === 'same') {
          const first = plans[p.first];
          const id = first.kind === 'tick' ? first.entry.id : created.get(p.first);
          if (id) tick.add(id);
        }
      });
      if (tick.size) await setReceived(Array.from(tick), true, committee.id);
      onSaved(created.size);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const cols: { k: Key; label: string; w: string; kind?: 'org' | 'brgy' | 'purpose' | 'request' | 'date' | 'event' }[] = [
    { k: 'name', label: medical ? 'Patient' : 'Name', w: 'min-w-[170px]' },
    ...(medical ? [] : [{ k: 'organization' as Key, label: 'Organization', w: 'min-w-[180px]', kind: 'org' as const }]),
    { k: 'barangay', label: 'Barangay / chapter', w: 'min-w-[150px]', kind: 'brgy' },
    { k: 'purpose', label: medical ? 'Purpose' : 'Purpose', w: 'min-w-[150px]', kind: 'purpose' },
    ...(medical ? [{ k: 'diagnosis' as Key, label: 'Diagnosis', w: 'min-w-[160px]' }] : [{ k: 'request' as Key, label: 'Request', w: 'min-w-[140px]', kind: 'request' as const }]),
    { k: 'dateReceived', label: 'Date received', w: 'min-w-[140px]', kind: 'date' },
    ...(medical ? [] : [{ k: 'eventDate' as Key, label: 'Date of event', w: 'min-w-[170px]', kind: 'event' as const }]),
    { k: 'contact', label: 'Contact', w: 'min-w-[120px]' },
  ];

  const cellInput = (d: ScanDoc, c: (typeof cols)[number]) => {
    const g = d.fields[c.k];
    const style = `${CONFIDENCE_STYLE[g.confidence]} ${requiredKeys.includes(c.k) && !g.value ? 'ring-2 ring-red-400' : ''}`;
    const base = `input py-1 text-[13px] ${style}`;
    const options =
      c.kind === 'org' ? dir.orgOptions : c.kind === 'brgy' ? dir.barangayOptions : c.kind === 'purpose' ? (medical ? MEDICAL_PURPOSE_OPTIONS : PURPOSE_OPTIONS).map((o) => ({ label: o, value: o })) : c.kind === 'request' ? REQUEST_OPTIONS.map((o) => ({ label: o, value: o })) : null;
    if (options) return <Combobox value={g.value} onChange={(x) => setField(d.key, c.k, x)} options={options} inputClassName={`${base} pr-8`} ariaLabel={c.label} />;
    if (c.kind === 'date') return <input type="date" aria-label={c.label} className={base} value={g.value} onChange={(e) => setField(d.key, c.k, e.target.value)} />;
    if (c.kind === 'event') return <EventDateInput aria-label={c.label} className={base} value={g.value} onChange={(x) => setField(d.key, c.k, x)} />;
    return <input aria-label={c.label} className={base} value={g.value} onChange={(e) => setField(d.key, c.k, e.target.value)} />;
  };

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title={step === 'review' ? `Check the scanned ${cfg.label} requests` : 'Upload & scan'}
      footer={
        step === 'review' ? (
          <>
            <span className="mr-auto self-center text-sm text-muted">
              {chosenNew.length} new{chosenTick.length ? ` · ${chosenTick.length} already in the list (ticked as received)` : ''}{blocked.length ? ` · ${blocked.length} missing required fields` : ''}
            </span>
            <Button variant="secondary" onClick={reset}>Start over</Button>
            <Button busy={saving} disabled={!chosen.length || blocked.length > 0} onClick={save}>
              {onConfirm ? `Add ${chosen.length} row(s)` : chosenNew.length ? `Add ${chosenNew.length} to the table` : 'Tick as received'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={step === 'working'}>Cancel</Button>
            <Button busy={step === 'working'} disabled={!files.length} onClick={run}>Read {files.length || ''} file(s)</Button>
          </>
        )
      }
    >
      {error && <div className="mb-3"><Alert kind="error">{error}</Alert></div>}

      {step === 'pick' && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Add <b>several photos</b>, a <b>PDF of many scanned letters</b>, or a <b>prepared transmittal PDF</b>. The app reads them, fills in the fields,
            and shows them here for you to check before anything is saved.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line px-4 py-6 text-center hover:border-brand-500">
              <Icon name="camera" size={28} className="text-brand-600" />
              <span className="mt-2 text-sm font-semibold">Take a photo</span>
              <span className="text-xs text-muted">Opens the camera on phones</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])} />
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line px-4 py-6 text-center hover:border-brand-500">
              <Icon name="upload" size={28} className="text-brand-600" />
              <span className="mt-2 text-sm font-semibold">Choose photos or PDFs</span>
              <span className="text-xs text-muted">Many at once · JPG, PNG, PDF</span>
              <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])} />
            </label>
          </div>
          {files.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {files.map((f, i) => (
                <li key={f.name + f.size + i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="flex min-w-0 items-center gap-1.5 truncate"><Icon name={/pdf$/i.test(f.name) ? 'file' : 'image'} size={15} className="text-muted" />{f.name} <span className="text-xs text-muted">({Math.round(f.size / 1024)} KB)</span></span>
                  <button type="button" className="text-xs text-red-600" onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={onePerPage} onChange={(e) => setOnePerPage(e.target.checked)} />
            <span>Every page of a PDF is a separate request <span className="text-muted">(tick this for a PDF of many one-page letters; photos are always one request each)</span></span>
          </label>
          <p className="text-xs text-muted">
            Tips for better reading: flat page, good light, no shadows, whole page in the photo. Typed letters read well; handwriting is often misread, so always check names and numbers.
          </p>
        </div>
      )}

      {step === 'working' && progress && (
        <div className="space-y-3 py-6 text-center">
          <p className="text-sm font-medium">{progress.step}</p>
          <div className="mx-auto h-2 max-w-md overflow-hidden rounded-full bg-brand-50">
            <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
          </div>
          <p className="text-xs text-muted">{progress.done} / {progress.total}</p>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-3">
          {!docs.length && <Alert kind="warn">No text could be read from these files. Try clearer photos.</Alert>}
          {docs.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-semibold">How sure the reader is:</span>
                <span className="border-l-4 border-l-emerald-500 pl-1.5">sure</span>
                <span className="border-l-4 border-l-amber-400 pl-1.5">please check</span>
                <span className="border-l-4 border-l-red-400 pl-1.5">likely wrong</span>
                <span className="border-l-4 border-l-slate-300 pl-1.5">not found</span>
                <span className="ml-auto text-muted">Red outline = required</span>
              </div>
              <div className="max-h-[55vh] overflow-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10 bg-brand-50 text-left text-[11px] font-semibold uppercase text-brand-700">
                    <tr>
                      <th className="px-2 py-2">Add</th>
                      <th className="px-2">Page</th>
                      {cols.map((c) => <th key={c.k} className="px-2">{c.label}</th>)}
                      <th className="px-2">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d, i) => {
                      const plan = plans[i];
                      return (
                        <tr key={d.key} className={`border-t border-line align-top ${d.include ? '' : 'opacity-50'}`}>
                          <td className="px-2 py-2"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={d.include} onChange={() => toggle(d.key)} aria-label="Add this request" /></td>
                          <td className="px-2 py-1">
                            <button type="button" onClick={() => setPreview(d)} className="block" title="See the page and the text that was read">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={d.thumbs[0]} alt={d.pageLabel} className="h-14 w-11 rounded border border-line object-cover object-top" />
                            </button>
                            <span className="mt-0.5 block max-w-[90px] truncate text-[10px] text-muted" title={d.pageLabel}>{d.source === 'table' ? 'table row' : d.thumbs.length > 1 ? `${d.thumbs.length} pages` : 'letter'}</span>
                          </td>
                          {cols.map((c) => <td key={c.k} className={`px-1 py-1 ${c.w}`}>{cellInput(d, c)}</td>)}
                          <td className="min-w-[140px] px-2 py-1 text-xs">
                            {!onConfirm && d.detectedType && d.detectedType !== type && (
                              <div className="mb-1">
                                <Badge color="blue">{d.source === 'table' ? `From a ${TYPES[d.detectedType].label} transmittal` : `Looks like ${TYPES[d.detectedType].label}`}</Badge>
                                <div className="mt-0.5 text-[11px] text-muted">{d.source === 'table' ? `Import it on the ${TYPES[d.detectedType].label} page` : `Check the category — it may belong on the ${TYPES[d.detectedType].label} page`}</div>
                              </div>
                            )}
                            {plan.kind === 'tick' && (
                              <div>
                                <Badge color="green"><Icon name="check" size={11} />Already in your list</Badge>
                                <div className="mt-0.5 text-[11px] text-muted">{plan.entry.patient_name || plan.entry.solicitor_name} ({plan.entry.date_received}) will be ticked as received — not added twice.</div>
                                <button type="button" className="mt-0.5 text-[11px] text-brand-600 hover:underline" onClick={() => setAddAnyway((s) => new Set(s).add(d.key))}>Add as a new request instead</button>
                              </div>
                            )}
                            {plan.kind === 'same' && (
                              <div>
                                <Badge color="green"><Icon name="check" size={11} />Repeated in this upload</Badge>
                                <div className="mt-0.5 text-[11px] text-muted">Same as {docs[plan.first]?.fields.name.value || 'an earlier row'} above — added once and ticked as received.</div>
                                <button type="button" className="mt-0.5 text-[11px] text-brand-600 hover:underline" onClick={() => setAddAnyway((s) => new Set(s).add(d.key))}>Add both</button>
                              </div>
                            )}
                            {plan.kind === 'other' && (
                              <div>
                                <Badge color="amber"><Icon name="alert" size={11} />Possible duplicate</Badge>
                                <div className="mt-0.5 text-[11px] text-muted">Looks like {plan.entry.patient_name || plan.entry.solicitor_name} ({plan.entry.date_received}, {committeeName(plan.entry.committee_id)})</div>
                              </div>
                            )}
                            {missing(d).length > 0 && d.include && (plan.kind === 'new' || plan.kind === 'other') && <div className="mt-1 text-[11px] text-red-600">Fill in required fields or untick</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">Saved requests become <b>drafts</b> in the table, with the scanned file attached. You can still edit them before Submit and Publish.</p>
            </>
          )}
        </div>
      )}

      {preview && (
        <Modal open onClose={() => setPreview(null)} title={preview.pageLabel} wide>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview.thumbs.map((t, i) => <img key={i} src={t} alt={`Page ${i + 1}`} className="w-full rounded border border-line" />)}
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-surface p-3 text-xs">{preview.text || '(no text)'}</pre>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
