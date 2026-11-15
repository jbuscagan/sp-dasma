// ============================================================================
// TRANSMITTAL TYPES — the single place that defines each type's form fields,
// report columns, report title and code. To add/rename a column, edit here only.
// ============================================================================
import type { Entry, EntryInput, TransmittalType } from '@/lib/types';
import { fmtMDY } from '@/lib/dates';

export type FieldKind =
  | 'date'
  | 'text'
  | 'textarea'
  | 'phone'
  | 'organization' // dropdown of organizations (one record each); barangay / chapter is a separate field
  | 'barangay' // type-ahead from the barangay list
  | 'choice' // dropdown with free typing allowed
  | 'assistance'; // personal: received? + date

export interface FieldDef {
  key: keyof Entry;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  full?: boolean; // span the full form width
}

export interface ColumnDef<T = Entry> {
  label: string;
  width: number; // relative width used by PDF / Word / Excel
  value: (e: T) => string;
  italic?: boolean;
  right?: boolean; // amounts
}

export interface TypeConfig {
  type: TransmittalType;
  label: string; // menu label
  code: string; // SPMRC-<code>-045
  title: string; // printed title
  headerColor: string; // table header colour in reports (matches the sample files)
  headerText: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  defaults?: EntryInput; // pre-filled values for a new request
}

export const REQUEST_OPTIONS = [
  'Cash',
  'In-Kind',
  'Cash/In-Kind',
  'Raffle',
  'Cash/Raffle',
  'Financial Assistance',
  'Food',
  'Any kind of assistance',
];

export const PURPOSE_OPTIONS = [
  'Christmas Party',
  'Sports Fest / Liga',
  'Anniversary',
  'Fiesta',
  'Outreach Program',
  'Medical Mission',
  'Emergency Assistance',
  'Seminar / Training',
];

export const MEDICAL_PURPOSE_OPTIONS = [
  'For Maintenance',
  'For Medicine',
  'For Hospital Bill',
  'For Treatment/Therapy',
  'For Operation',
  'For Laboratory',
];

/** "Raffle" requests ask for the raffle items. */
export const needsDetails = (request: string | null | undefined) => /raffle/i.test(request ?? '');

// ---------- display helpers shared by tables and reports ----------
export const orgBarangay = (e: Entry) =>
  [e.organization, e.barangay].map((s) => (s ?? '').trim()).filter(Boolean).join(' - ');

export const requestText = (e: Entry) =>
  [e.request, e.request_details ? `(${e.request_details})` : ''].filter(Boolean).join(' ');

export const medicalName = (e: Entry) => {
  const sol = (e.solicitor_name ?? '').trim();
  const pat = (e.patient_name ?? '').trim();
  if (sol && pat && sol.toLowerCase() !== pat.toLowerCase()) return `Solicitor: ${sol}\nPatient: ${pat}`;
  return pat || sol;
};

export const displayName = (e: Entry) => (e.type === 'medical' ? medicalName(e) : e.solicitor_name ?? '');

const assistanceText = (e: Entry) =>
  e.assistance_status === 'received'
    ? `Received${e.assistance_date ? ' ' + fmtMDY(e.assistance_date) : ''}`
    : 'Pending';

// ---------- reusable field / column building blocks ----------
const F = {
  date: { key: 'date_received', label: 'Date received', kind: 'date', required: true } as FieldDef,
  solicitor: { key: 'solicitor_name', label: 'Name of the solicitor', kind: 'text', required: true } as FieldDef,
  org: { key: 'organization', label: 'Organization / Association', kind: 'organization', placeholder: 'Start typing, e.g. Dasmariñas ThirdGen' } as FieldDef,
  brgy: { key: 'barangay', label: 'Barangay', kind: 'barangay' } as FieldDef,
  purpose: { key: 'purpose', label: 'Purpose / Activity', kind: 'choice', options: PURPOSE_OPTIONS } as FieldDef,
  request: { key: 'request', label: 'Request', kind: 'choice', options: REQUEST_OPTIONS, required: true } as FieldDef,
  contact: { key: 'contact_number', label: 'Contact number', kind: 'phone', placeholder: '09XXXXXXXXX' } as FieldDef,
  event: { key: 'event_date', label: 'Date of event', kind: 'text', placeholder: 'e.g. December 20, 2026 or Nov 20-21' } as FieldDef,
  remarks: { key: 'remarks', label: 'Remarks (internal note, not printed)', kind: 'textarea', full: true } as FieldDef,
};

const C = {
  date: { label: 'DATE RECEIVED', width: 11, value: (e: Entry) => fmtMDY(e.date_received) } as ColumnDef,
  name: { label: 'NAME OF THE SOLICITOR', width: 18, value: (e: Entry) => e.solicitor_name ?? '' } as ColumnDef,
  org: { label: 'ORGANIZATION / BARANGAY', width: 20, value: orgBarangay } as ColumnDef,
  purpose: { label: 'PURPOSE', width: 12, value: (e: Entry) => e.purpose ?? '' } as ColumnDef,
  request: { label: 'REQUEST', width: 13, value: requestText } as ColumnDef,
  contact: { label: 'CONTACT NO.', width: 12, value: (e: Entry) => e.contact_number ?? '' } as ColumnDef,
  event: { label: 'DATE OF EVENT', width: 12, value: (e: Entry) => e.event_date ?? '' } as ColumnDef,
};

