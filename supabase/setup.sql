-- =====================================================================
-- SP DASMARIÑAS — DATABASE SETUP (the only SQL file to run)
--
--   • New Supabase project: run this file once.
--   • Existing project: run it again after every update. It is SAFE TO RUN AGAIN:
--     it never deletes your records; it only adds what is missing and puts every
--     rule and function back to the current version (it also repairs a database
--     where older files were run a second time).
--
-- How: Supabase → SQL Editor → New query → paste this whole file → Run → "Success".
-- =====================================================================

set check_function_bodies = false;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Clean-up of things older versions left behind (only on a database that
--    already uses the current design; never touches records)
-- ---------------------------------------------------------------------
do $fix$
declare v_has boolean;
begin
  -- A database from before the "names stored once" update (files 0001–0008 only) needs its data moved
  -- first; stop here with a clear message instead of half-applying anything.
  if to_regclass('public.entries') is not null and to_regclass('public.entry_list') is null then
    raise exception 'This database is from an older version. Please ask your developer for the upgrade file before running setup.sql.';
  end if;
  if to_regclass('public.entry_list') is not null then
    -- columns that older setup files may have added back (names now live in their own tables)
    alter table public.entries drop column if exists organization;
    alter table public.entries drop column if exists barangay;
    alter table public.entries drop column if exists received_by;
    alter table public.committees drop column if exists can_publish;
    alter table public.profiles drop column if exists can_budget;
    alter table public.barangay_budgets drop column if exists barangay;
  end if;
  -- the first version's "received" table, replaced by entries.received_*; removed only when empty
  if to_regclass('public.entry_receipts') is not null then
    execute 'select exists (select 1 from public.entry_receipts)' into v_has;
    if not v_has then execute 'drop table public.entry_receipts'; end if;
  end if;
  if to_regclass('public.entries') is not null then
    drop trigger if exists a_link_entry_organization on public.entries;
  end if;
  -- copied an organization's new name into every request; names are now stored once, so it is not needed
  if to_regclass('public.organizations') is not null then
    drop trigger if exists rename_organization_entries on public.organizations;
  end if;
end $fix$;
drop function if exists public.link_entry_organization();
drop function if exists public.rename_organization_entries();

-- =====================================================================
-- 1. Tables
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.barangays_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS public.committees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    spm_name text,
    spm_full_name text,
    code_prefix text DEFAULT 'SPM'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    can_edit_published boolean DEFAULT false NOT NULL,
    can_budget boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    committee_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    am_in text,
    am_out text,
    pm_in text,
    pm_out text,
    day_type text DEFAULT 'NORMAL'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid DEFAULT auth.uid(),
    committee_id uuid,
    action text NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    summary text,
    changes jsonb
);

CREATE TABLE IF NOT EXISTS public.barangay_budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    brgy_budget numeric(16,2),
    sk_budget numeric(16,2),
    remarks text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    barangay_id integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.barangays (
    id integer NOT NULL,
    name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.dtr_config (
    committee_id uuid NOT NULL,
    rules jsonb,
    settings jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    committee_id uuid NOT NULL,
    name text NOT NULL,
    "position" text,
    dept text,
    active boolean DEFAULT true NOT NULL,
    signature_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    committee_id uuid NOT NULL,
    type text NOT NULL,
    date_received date DEFAULT CURRENT_DATE NOT NULL,
    solicitor_name text,
    patient_name text,
    purpose text,
    request text,
    request_details text,
    diagnosis text,
    assistance_spec text,
    contact_number text,
    event_date text,
    remarks text,
    assistance_status text DEFAULT 'pending'::text NOT NULL,
    assistance_date date,
    status text DEFAULT 'draft'::text NOT NULL,
    archived_reason text,
    transmittal_id uuid,
    attachment_paths text[] DEFAULT '{}'::text[] NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    "position" integer,
    submitted_at timestamp with time zone,
    received_at timestamp with time zone,
    received_marked_by uuid,
    organization_id uuid,
    barangay_id integer,
    received_committee_id uuid,
    CONSTRAINT entries_assistance_status_check CHECK ((assistance_status = ANY (ARRAY['pending'::text, 'received'::text]))),
    CONSTRAINT entries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'transmitted'::text, 'archived'::text]))),
    CONSTRAINT entries_type_check CHECK ((type = ANY (ARRAY['ngo'::text, 'christmas'::text, 'barangay'::text, 'sk'::text, 'medical'::text, 'personal'::text])))
);

CREATE TABLE IF NOT EXISTS public.entry_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    committee_id uuid NOT NULL,
    raised_by uuid DEFAULT auth.uid(),
    note text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    resolution text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_flags_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])))
);

CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.entry_order (
    committee_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    "position" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.monitoring_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text DEFAULT 'CSO'::text NOT NULL,
    title text,
    week_no integer,
    covering text,
    released_on date DEFAULT CURRENT_DATE NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.monitoring_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    entry_id uuid,
    requestor text,
    association text,
    event_date text,
    contact_number text,
    amount numeric(14,2),
    given_by text,
    date_claimed date,
    remarks text,
    attachment_paths text[] DEFAULT '{}'::text[] NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    email text,
    encoder_name text,
    "position" text,
    requested_office text,
    committee_id uuid,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['member'::text, 'admin'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

CREATE TABLE IF NOT EXISTS public.publication_entries (
    publication_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.publications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    week_no integer,
    title text,
    covering text,
    date_from date,
    date_to date,
    published_on date DEFAULT ((now() AT TIME ZONE 'Asia/Manila'::text))::date NOT NULL,
    committee_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sp_contribution_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    kind text NOT NULL,
    grp text,
    label text NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    CONSTRAINT sp_contribution_lines_kind_check CHECK ((kind = ANY (ARRAY['addition'::text, 'disbursement'::text])))
);

CREATE TABLE IF NOT EXISTS public.sp_contribution_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_date date DEFAULT CURRENT_DATE NOT NULL,
    title text DEFAULT 'SP CONTRIBUTION REPORT'::text NOT NULL,
    beginning_balance numeric(14,2) DEFAULT 0 NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    committee_id uuid NOT NULL,
    type text NOT NULL,
    submit_date date DEFAULT ((now() AT TIME ZONE 'Asia/Manila'::text))::date NOT NULL,
    entry_count integer DEFAULT 0 NOT NULL,
    submitted_by uuid DEFAULT auth.uid(),
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT submissions_type_check CHECK ((type = ANY (ARRAY['ngo'::text, 'christmas'::text, 'barangay'::text, 'sk'::text, 'medical'::text, 'personal'::text])))
);

CREATE TABLE IF NOT EXISTS public.transmittals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    committee_id uuid NOT NULL,
    type text NOT NULL,
    code text NOT NULL,
    week_no integer,
    covering text,
    transmitted_on date DEFAULT CURRENT_DATE NOT NULL,
    encoder_name text,
    encoder_position text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revision_open boolean DEFAULT false NOT NULL,
    revision_requested_at timestamp with time zone,
    revision_reason text,
    revision_opened_by uuid,
    revision_opened_at timestamp with time zone,
    CONSTRAINT transmittals_type_check CHECK ((type = ANY (ARRAY['ngo'::text, 'christmas'::text, 'barangay'::text, 'sk'::text, 'medical'::text, 'personal'::text])))
);

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;

ALTER SEQUENCE public.barangays_id_seq OWNED BY public.barangays.id;

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);

ALTER TABLE ONLY public.barangays ALTER COLUMN id SET DEFAULT nextval('public.barangays_id_seq'::regclass);

