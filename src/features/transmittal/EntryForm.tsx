'use client';
// Add / edit form. The fields come from config.ts, so every transmittal type uses this one form.
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Field, Modal } from '@/components/ui';
import { Combobox } from '@/components/ui/Combobox';
import { useSession } from '@/features/auth/session';
import { useDirectory } from '@/features/directory/useDirectory';
import { todayIso } from '@/lib/dates';
import type { Entry, EntryInput, TransmittalType } from '@/lib/types';
import { needsDetails, TYPES, type FieldDef } from './config';
import { saveEntry } from './api';
import { AttachmentList } from './Attachments';

const PH_MOBILE = /^(09\d{9}|\+639\d{9})$/;

export function EntryForm({
  type,
  open,
  onClose,
  entry,
  prefill,
  scanText,
}: {
  type: TransmittalType;
  open: boolean;
  onClose: () => void;
  entry?: Entry | null; // editing
  prefill?: EntryInput; // new entry from a scan
  scanText?: string;
}) {
  const cfg = TYPES[type];
  const { committee } = useSession();
  const dir = useDirectory();
  const blank = useMemo<EntryInput>(
    () => ({ type, date_received: todayIso(), assistance_status: 'pending', attachment_paths: [], ...(cfg.defaults ?? {}), ...(prefill ?? {}) }),
    [type, prefill, cfg.defaults],
  );
  const [v, setV] = useState<EntryInput>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (open) {
      setV(entry ? { ...entry } : blank);
      setError('');
      setSavedCount(0);
    }
  }, [open, entry, blank]);

  const set = (k: keyof Entry, value: unknown) => setV((s) => ({ ...s, [k]: value }));
  const str = (k: keyof Entry) => ((v as Partial<Entry>)[k] as string | null | undefined) ?? '';

  const submit = async (again: boolean) => {
    setError('');
    const missing = cfg.fields.filter((f) => f.required && !str(f.key).trim()).map((f) => f.label);
    if (missing.length) return setError(`Please fill in: ${missing.join(', ')}`);
    if (!committee) return setError('Your account is not linked to an office yet.');
    setBusy(true);
    try {
      const payload: EntryInput = { ...v, type };
      if (!entry) payload.committee_id = committee.id;
      delete (payload as Partial<Entry>).id;
      delete (payload as Partial<Entry>).created_at;
      delete (payload as Partial<Entry>).updated_at;
      await saveEntry(payload, entry?.id);
      if (again) {
        setV({ ...blank, date_received: v.date_received, attachment_paths: [] });
        setSavedCount((n) => n + 1);
      } else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const renderField = (f: FieldDef) => {
    const value = str(f.key);
    switch (f.kind) {
      case 'date':
        return <input type="date" className="input" value={value} onChange={(e) => set(f.key, e.target.value)} required={f.required} />;
      case 'textarea':
        return <textarea className="input min-h-[70px]" value={value} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
      case 'phone':
        return (
          <>
            <input className="input" inputMode="tel" value={value} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
            {value && !PH_MOBILE.test(value.replace(/[\s-]/g, '')) && (
              <span className="mt-1 block text-xs text-amber-600">Not a usual PH mobile number (09XXXXXXXXX). Saved as typed.</span>
            )}
          </>
        );
      case 'organization':
        return (
          <Combobox
            value={value}
            onChange={(x) => set(f.key, x)}
            options={dir.orgOptions}
            placeholder={f.placeholder}
          />
        );
      case 'barangay':
        return <Combobox value={value} onChange={(x) => set(f.key, x)} options={dir.barangayOptions} placeholder="Start typing…" required={f.required} />;
      case 'choice':
        return (
          <>
            <Combobox
              value={value}
              onChange={(x) => set(f.key, x)}
              options={(f.options ?? []).map((o) => ({ label: o, value: o }))}
              placeholder={f.placeholder ?? 'Choose or type your own'}
              maxShown={20}
            />
            {f.key === 'request' && needsDetails(value) && (
              <input
                className="input mt-2"
                placeholder="Raffle items (e.g. rice cooker, electric fan, grocery packs)"
                value={str('request_details')}
                onChange={(e) => set('request_details', e.target.value)}
              />
            )}
          </>
        );
      case 'assistance':
        return (
          <div className="flex flex-wrap items-center gap-3">
            <select className="input w-auto" value={value || 'pending'} onChange={(e) => set('assistance_status', e.target.value)}>
              <option value="pending">Not yet received assistance</option>
              <option value="received">Already received assistance</option>
            </select>
            {value === 'received' && (
              <label className="flex items-center gap-2 text-sm">
                on
                <input type="date" className="input w-auto" value={str('assistance_date')} onChange={(e) => set('assistance_date', e.target.value)} />
              </label>
            )}
          </div>
        );
      default:
        return <input className="input" value={value} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} required={f.required} />;
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide={!!scanText}
      title={`${entry ? 'Edit' : 'Add'} ${cfg.label} request`}
      footer={
        <>
          {savedCount > 0 && <span className="mr-auto self-center text-sm text-emerald-600">Saved {savedCount}. Ready for the next one.</span>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {!entry && (
            <Button variant="secondary" busy={busy} onClick={() => submit(true)}>
              Save &amp; add another
            </Button>
          )}
          <Button busy={busy} onClick={() => submit(false)}>Save</Button>
        </>
      }
    >
      <div className={scanText ? 'grid gap-4 md:grid-cols-[1fr_300px]' : ''}>
        <div className="space-y-3">
          {error && <Alert kind="error">{error}</Alert>}
          {entry && entry.status !== 'draft' && (
            <Alert kind="warn">This entry is already {entry.status}. Changes are visible to all offices immediately.</Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {cfg.fields.map((f) => (
              <Field key={String(f.key)} label={f.label + (f.required ? ' *' : '')} className={f.full ? 'sm:col-span-2' : ''}>
                {renderField(f)}
              </Field>
            ))}
          </div>
          <AttachmentList paths={(v.attachment_paths as string[]) ?? []} onChange={(p) => set('attachment_paths', p)} />
        </div>
        {scanText && (
          <aside className="rounded-lg border border-line bg-surface p-3">
            <div className="label">Scanned text</div>
            <p className="mb-2 text-xs text-muted">Select and copy text into the fields. Always double-check names and numbers.</p>
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap text-xs">{scanText}</pre>
          </aside>
        )}
      </div>
    </Modal>
  );
}
