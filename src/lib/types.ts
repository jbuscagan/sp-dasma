// Shapes of the database rows (mirror of supabase/setup.sql).

export type TransmittalType = 'ngo' | 'christmas' | 'barangay' | 'sk' | 'medical' | 'personal';
/** draft → submitted (daily) → transmitted (= PUBLISHED for the week, locked) → archived */
export type EntryStatus = 'draft' | 'submitted' | 'transmitted' | 'archived';

export interface Committee {
  id: string;
  name: string;
  spm_name: string | null;
  code_prefix: string;
  can_edit_published?: boolean; // set by the admin: may edit / delete its own published records and publish the weekly list
  can_budget?: boolean; // set by the admin: may edit the Budget module
  created_at?: string;
}

export interface Profile {
  id: string;
  email: string | null;
  encoder_name: string | null;
  position: string | null;
  requested_office: string | null;
  committee_id: string | null;
  role: 'member' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
}

export interface Entry {
  id: string;
  committee_id: string;
  type: TransmittalType;
  date_received: string;
  solicitor_name: string | null;
  patient_name: string | null;
  organization_id: string | null; // link to the organization (stored once)
  organization: string | null; // its name, shown by the view
  barangay_id: number | null; // link to the barangay (stored once)
  barangay: string | null; // its name, shown by the view
  purpose: string | null;
  request: string | null;
  request_details: string | null;
  diagnosis: string | null;
  assistance_spec: string | null;
  contact_number: string | null;
  event_date: string | null;
  remarks: string | null;
  assistance_status: 'pending' | 'received';
  assistance_date: string | null;
  status: EntryStatus;
  archived_reason: string | null;
  transmittal_id: string | null;
  attachment_paths: string[];
  position: number | null; // manual order (drag & drop / number)
  submitted_at: string | null;
  received_committee_id: string | null; // office that received the document
  received_by: string | null; // that office's name, shown by the view
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EntryInput = Partial<Omit<Entry, 'id' | 'created_at' | 'updated_at'>>;

export interface Transmittal {
  id: string;
  committee_id: string;
  type: TransmittalType;
  code: string;
  week_no: number | null;
  covering: string | null;
  transmitted_on: string;
  encoder_name: string | null;
  encoder_position: string | null;
  revision_open: boolean;
  revision_requested_at: string | null;
  revision_reason: string | null;
  created_at: string;
}

export interface Submission {
  id: string;
  committee_id: string;
  type: TransmittalType;
  submit_date: string;
  entry_count: number;
  submitted_at: string;
}

export interface Receipt {
  entry_id: string;
  committee_id: string;
  received_at: string;
}

export interface Flag {
  id: string;
  entry_id: string;
  committee_id: string;
  note: string;
  status: 'open' | 'resolved';
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** One record per organization (e.g. KBDM). The barangay / chapter is chosen on each transmittal entry. */
export interface Organization {
  id: string;
  name: string;
}