-- columns added after the first version (an existing database gets them here)
ALTER TABLE public.committees ADD COLUMN IF NOT EXISTS spm_full_name text;  -- e.g. Robin Chester J. Cantimbuhan ("Received by")

-- =====================================================================
-- 2. Keys and links between tables
-- =====================================================================
DO $c$ BEGIN
  ALTER TABLE ONLY public.attendance
      ADD CONSTRAINT attendance_employee_id_work_date_key UNIQUE (employee_id, work_date);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.attendance
      ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.audit_log
      ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.barangay_budgets
      ADD CONSTRAINT barangay_budgets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.barangays
      ADD CONSTRAINT barangays_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.barangays
      ADD CONSTRAINT barangays_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.committees
      ADD CONSTRAINT committees_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.committees
      ADD CONSTRAINT committees_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.dtr_config
      ADD CONSTRAINT dtr_config_pkey PRIMARY KEY (committee_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.employees
      ADD CONSTRAINT employees_committee_id_name_key UNIQUE (committee_id, name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.employees
      ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entries
      ADD CONSTRAINT entries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entry_flags
      ADD CONSTRAINT entry_flags_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entry_order
      ADD CONSTRAINT entry_order_pkey PRIMARY KEY (committee_id, entry_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.monitoring_batches
      ADD CONSTRAINT monitoring_batches_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.monitoring_items
      ADD CONSTRAINT monitoring_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.organizations
      ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.profiles
      ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.publication_entries
      ADD CONSTRAINT publication_entries_pkey PRIMARY KEY (publication_id, entry_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.publications
      ADD CONSTRAINT publications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.sp_contribution_lines
      ADD CONSTRAINT sp_contribution_lines_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.sp_contribution_reports
      ADD CONSTRAINT sp_contribution_reports_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.submissions
      ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.transmittals
      ADD CONSTRAINT transmittals_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.attendance
      ADD CONSTRAINT attendance_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.attendance
      ADD CONSTRAINT attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.audit_log
      ADD CONSTRAINT audit_log_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.audit_log
      ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.barangay_budgets
      ADD CONSTRAINT barangay_budgets_barangay_id_fkey FOREIGN KEY (barangay_id) REFERENCES public.barangays(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.dtr_config
      ADD CONSTRAINT dtr_config_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.employees
      ADD CONSTRAINT employees_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entries
      ADD CONSTRAINT entries_barangay_id_fkey FOREIGN KEY (barangay_id) REFERENCES public.barangays(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entries
      ADD CONSTRAINT entries_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entries
      ADD CONSTRAINT entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entries
      ADD CONSTRAINT entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entries
      ADD CONSTRAINT entries_received_committee_id_fkey FOREIGN KEY (received_committee_id) REFERENCES public.committees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entries
      ADD CONSTRAINT entries_received_marked_by_fkey FOREIGN KEY (received_marked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entries
      ADD CONSTRAINT entries_transmittal_id_fkey FOREIGN KEY (transmittal_id) REFERENCES public.transmittals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entries
      ADD CONSTRAINT entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entry_flags
      ADD CONSTRAINT entry_flags_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entry_flags
      ADD CONSTRAINT entry_flags_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entry_flags
      ADD CONSTRAINT entry_flags_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entry_flags
      ADD CONSTRAINT entry_flags_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entry_order
      ADD CONSTRAINT entry_order_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.entry_order
      ADD CONSTRAINT entry_order_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.monitoring_batches
      ADD CONSTRAINT monitoring_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.monitoring_items
      ADD CONSTRAINT monitoring_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.monitoring_batches(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.monitoring_items
      ADD CONSTRAINT monitoring_items_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.organizations
      ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.profiles
      ADD CONSTRAINT profiles_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.profiles
      ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.publication_entries
      ADD CONSTRAINT publication_entries_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.publication_entries
      ADD CONSTRAINT publication_entries_publication_id_fkey FOREIGN KEY (publication_id) REFERENCES public.publications(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.publications
      ADD CONSTRAINT publications_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.publications
      ADD CONSTRAINT publications_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.sp_contribution_lines
      ADD CONSTRAINT sp_contribution_lines_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.sp_contribution_reports(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.sp_contribution_reports
      ADD CONSTRAINT sp_contribution_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.submissions
      ADD CONSTRAINT submissions_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.submissions
      ADD CONSTRAINT submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.transmittals
      ADD CONSTRAINT transmittals_committee_id_fkey FOREIGN KEY (committee_id) REFERENCES public.committees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.transmittals
      ADD CONSTRAINT transmittals_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

DO $c$ BEGIN
  ALTER TABLE ONLY public.transmittals
      ADD CONSTRAINT transmittals_revision_opened_by_fkey FOREIGN KEY (revision_opened_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;

-- =====================================================================
-- 3. Indexes (fast searching)
-- =====================================================================
CREATE INDEX IF NOT EXISTS attendance_committee_date ON public.attendance USING btree (committee_id, work_date);

CREATE INDEX IF NOT EXISTS audit_log_at ON public.audit_log USING btree (at DESC);

CREATE INDEX IF NOT EXISTS audit_log_committee ON public.audit_log USING btree (committee_id, at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS barangay_budgets_year_barangay ON public.barangay_budgets USING btree (year, barangay_id);

CREATE UNIQUE INDEX IF NOT EXISTS barangays_name_ci ON public.barangays USING btree (lower(btrim(name)));

CREATE INDEX IF NOT EXISTS entries_barangay ON public.entries USING btree (barangay_id);

CREATE INDEX IF NOT EXISTS entries_committee_type_status ON public.entries USING btree (committee_id, type, status);

CREATE INDEX IF NOT EXISTS entries_contact ON public.entries USING btree (contact_number);

CREATE INDEX IF NOT EXISTS entries_organization ON public.entries USING btree (organization_id);

CREATE INDEX IF NOT EXISTS entries_status_date ON public.entries USING btree (status, date_received);

CREATE INDEX IF NOT EXISTS monitoring_items_batch ON public.monitoring_items USING btree (batch_id, sort);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_ci ON public.organizations USING btree (lower(btrim(name)));

CREATE INDEX IF NOT EXISTS submissions_date ON public.submissions USING btree (type, submit_date);

-- =====================================================================
-- 4. Functions (rules and actions that run inside the database)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.audit_committees() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  msg text := '';
begin
  if new.can_edit_published is distinct from old.can_edit_published then
    msg := msg || case when new.can_edit_published then ' · may edit/delete/publish' else ' · published records locked' end;
  end if;
  if new.can_budget is distinct from old.can_budget then
    msg := msg || case when new.can_budget then ' · budget access given' else ' · budget access removed' end;
  end if;
  if msg <> '' then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.id, 'permission', 'committees', new.id, new.name || msg);
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.audit_entries() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_action text;
  v_changes jsonb;
  skip text[] := array['updated_at', 'updated_by', 'created_at'];
begin
  -- bulk clean-ups (Admin › Remove barangays / organizations) write one summary line instead
  if current_setting('app.skip_entry_audit', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.committee_id, 'create', 'entries', new.id, coalesce(new.patient_name, new.solicitor_name) || ' (' || new.type || ')');
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (committee_id, action, table_name, record_id, summary, changes)
    values (old.committee_id, 'delete', 'entries', old.id, coalesce(old.patient_name, old.solicitor_name) || ' (' || old.type || ')', to_jsonb(old));
    return old;
  end if;

  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)) into v_changes
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
   where n.value is distinct from o.value and not (n.key = any (skip));
  if v_changes is null then
    return new;
  end if;

  v_action := case
    when new.status is distinct from old.status and new.status = 'submitted' then 'submit'
    when new.status is distinct from old.status and new.status = 'transmitted' then 'publish'
    when new.status is distinct from old.status and new.status = 'archived' then 'archive'
    when new.status is distinct from old.status and old.status = 'archived' then 'restore'
    when new.status is distinct from old.status and new.status = 'draft' then 'unpublish'
    when (v_changes - array['received_committee_id', 'received_at', 'received_marked_by']) = '{}'::jsonb then 'received'
    when (v_changes - array['position']) = '{}'::jsonb then null   -- reordering is not logged
    else 'edit' end;
  if v_action is null then
    return new;
  end if;
  insert into audit_log (committee_id, action, table_name, record_id, summary, changes)
  values (new.committee_id, v_action, 'entries', new.id, coalesce(new.patient_name, new.solicitor_name) || ' (' || new.type || ')', v_changes);
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.audit_transmittals() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.committee_id, 'publish', 'transmittals', new.id, new.code);
  elsif tg_op = 'DELETE' then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (old.committee_id, 'unpublish', 'transmittals', old.id, old.code);
    return old;
  elsif new.revision_open is distinct from old.revision_open or new.revision_requested_at is distinct from old.revision_requested_at then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.committee_id, 'revision', 'transmittals', new.id,
      new.code || case when new.revision_open then ': revision allowed'
                       when new.revision_requested_at is not null then ': revision requested — ' || coalesce(new.revision_reason, '')
                       else ': locked again' end);
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.barangay_id_of(p_name text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.find_barangay(p_name);
$$;

CREATE OR REPLACE FUNCTION public.can_budget() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from profiles p left join committees c on c.id = p.committee_id
     where p.id = auth.uid() and p.status = 'approved'
       and (p.role = 'admin' or coalesce(c.can_budget, false))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_publish_week() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.is_admin() or coalesce((select can_edit_published from committees where id = public.my_committee()), false);
$$;

CREATE OR REPLACE FUNCTION public.entry_list_write() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare
  v_row jsonb;
  v_id uuid;
  v_cols text;
  s record;
  t record;
  v_org text;
  v_brgy int;
begin
  if tg_op = 'DELETE' then
    delete from entries where id = old.id;
    return old;
  end if;

  if tg_op = 'INSERT' or new.organization is distinct from old.organization or new.barangay is distinct from old.barangay then
    s := split_org_barangay(new.organization);
    v_org := s.org;
    v_brgy := null;
    if nullif(btrim(coalesce(new.barangay, '')), '') is not null then
      v_brgy := find_barangay(new.barangay);
      if v_brgy is null then
        -- "KBDM - Salitran IV" typed in the Barangay box
        t := split_org_barangay(new.barangay);
        if t.barangay_id is null then
          raise exception 'Barangay "%" is not in the barangay list. Choose one from the list (an administrator can add missing barangays in Admin › Barangays & organizations).', btrim(new.barangay)
            using errcode = 'check_violation';
        end if;
        v_brgy := t.barangay_id;
        v_org := coalesce(v_org, t.org);
      end if;
    end if;
    new.barangay_id := coalesce(v_brgy, s.barangay_id);
    new.organization_id := organization_id_of(v_org);
  end if;

  if tg_op = 'INSERT' then
    new.id := coalesce(new.id, gen_random_uuid());
    new.date_received := coalesce(new.date_received, current_date);
    new.status := coalesce(new.status, 'draft');
    new.assistance_status := coalesce(new.assistance_status, 'pending');
    new.attachment_paths := coalesce(new.attachment_paths, '{}');
    new.created_by := coalesce(new.created_by, auth.uid());
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
  end if;

  v_row := to_jsonb(new) - 'organization' - 'barangay' - 'received_by';
  if tg_op = 'INSERT' then
    insert into entries select * from jsonb_populate_record(null::entries, v_row) returning id into v_id;
  else
    select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
      from pg_attribute where attrelid = 'public.entries'::regclass and attnum > 0 and not attisdropped;
    execute format('update entries set (%1$s) = (select %1$s from jsonb_populate_record(null::entries, $1)) where id = $2', v_cols)
      using v_row, old.id;
    v_id := old.id;
  end if;

  select * into new from entry_list where id = v_id;
  return new;
end $_$;

CREATE OR REPLACE FUNCTION public.find_barangay(p text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from barangays
   where nullif(btrim(coalesce(p, '')), '') is not null and place_key(name) = place_key(p)
   order by id limit 1;
$$;

CREATE OR REPLACE FUNCTION public.guard_committee_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.can_edit_published is distinct from old.can_edit_published
          or new.can_budget is distinct from old.can_budget) then
    raise exception 'Only an administrator can change office permissions.';
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.guard_locked_entries() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  is_open boolean;
  free text[] := array['position', 'received_committee_id', 'received_at', 'received_marked_by', 'updated_at', 'updated_by'];
begin
  if old.status <> 'transmitted' or auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if old.committee_id = public.my_committee() and public.office_can_edit_published() then
    return new;
  end if;
  select revision_open into is_open from transmittals where id = old.transmittal_id;
  if coalesce(is_open, false) then
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'This record is published and locked. Ask an administrator for permission to edit published records.';
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.guard_profile_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.committee_id is distinct from old.committee_id then
      raise exception 'Only an administrator can change role, status or committee.';
    end if;
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.guard_transmittal_revision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is not null and not public.is_admin()
     and new.revision_open and not coalesce(old.revision_open, false) then
    raise exception 'Only an administrator can allow revisions of a published transmittal.';
  end if;
  if new.revision_open and not coalesce(old.revision_open, false) then
    new.revision_opened_by := auth.uid();
    new.revision_opened_at := now();
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, encoder_name, position, requested_office)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'encoder_name',
    new.raw_user_meta_data ->> 'position',
    new.raw_user_meta_data ->> 'requested_office'
  );
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved' and role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_approved() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved');
$$;

CREATE OR REPLACE FUNCTION public.log_publication(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into audit_log (committee_id, action, table_name, record_id, summary)
  select p.committee_id, 'publish', 'publications', p.id,
         coalesce(p.title, 'Weekly list') || ' ' || coalesce(p.covering, '') || ' — '
         || (select count(*) from publication_entries pe where pe.publication_id = p.id) || ' record(s)'
    from publications p
   where p.id = p_id and p.created_by = auth.uid();   -- only for a list the caller just made
end $$;

CREATE OR REPLACE FUNCTION public.merge_barangays(p_from integer, p_into integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can merge barangays.';
  end if;
  if p_from = p_into or not exists (select 1 from barangays where id = p_into) then
    raise exception 'Choose two different barangays.';
  end if;
  update entries set barangay_id = p_into where barangay_id = p_from; -- admins may change locked records
  update barangay_budgets bb set barangay_id = p_into
   where bb.barangay_id = p_from and not exists (select 1 from barangay_budgets x where x.year = bb.year and x.barangay_id = p_into);
  delete from barangay_budgets where barangay_id = p_from;
  delete from barangays where id = p_from;
end $$;

CREATE OR REPLACE FUNCTION public.merge_organizations(p_from uuid, p_into uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can merge organizations.';
  end if;
  if p_from = p_into or not exists (select 1 from organizations where id = p_into) then
    raise exception 'Choose two different organizations.';
  end if;
  update entries set organization_id = p_into where organization_id = p_from;
  delete from organizations where id = p_from;
end $$;

CREATE OR REPLACE FUNCTION public.my_committee() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select committee_id from profiles where id = auth.uid() and status = 'approved';
$$;

CREATE OR REPLACE FUNCTION public.office_can_edit_published() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select can_edit_published from committees where id = public.my_committee()), false);
$$;

CREATE OR REPLACE FUNCTION public.office_short_name(c public.committees) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(
    'SPM ' || nullif(btrim(c.spm_full_name), ''),                                          -- SPM Robin Chester J. Cantimbuhan
    nullif(btrim(regexp_replace(c.name, '^\s*office\s+of\s+(the\s+)?', '', 'i')), ''),  -- "Office of SPM Robin Cantimbuhan" → SPM Robin Cantimbuhan
    'SPM ' || nullif(btrim(c.spm_name), ''),
    c.name);
$$;

CREATE OR REPLACE FUNCTION public.organization_id_of(p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then return null; end if;
  select id into v_id from organizations where lower(btrim(name)) = lower(btrim(p_name));
  if v_id is null then
    insert into organizations (name) values (btrim(p_name)) returning id into v_id;
  end if;
  return v_id;
end $$;

CREATE OR REPLACE FUNCTION public.place_key(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select btrim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(translate(lower(' ' || coalesce(p, '') || ' '), 'ñáàéèíìóòúü', 'naaeeiioouu'),
            '\m(barangay|brgy|bgy)\M\.?', ' ', 'g'),
          '\msta\.?\s', ' santa ', 'g'),
        '\msto\.?\s', ' santo ', 'g'),
      '[^a-z0-9]+', ' ', 'g'),
    '\m1\M', 'i', 'g'), '\m2\M', 'ii', 'g'), '\m3\M', 'iii', 'g'), '\m4\M', 'iv', 'g'), '\m5\M', 'v', 'g'),
    '\s+', ' ', 'g'));