const solicitationType = (
  type: TransmittalType,
  label: string,
  code: string,
  title: string,
  headerColor: string,
  headerText = '#000000',
  purposeDefault?: string,
): TypeConfig => ({
  type,
  label,
  code,
  title,
  headerColor,
  headerText,
  fields: [
    F.date,
    F.solicitor,
    F.org,
    F.brgy,
    F.purpose,
    F.request,
    F.contact,
    F.event,
    F.remarks,
  ],
  columns: [C.date, C.name, C.org, C.purpose, C.request, C.contact, C.event],
  defaults: purposeDefault ? { purpose: purposeDefault } : undefined,
});

export const TYPES: Record<TransmittalType, TypeConfig> = {
  ngo: {
    type: 'ngo',
    label: 'CSO / NGO',
    code: 'NGO',
    title: 'TRANSMITTAL OF SOLICITATION REQUESTS – NGO',
    headerColor: '#cfe2f3',
    headerText: '#000000',
    fields: [F.date, F.solicitor, F.org, F.brgy, F.request, F.contact, F.event, F.remarks],
    columns: [C.date, { ...C.name, width: 20 }, { ...C.org, width: 26 }, C.request, C.contact, C.event],
  },
  christmas: solicitationType(
    'christmas',
    'Christmas Party',
    'NGO-CH',
    'TRANSMITTAL OF SOLICITATION REQUESTS – CHRISTMAS PARTY',
    '#ff0000',
    '#000000',
    'Christmas Party',
  ),
  barangay: solicitationType('barangay', 'Barangay', 'BRGY', 'TRANSMITTAL OF SOLICITATION REQUESTS – BARANGAY', '#d9ead3'),
  sk: solicitationType('sk', 'SK', 'SK', 'TRANSMITTAL OF SOLICITATION REQUESTS – SK', '#fff2cc'),
  medical: {
    type: 'medical',
    label: 'Medical',
    code: 'MA',
    title: 'TRANSMITTAL OF MEDICAL ASSISTANCE REQUEST',
    headerColor: '#c9daf8',
    headerText: '#000000',
    fields: [
      F.date,
      { key: 'solicitor_name', label: 'Name of the solicitor', kind: 'text', placeholder: 'Leave blank if the patient is the solicitor' },
      { key: 'patient_name', label: 'Name of the patient', kind: 'text', required: true },
      { ...F.brgy, required: true },
      { key: 'diagnosis', label: 'Diagnosis (Dx)', kind: 'text' },
      { key: 'purpose', label: 'Purpose / Request', kind: 'choice', options: MEDICAL_PURPOSE_OPTIONS, required: true },
      { key: 'assistance_spec', label: 'Assistance specification', kind: 'textarea', placeholder: 'Medicines, amount of hospital bill, therapy schedule…', full: true },
      F.contact,
      F.remarks,
    ],
    columns: [
      { ...C.date, width: 10 },
      { label: 'NAME OF PATIENT / SOLICITOR', width: 20, value: medicalName },
      { label: 'BARANGAY', width: 10, value: (e) => e.barangay ?? '' },
      { label: 'DX', width: 17, value: (e) => e.diagnosis ?? '' },
      { label: 'PURPOSE / REASON', width: 11, value: (e) => e.purpose ?? '' },
      { label: 'ASSISTANCE SPECIF.', width: 19, value: (e) => e.assistance_spec ?? '', italic: true },
      { ...C.contact, width: 11 },
    ],
  },
  personal: {
    type: 'personal',
    label: 'Personal',
    code: 'PER',
    title: 'TRANSMITTAL OF PERSONAL REQUESTS',
    headerColor: '#ead1dc',
    headerText: '#000000',
    fields: [
      F.date,
      { key: 'solicitor_name', label: 'Name', kind: 'text', required: true },
      F.org,
      F.brgy,
      { key: 'purpose', label: 'Reason', kind: 'textarea', required: true, full: true },
      F.contact,
      { key: 'remarks', label: 'Remarks (printed)', kind: 'textarea', full: true },
      { key: 'assistance_status', label: 'Status', kind: 'assistance', full: true },
    ],
    columns: [
      C.date,
      { label: 'NAME', width: 16, value: (e) => e.solicitor_name ?? '' },
      { ...C.org, width: 17 },
      { label: 'REASON', width: 18, value: (e) => e.purpose ?? '' },
      C.contact,
      { label: 'REMARKS', width: 14, value: (e) => e.remarks ?? '' },
      { label: 'STATUS', width: 11, value: assistanceText },
    ],
  },
};

export const TYPE_ORDER: TransmittalType[] = ['ngo', 'christmas', 'barangay', 'sk', 'medical', 'personal'];

export const isTransmittalType = (v: string): v is TransmittalType => (TYPE_ORDER as string[]).includes(v);