$$;

-- (older version without p_basis)
DROP FUNCTION IF EXISTS public.publish_week(text, text, integer, date, date, uuid[]);

CREATE OR REPLACE FUNCTION public.publish_week(p_title text, p_covering text, p_week integer, p_from date, p_to date, p_entry_ids uuid[], p_basis text DEFAULT 'received') RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
-- Weekly combined list of all offices. Only transmitted records whose date is inside From–To:
-- p_basis 'received' = date received, 'transmitted' = the date the office transmitted them.
declare
  v_id uuid;
begin
  if not public.can_publish_week() then
    raise exception 'Only an administrator or an office allowed to publish can do this.';
  end if;
  insert into publications (title, covering, week_no, date_from, date_to, committee_id)
  values (p_title, p_covering, p_week, p_from, p_to, public.my_committee())
  returning id into v_id;
  insert into publication_entries (publication_id, entry_id, position)
  select v_id, x.id, row_number() over (order by x.ord)
    from unnest(p_entry_ids) with ordinality as x(id, ord)
    join entries e on e.id = x.id and e.status = 'transmitted'
    left join transmittals t on t.id = e.transmittal_id
   where case when p_basis = 'transmitted' then t.transmitted_on else e.date_received end between p_from and p_to
     and not exists (select 1 from publication_entries pe where pe.entry_id = e.id and pe.publication_id <> v_id); -- published once only
  if not exists (select 1 from publication_entries where publication_id = v_id) then
    raise exception 'None of these records can be published: they are outside % – % or were already published.', p_from, p_to;
  end if;
  perform public.log_publication(v_id);
  return v_id;
end $$;

-- Admin › Offices: delete an office only when nothing uses it (e.g. an empty row added by mistake).
CREATE OR REPLACE FUNCTION public.remove_office(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n int;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can delete offices.';
  end if;
  select (select count(*) from profiles where committee_id = p_id)
       + (select count(*) from entries where committee_id = p_id)
       + (select count(*) from transmittals where committee_id = p_id)
       + (select count(*) from employees where committee_id = p_id)
    into n;
  if n > 0 then
    raise exception 'This office still has accounts, requests or employees, so it cannot be deleted.';
  end if;
  delete from committees where id = p_id;
end $$;

CREATE OR REPLACE FUNCTION public.reorder_entries(p_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  update entries e set position = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where e.id = x.id and e.committee_id = public.my_committee();
end $$;

CREATE OR REPLACE FUNCTION public.save_barangay_budget(p_year integer, p_barangay text, p_brgy numeric, p_sk numeric, p_remarks text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare v_b int := find_barangay(p_barangay);
begin
  if v_b is null then
    raise exception 'Barangay "%" is not in the barangay list.', p_barangay using errcode = 'check_violation';
  end if;
  insert into barangay_budgets (year, barangay_id, brgy_budget, sk_budget, remarks, updated_at)
  values (p_year, v_b, p_brgy, p_sk, p_remarks, now())
  on conflict (year, barangay_id) do update
    set brgy_budget = excluded.brgy_budget, sk_budget = excluded.sk_budget, remarks = excluded.remarks, updated_at = now();
end $$;

CREATE OR REPLACE FUNCTION public.set_entry_order(p_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  insert into entry_order (committee_id, entry_id, position)
  select public.my_committee(), x.id, x.ord from unnest(p_ids) with ordinality as x(id, ord)
  on conflict (committee_id, entry_id) do update set position = excluded.position;
end $$;

CREATE OR REPLACE FUNCTION public.split_org_barangay(p text, p_skip integer DEFAULT NULL::integer, OUT org text, OUT barangay_id integer) RETURNS record
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  t text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
  m text[];
  b int;
begin
  org := nullif(t, '');
  barangay_id := null;
  if org is null then return; end if;
  -- "Org - Barangay" / "Org – Barangay" / "Org, Barangay" / "Org (Barangay)"
  m := regexp_match(t, '^(.+?)\s*(?:\s[-–—]\s|,|\()\s*([^,()]+?)\)?$');
  if m is not null then
    b := find_barangay(m[2]);
    if b is not null and b is distinct from p_skip then
      org := nullif(btrim(m[1], ' -–—,'), ''); barangay_id := b; return;
    end if;
  end if;
  -- "Org of Brgy. Barangay" / "Org ng Barangay X" / "Org Brgy. X"
  m := regexp_match(t, '^(.+?)\s+(?:(?:of|ng|sa)\s+)?(?:barangay|brgy\.?|bgy\.?)\s+(.+)$', 'i');
  if m is not null then
    b := find_barangay(m[2]);
    if b is not null and b is distinct from p_skip then
      org := nullif(btrim(m[1], ' -–—,'), ''); barangay_id := b; return;
    end if;
  end if;
  -- the whole text is a barangay
  b := find_barangay(t);
  if b is not null and b is distinct from p_skip then
    org := null; barangay_id := b;
  end if;
end $_$;

CREATE OR REPLACE FUNCTION public.submit_entries(p_type text) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_committee uuid := public.my_committee();
  v_count int;
begin
  if v_committee is null then
    raise exception 'Your account is not approved or has no committee yet.';
  end if;
  update entries set status = 'submitted', submitted_at = now()
   where committee_id = v_committee and type = p_type and status = 'draft';
  get diagnostics v_count = row_count;
  insert into submissions (committee_id, type, entry_count) values (v_committee, p_type, v_count);
  return v_count;
end $$;

CREATE OR REPLACE FUNCTION public.touch_updated() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.transmit_entries(p_type text, p_code text, p_week integer, p_covering text, p_date date, p_encoder_name text, p_encoder_position text, p_entry_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
-- Transmit = "done for this week": the requests are locked and listed in History › Transmitted.
-- Only ONE transmittal per office, type and week: transmitting again in the same week adds to it.
declare
  v_id uuid;
  v_committee uuid := public.my_committee();
  v_date date := coalesce(p_date, current_date);
  v_count int;
begin
  if v_committee is null then
    raise exception 'Your account is not approved or has no committee yet.';
  end if;
  select id into v_id from transmittals
   where committee_id = v_committee and type = p_type and week_no = p_week
     and extract(year from transmitted_on) = extract(year from v_date)
   order by created_at limit 1;
  if v_id is null then
    insert into transmittals (committee_id, type, code, week_no, covering, transmitted_on, encoder_name, encoder_position)
    values (v_committee, p_type, p_code, p_week, p_covering, v_date, p_encoder_name, p_encoder_position)
    returning id into v_id;
  else
    update transmittals
       set covering = coalesce(nullif(p_covering, ''), covering),
           transmitted_on = greatest(transmitted_on, v_date),
           encoder_name = coalesce(nullif(p_encoder_name, ''), encoder_name),
           encoder_position = coalesce(nullif(p_encoder_position, ''), encoder_position)
     where id = v_id;
  end if;
  update entries set status = 'transmitted', transmittal_id = v_id
   where id = any (p_entry_ids) and committee_id = v_committee and type = p_type and status in ('draft', 'submitted');
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'None of the selected entries could be transmitted (already transmitted or not yours).';
  end if;
  return v_id;
end $$;

-- Admin › Barangays & organizations: remove some (p_ids) or ALL (p_ids = null).
-- Requests that used them keep everything else and simply show no barangay / organization.
CREATE OR REPLACE FUNCTION public.remove_barangays(p_ids integer[] DEFAULT NULL) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
  touched int;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can remove barangays.';
  end if;
  perform set_config('app.skip_entry_audit', 'on', true);
  update entries set barangay_id = null where barangay_id is not null and (p_ids is null or barangay_id = any (p_ids));
  get diagnostics touched = row_count;
  perform set_config('app.skip_entry_audit', 'off', true);
  delete from barangay_budgets where p_ids is null or barangay_id = any (p_ids);
  delete from barangays where p_ids is null or id = any (p_ids);
  get diagnostics n = row_count;
  insert into audit_log (committee_id, action, table_name, summary)
  values (public.my_committee(), 'delete', 'barangays',
          case when p_ids is null then 'Removed ALL barangays' else 'Removed ' || n || ' barangay(s)' end || ' · ' || touched || ' request(s) now without barangay');
  return n;
end $$;

CREATE OR REPLACE FUNCTION public.remove_organizations(p_ids uuid[] DEFAULT NULL) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
  touched int;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can remove organizations.';
  end if;
  perform set_config('app.skip_entry_audit', 'on', true);
  update entries set organization_id = null where organization_id is not null and (p_ids is null or organization_id = any (p_ids));
  get diagnostics touched = row_count;
  perform set_config('app.skip_entry_audit', 'off', true);
  delete from organizations where p_ids is null or id = any (p_ids);
  get diagnostics n = row_count;
  insert into audit_log (committee_id, action, table_name, summary)
  values (public.my_committee(), 'delete', 'organizations',
          case when p_ids is null then 'Removed ALL organizations' else 'Removed ' || n || ' organization(s)' end || ' · ' || touched || ' request(s) now without organization');
  return n;
end $$;

-- =====================================================================
-- 5. The view the website reads requests from (names next to ids)
-- =====================================================================
CREATE OR REPLACE VIEW public.entry_list WITH (security_invoker='true') AS
 SELECT e.id,
    e.committee_id,
    e.type,
    e.date_received,
    e.solicitor_name,
    e.patient_name,
    e.purpose,
    e.request,
    e.request_details,
    e.diagnosis,
    e.assistance_spec,
    e.contact_number,
    e.event_date,
    e.remarks,
    e.assistance_status,
    e.assistance_date,
    e.status,
    e.archived_reason,
    e.transmittal_id,
    e.attachment_paths,
    e.created_by,
    e.updated_by,
    e.created_at,
    e.updated_at,
    e."position",
    e.submitted_at,
    e.received_at,
    e.received_marked_by,
    e.organization_id,
    e.barangay_id,
    e.received_committee_id,
    o.name AS organization,
    b.name AS barangay,
    public.office_short_name(rc.*) AS received_by
   FROM (((public.entries e
     LEFT JOIN public.organizations o ON ((o.id = e.organization_id)))
     LEFT JOIN public.barangays b ON ((b.id = e.barangay_id)))
     LEFT JOIN public.committees rc ON ((rc.id = e.received_committee_id)));

ALTER TABLE ONLY public.entry_list ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE ONLY public.entry_list ALTER COLUMN date_received SET DEFAULT CURRENT_DATE;

ALTER TABLE ONLY public.entry_list ALTER COLUMN assistance_status SET DEFAULT 'pending'::text;

ALTER TABLE ONLY public.entry_list ALTER COLUMN status SET DEFAULT 'draft'::text;

ALTER TABLE ONLY public.entry_list ALTER COLUMN attachment_paths SET DEFAULT '{}'::text[];

ALTER TABLE ONLY public.entry_list ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE ONLY public.entry_list ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.entry_list ALTER COLUMN updated_at SET DEFAULT now();

-- =====================================================================
-- 6. Triggers (checks, activity log, automatic links)
-- =====================================================================
DROP TRIGGER IF EXISTS audit_committees ON public.committees;
CREATE TRIGGER audit_committees AFTER UPDATE ON public.committees FOR EACH ROW EXECUTE FUNCTION public.audit_committees();

DROP TRIGGER IF EXISTS audit_entries ON public.entries;
CREATE TRIGGER audit_entries AFTER INSERT OR DELETE OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.audit_entries();

DROP TRIGGER IF EXISTS audit_transmittals ON public.transmittals;
CREATE TRIGGER audit_transmittals AFTER INSERT OR DELETE OR UPDATE ON public.transmittals FOR EACH ROW EXECUTE FUNCTION public.audit_transmittals();

DROP TRIGGER IF EXISTS entries_touch ON public.entries;
CREATE TRIGGER entries_touch BEFORE UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated();

DROP TRIGGER IF EXISTS entry_list_write ON public.entry_list;
CREATE TRIGGER entry_list_write INSTEAD OF INSERT OR DELETE OR UPDATE ON public.entry_list FOR EACH ROW EXECUTE FUNCTION public.entry_list_write();

DROP TRIGGER IF EXISTS guard_committee_update ON public.committees;
CREATE TRIGGER guard_committee_update BEFORE UPDATE ON public.committees FOR EACH ROW EXECUTE FUNCTION public.guard_committee_update();

DROP TRIGGER IF EXISTS guard_locked_entries ON public.entries;
CREATE TRIGGER guard_locked_entries BEFORE UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.guard_locked_entries();

DROP TRIGGER IF EXISTS guard_profile_update ON public.profiles;
CREATE TRIGGER guard_profile_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

DROP TRIGGER IF EXISTS guard_transmittal_revision ON public.transmittals;
CREATE TRIGGER guard_transmittal_revision BEFORE UPDATE ON public.transmittals FOR EACH ROW EXECUTE FUNCTION public.guard_transmittal_revision();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 7. Security: who may see and change what (Row Level Security)
-- =====================================================================
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.barangay_budgets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.barangays ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.committees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dtr_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.entry_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.entry_order ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monitoring_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monitoring_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.publication_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sp_contribution_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sp_contribution_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.transmittals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_all ON public.attendance;
CREATE POLICY attendance_all ON public.attendance USING (((committee_id = public.my_committee()) OR public.is_admin())) WITH CHECK (((committee_id = public.my_committee()) OR public.is_admin()));

DROP POLICY IF EXISTS audit_read ON public.audit_log;
CREATE POLICY audit_read ON public.audit_log FOR SELECT USING ((public.is_admin() OR (committee_id = public.my_committee())));

DROP POLICY IF EXISTS barangay_budgets_delete ON public.barangay_budgets;
CREATE POLICY barangay_budgets_delete ON public.barangay_budgets FOR DELETE USING (public.can_budget());

DROP POLICY IF EXISTS barangay_budgets_insert ON public.barangay_budgets;
CREATE POLICY barangay_budgets_insert ON public.barangay_budgets FOR INSERT WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS barangay_budgets_read ON public.barangay_budgets;
CREATE POLICY barangay_budgets_read ON public.barangay_budgets FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS barangay_budgets_update ON public.barangay_budgets;
CREATE POLICY barangay_budgets_update ON public.barangay_budgets FOR UPDATE USING (public.can_budget()) WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS barangays_admin ON public.barangays;
CREATE POLICY barangays_admin ON public.barangays USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS barangays_read ON public.barangays;
CREATE POLICY barangays_read ON public.barangays FOR SELECT USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS committees_admin ON public.committees;
CREATE POLICY committees_admin ON public.committees USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS committees_own_update ON public.committees;
CREATE POLICY committees_own_update ON public.committees FOR UPDATE USING ((id = public.my_committee())) WITH CHECK ((id = public.my_committee()));

DROP POLICY IF EXISTS committees_read ON public.committees;
CREATE POLICY committees_read ON public.committees FOR SELECT USING (true);

DROP POLICY IF EXISTS dtr_config_all ON public.dtr_config;
CREATE POLICY dtr_config_all ON public.dtr_config USING (((committee_id = public.my_committee()) OR public.is_admin())) WITH CHECK (((committee_id = public.my_committee()) OR public.is_admin()));

DROP POLICY IF EXISTS employees_all ON public.employees;
CREATE POLICY employees_all ON public.employees USING (((committee_id = public.my_committee()) OR public.is_admin())) WITH CHECK (((committee_id = public.my_committee()) OR public.is_admin()));

DROP POLICY IF EXISTS entries_delete ON public.entries;
CREATE POLICY entries_delete ON public.entries FOR DELETE USING ((public.is_admin() OR ((committee_id = public.my_committee()) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text]))) OR ((committee_id = public.my_committee()) AND (status = ANY (ARRAY['transmitted'::text, 'archived'::text])) AND public.office_can_edit_published())));

DROP POLICY IF EXISTS entries_insert ON public.entries;
CREATE POLICY entries_insert ON public.entries FOR INSERT WITH CHECK ((committee_id = public.my_committee()));

DROP POLICY IF EXISTS entries_read ON public.entries;
CREATE POLICY entries_read ON public.entries FOR SELECT USING (((committee_id = public.my_committee()) OR ((type <> 'personal'::text) AND (public.is_admin() OR (public.is_approved() AND (status = ANY (ARRAY['submitted'::text, 'transmitted'::text])))))));

DROP POLICY IF EXISTS entries_update ON public.entries;
CREATE POLICY entries_update ON public.entries FOR UPDATE USING (((committee_id = public.my_committee()) OR (public.is_admin() AND (type <> 'personal'::text)))) WITH CHECK (((committee_id = public.my_committee()) OR (public.is_admin() AND (type <> 'personal'::text))));

DROP POLICY IF EXISTS entry_order_own ON public.entry_order;
CREATE POLICY entry_order_own ON public.entry_order USING ((committee_id = public.my_committee())) WITH CHECK ((committee_id = public.my_committee()));

DROP POLICY IF EXISTS flags_delete ON public.entry_flags;
CREATE POLICY flags_delete ON public.entry_flags FOR DELETE USING (((committee_id = public.my_committee()) OR public.is_admin()));

DROP POLICY IF EXISTS flags_insert ON public.entry_flags;
CREATE POLICY flags_insert ON public.entry_flags FOR INSERT WITH CHECK ((committee_id = public.my_committee()));

DROP POLICY IF EXISTS flags_read ON public.entry_flags;
CREATE POLICY flags_read ON public.entry_flags FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS flags_update ON public.entry_flags;
CREATE POLICY flags_update ON public.entry_flags FOR UPDATE USING ((public.is_admin() OR (committee_id = public.my_committee()) OR (EXISTS ( SELECT 1
   FROM public.entries e
  WHERE ((e.id = entry_flags.entry_id) AND (e.committee_id = public.my_committee()))))));

DROP POLICY IF EXISTS monitoring_batches_delete ON public.monitoring_batches;
CREATE POLICY monitoring_batches_delete ON public.monitoring_batches FOR DELETE USING (public.can_budget());

DROP POLICY IF EXISTS monitoring_batches_insert ON public.monitoring_batches;
CREATE POLICY monitoring_batches_insert ON public.monitoring_batches FOR INSERT WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS monitoring_batches_read ON public.monitoring_batches;
CREATE POLICY monitoring_batches_read ON public.monitoring_batches FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS monitoring_batches_update ON public.monitoring_batches;
CREATE POLICY monitoring_batches_update ON public.monitoring_batches FOR UPDATE USING (public.can_budget()) WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS monitoring_items_delete ON public.monitoring_items;
CREATE POLICY monitoring_items_delete ON public.monitoring_items FOR DELETE USING (public.can_budget());

DROP POLICY IF EXISTS monitoring_items_insert ON public.monitoring_items;
CREATE POLICY monitoring_items_insert ON public.monitoring_items FOR INSERT WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS monitoring_items_read ON public.monitoring_items;
CREATE POLICY monitoring_items_read ON public.monitoring_items FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS monitoring_items_update ON public.monitoring_items;
CREATE POLICY monitoring_items_update ON public.monitoring_items FOR UPDATE USING (public.can_budget()) WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS orgs_admin ON public.organizations;
CREATE POLICY orgs_admin ON public.organizations USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS orgs_insert ON public.organizations;
CREATE POLICY orgs_insert ON public.organizations FOR INSERT WITH CHECK (public.is_approved());

DROP POLICY IF EXISTS orgs_read ON public.organizations;
CREATE POLICY orgs_read ON public.organizations FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS profiles_admin ON public.profiles;
CREATE POLICY profiles_admin ON public.profiles USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read ON public.profiles FOR SELECT USING (((id = auth.uid()) OR public.is_admin() OR (public.is_approved() AND (status = 'approved'::text))));

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

DROP POLICY IF EXISTS publication_entries_delete ON public.publication_entries;
CREATE POLICY publication_entries_delete ON public.publication_entries FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS publication_entries_insert ON public.publication_entries;
CREATE POLICY publication_entries_insert ON public.publication_entries FOR INSERT WITH CHECK (public.can_publish_week());

DROP POLICY IF EXISTS publication_entries_read ON public.publication_entries;
CREATE POLICY publication_entries_read ON public.publication_entries FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS publications_delete ON public.publications;
CREATE POLICY publications_delete ON public.publications FOR DELETE USING (public.can_publish_week());

DROP POLICY IF EXISTS publications_insert ON public.publications;
CREATE POLICY publications_insert ON public.publications FOR INSERT WITH CHECK (public.can_publish_week());

DROP POLICY IF EXISTS publications_read ON public.publications;
CREATE POLICY publications_read ON public.publications FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS sp_contribution_lines_delete ON public.sp_contribution_lines;
CREATE POLICY sp_contribution_lines_delete ON public.sp_contribution_lines FOR DELETE USING (public.can_budget());

DROP POLICY IF EXISTS sp_contribution_lines_insert ON public.sp_contribution_lines;
CREATE POLICY sp_contribution_lines_insert ON public.sp_contribution_lines FOR INSERT WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS sp_contribution_lines_read ON public.sp_contribution_lines;
CREATE POLICY sp_contribution_lines_read ON public.sp_contribution_lines FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS sp_contribution_lines_update ON public.sp_contribution_lines;
CREATE POLICY sp_contribution_lines_update ON public.sp_contribution_lines FOR UPDATE USING (public.can_budget()) WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS sp_contribution_reports_delete ON public.sp_contribution_reports;
CREATE POLICY sp_contribution_reports_delete ON public.sp_contribution_reports FOR DELETE USING (public.can_budget());

DROP POLICY IF EXISTS sp_contribution_reports_insert ON public.sp_contribution_reports;
CREATE POLICY sp_contribution_reports_insert ON public.sp_contribution_reports FOR INSERT WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS sp_contribution_reports_read ON public.sp_contribution_reports;
CREATE POLICY sp_contribution_reports_read ON public.sp_contribution_reports FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS sp_contribution_reports_update ON public.sp_contribution_reports;
CREATE POLICY sp_contribution_reports_update ON public.sp_contribution_reports FOR UPDATE USING (public.can_budget()) WITH CHECK (public.can_budget());

DROP POLICY IF EXISTS submissions_delete ON public.submissions;
CREATE POLICY submissions_delete ON public.submissions FOR DELETE USING (((committee_id = public.my_committee()) OR public.is_admin()));

DROP POLICY IF EXISTS submissions_insert ON public.submissions;
CREATE POLICY submissions_insert ON public.submissions FOR INSERT WITH CHECK ((committee_id = public.my_committee()));

DROP POLICY IF EXISTS submissions_read ON public.submissions;
CREATE POLICY submissions_read ON public.submissions FOR SELECT USING (public.is_approved());

DROP POLICY IF EXISTS transmittals_delete ON public.transmittals;
CREATE POLICY transmittals_delete ON public.transmittals FOR DELETE USING (((committee_id = public.my_committee()) OR public.is_admin()));

DROP POLICY IF EXISTS transmittals_insert ON public.transmittals;
CREATE POLICY transmittals_insert ON public.transmittals FOR INSERT WITH CHECK ((committee_id = public.my_committee()));

DROP POLICY IF EXISTS transmittals_modify ON public.transmittals;
CREATE POLICY transmittals_modify ON public.transmittals FOR UPDATE USING (((committee_id = public.my_committee()) OR public.is_admin()));

DROP POLICY IF EXISTS transmittals_read ON public.transmittals;
CREATE POLICY transmittals_read ON public.transmittals FOR SELECT USING (((committee_id = public.my_committee()) OR ((type <> 'personal'::text) AND public.is_approved())));

GRANT ALL ON TABLE public.committees TO anon;

GRANT ALL ON TABLE public.committees TO authenticated;

GRANT ALL ON TABLE public.attendance TO anon;

GRANT ALL ON TABLE public.attendance TO authenticated;

GRANT ALL ON TABLE public.audit_log TO anon;

GRANT ALL ON TABLE public.audit_log TO authenticated;

GRANT ALL ON SEQUENCE public.audit_log_id_seq TO anon;

GRANT ALL ON SEQUENCE public.audit_log_id_seq TO authenticated;

GRANT ALL ON TABLE public.barangay_budgets TO anon;

GRANT ALL ON TABLE public.barangay_budgets TO authenticated;

GRANT ALL ON TABLE public.barangays TO anon;

GRANT ALL ON TABLE public.barangays TO authenticated;

GRANT ALL ON SEQUENCE public.barangays_id_seq TO anon;

GRANT ALL ON SEQUENCE public.barangays_id_seq TO authenticated;

GRANT ALL ON TABLE public.dtr_config TO anon;

GRANT ALL ON TABLE public.dtr_config TO authenticated;

GRANT ALL ON TABLE public.employees TO anon;

GRANT ALL ON TABLE public.employees TO authenticated;

GRANT ALL ON TABLE public.entries TO anon;

GRANT ALL ON TABLE public.entries TO authenticated;

GRANT ALL ON TABLE public.entry_flags TO anon;

GRANT ALL ON TABLE public.entry_flags TO authenticated;

GRANT ALL ON TABLE public.organizations TO anon;

GRANT ALL ON TABLE public.organizations TO authenticated;

GRANT ALL ON TABLE public.entry_list TO anon;

GRANT ALL ON TABLE public.entry_list TO authenticated;

GRANT ALL ON TABLE public.entry_order TO anon;

GRANT ALL ON TABLE public.entry_order TO authenticated;

GRANT ALL ON TABLE public.monitoring_batches TO anon;

GRANT ALL ON TABLE public.monitoring_batches TO authenticated;

GRANT ALL ON TABLE public.monitoring_items TO anon;

GRANT ALL ON TABLE public.monitoring_items TO authenticated;

GRANT ALL ON TABLE public.profiles TO anon;

GRANT ALL ON TABLE public.profiles TO authenticated;

GRANT ALL ON TABLE public.publication_entries TO anon;

GRANT ALL ON TABLE public.publication_entries TO authenticated;

GRANT ALL ON TABLE public.publications TO anon;

GRANT ALL ON TABLE public.publications TO authenticated;

GRANT ALL ON TABLE public.sp_contribution_lines TO anon;

GRANT ALL ON TABLE public.sp_contribution_lines TO authenticated;

GRANT ALL ON TABLE public.sp_contribution_reports TO anon;

GRANT ALL ON TABLE public.sp_contribution_reports TO authenticated;

GRANT ALL ON TABLE public.submissions TO anon;

GRANT ALL ON TABLE public.submissions TO authenticated;

GRANT ALL ON TABLE public.transmittals TO anon;

GRANT ALL ON TABLE public.transmittals TO authenticated;

-- =====================================================================
-- 8. File storage (scanned letters, e-signatures, city logo)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('signatures', 'signatures', false) on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('branding', 'branding', true) on conflict (id) do nothing;

DROP POLICY IF EXISTS attachments_budget_write ON storage.objects;
CREATE POLICY attachments_budget_write ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[1] = 'budget'::text) AND public.can_budget()));

DROP POLICY IF EXISTS attachments_delete ON storage.objects;
CREATE POLICY attachments_delete ON storage.objects FOR DELETE USING (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[1] = (public.my_committee())::text)));

DROP POLICY IF EXISTS attachments_read ON storage.objects;
CREATE POLICY attachments_read ON storage.objects FOR SELECT USING (((bucket_id = 'attachments'::text) AND public.is_approved()));

DROP POLICY IF EXISTS attachments_write ON storage.objects;
CREATE POLICY attachments_write ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[1] = (public.my_committee())::text)));

DROP POLICY IF EXISTS branding_delete ON storage.objects;
CREATE POLICY branding_delete ON storage.objects FOR DELETE USING (((bucket_id = 'branding'::text) AND public.is_admin()));

DROP POLICY IF EXISTS branding_read ON storage.objects;
CREATE POLICY branding_read ON storage.objects FOR SELECT USING ((bucket_id = 'branding'::text));

DROP POLICY IF EXISTS branding_update ON storage.objects;
CREATE POLICY branding_update ON storage.objects FOR UPDATE USING (((bucket_id = 'branding'::text) AND public.is_admin()));

DROP POLICY IF EXISTS branding_write ON storage.objects;
CREATE POLICY branding_write ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'branding'::text) AND public.is_admin()));

DROP POLICY IF EXISTS signatures_delete ON storage.objects;
CREATE POLICY signatures_delete ON storage.objects FOR DELETE USING (((bucket_id = 'signatures'::text) AND ((storage.foldername(name))[1] = (public.my_committee())::text)));

DROP POLICY IF EXISTS signatures_read ON storage.objects;
CREATE POLICY signatures_read ON storage.objects FOR SELECT USING (((bucket_id = 'signatures'::text) AND (((storage.foldername(name))[1] = (public.my_committee())::text) OR public.is_admin())));

DROP POLICY IF EXISTS signatures_update ON storage.objects;
CREATE POLICY signatures_update ON storage.objects FOR UPDATE USING (((bucket_id = 'signatures'::text) AND ((storage.foldername(name))[1] = (public.my_committee())::text)));

DROP POLICY IF EXISTS signatures_write ON storage.objects;
CREATE POLICY signatures_write ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'signatures'::text) AND ((storage.foldername(name))[1] = (public.my_committee())::text)));

-- =====================================================================
-- 9. Live updates (screens refresh when anyone saves)
-- =====================================================================
do $rt$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['attendance', 'audit_log', 'barangay_budgets', 'barangays', 'committees', 'dtr_config', 'employees', 'entries', 'entry_flags', 'entry_order', 'monitoring_batches', 'monitoring_items', 'organizations', 'profiles', 'publication_entries', 'publications', 'sp_contribution_lines', 'sp_contribution_reports', 'submissions', 'transmittals'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $rt$;

-- =====================================================================
-- 10. Starting lists (added only when missing)
--   Only on a brand-new database. Barangays: PLEASE VERIFY against the official list
--   (admins can edit, rename and import them in Admin).
-- =====================================================================
do $seed$ begin
if not exists (select 1 from public.barangays) then
insert into public.barangays (name) values
  ('Burol Main'), ('Burol I'), ('Burol II'), ('Burol III'),
  ('Datu Esmael'),
  ('Emmanuel Bergado I'), ('Emmanuel Bergado II'),
  ('Fatima I'), ('Fatima II'), ('Fatima III'),
  ('H-2'),
  ('Langkaan I'), ('Langkaan II'),
  ('Luzviminda I'), ('Luzviminda II'),
  ('Paliparan I'), ('Paliparan II'), ('Paliparan III'),
  ('Sabang'),
  ('Saint Peter I'), ('Saint Peter II'),
  ('Salawag'),
  ('Salitran I'), ('Salitran II'), ('Salitran III'), ('Salitran IV'),
  ('Sampaloc I'), ('Sampaloc II'), ('Sampaloc III'), ('Sampaloc IV'), ('Sampaloc V'),
  ('San Agustin I'), ('San Agustin II'), ('San Agustin III'),
  ('San Andres I'), ('San Andres II'),
  ('San Antonio de Padua I'), ('San Antonio de Padua II'),
  ('San Dionisio'),
  ('San Esteban'),
  ('San Francisco I'), ('San Francisco II'),
  ('San Isidro Labrador I'), ('San Isidro Labrador II'),
  ('San Jose'),
  ('San Juan'),
  ('San Lorenzo Ruiz I'), ('San Lorenzo Ruiz II'),
  ('San Luis I'), ('San Luis II'),
  ('San Manuel I'), ('San Manuel II'),
  ('San Mateo'),
  ('San Miguel'), ('San Miguel II'),
  ('San Nicolas I'), ('San Nicolas II'),
  ('San Roque'),
  ('San Simon'),
  ('Santa Cristina I'), ('Santa Cristina II'),
  ('Santa Cruz I'), ('Santa Cruz II'),
  ('Santa Fe'),
  ('Santa Lucia'),
  ('Santa Maria'),
  ('Santo Cristo'),
  ('Santo Niño I'), ('Santo Niño II'),
  ('Victoria Reyes'),
  ('Zone I'), ('Zone I-B'), ('Zone II'), ('Zone III'), ('Zone IV');
end if;
end $seed$;

do $seed$ begin
if not exists (select 1 from public.organizations) then
insert into public.organizations (name) values
  ('Dasmariñas ThirdGen'),
  ('Senior Citizens Association'),
  ('PWD'),
  ('Windsor Homes HOA'),
  ('Solo Parent'),
  ('Senior Citizens Affairs'),
  ('Senior Citizens of Molino Homes II Subdivision'),
  ('EAC - Marketing and Communication Office'),
  ('EAC - School of Nursing and Midwifery Student Council'),
  ('DIHS Alumni Association, Inc.'),
  ('Salitran IV Integrated High School'),
  ('SEVENONEDERS'),
  ('Tau Gamma Phi Sabang Community Chapter'),
  ('Glam N'' Groove Milestone'),
  ('Saint Francis of Academy Parents Alliance');
end if;
end $seed$;

-- =====================================================================
-- 11. Tidy-up of names (organization only / barangay only)
--   Splits names like "KBDM - Salitran IV" that were saved as one organization or one barangay.
--   Does nothing when everything is already clean.
-- =====================================================================
alter table public.entries disable trigger user;  -- the one-time tidy-up is not an "edit" in the activity log

do $tidy$
declare
  r record;
  s record;
  v_org uuid;
begin
  -- offices saved without a name: removed when nothing uses them, otherwise named so they can be fixed
  delete from public.committees c
   where btrim(coalesce(c.name, '')) = ''
     and not exists (select 1 from public.profiles p where p.committee_id = c.id)
     and not exists (select 1 from public.entries e where e.committee_id = c.id)
     and not exists (select 1 from public.transmittals t where t.committee_id = c.id)
     and not exists (select 1 from public.employees m where m.committee_id = c.id);
  update public.committees set name = 'Unnamed office' where btrim(coalesce(name, '')) = '';

  -- one transmittal per office, type and week (older versions made a new one at every Transmit)
  for r in select t.id, k.keep from transmittals t
             join lateral (select x.id as keep from transmittals x
                            where x.committee_id = t.committee_id and x.type = t.type and x.week_no = t.week_no
                              and extract(year from x.transmitted_on) = extract(year from t.transmitted_on)
                            order by x.created_at, x.id limit 1) k on true
            where t.week_no is not null and t.id <> k.keep loop
    update public.entries set transmittal_id = r.keep where transmittal_id = r.id;
    update public.transmittals k set transmitted_on = greatest(k.transmitted_on, d.transmitted_on)
      from public.transmittals d where k.id = r.keep and d.id = r.id;
    delete from public.transmittals where id = r.id;
  end loop;

  -- organizations that are really "organization - barangay", or just a barangay
  for r in select id, name from public.organizations loop
    s := public.split_org_barangay(r.name);
    if s.barangay_id is not null then
      v_org := public.organization_id_of(s.org);
      update public.entries set organization_id = v_org, barangay_id = coalesce(barangay_id, s.barangay_id) where organization_id = r.id;
      if v_org is distinct from r.id then delete from public.organizations where id = r.id; end if;
    end if;
  end loop;
  -- "barangays" that are really "organization - barangay"
  for r in select id, name from public.barangays loop
    s := public.split_org_barangay(r.name, r.id);
    if s.barangay_id is not null and s.org is not null then
      update public.entries set barangay_id = s.barangay_id,
                                organization_id = coalesce(organization_id, public.organization_id_of(s.org))
       where barangay_id = r.id;
      update public.barangay_budgets bb set barangay_id = s.barangay_id
       where bb.barangay_id = r.id
         and not exists (select 1 from public.barangay_budgets x where x.year = bb.year and x.barangay_id = s.barangay_id);
      delete from public.barangay_budgets where barangay_id = r.id;
      delete from public.barangays where id = r.id;
    end if;
  end loop;
end $tidy$;

alter table public.entries enable trigger user;

-- an office always has a name
DO $c$ BEGIN
  ALTER TABLE public.committees ADD CONSTRAINT committees_name_not_blank CHECK (btrim(name) <> '');
EXCEPTION WHEN duplicate_object THEN NULL;
END $c$;
