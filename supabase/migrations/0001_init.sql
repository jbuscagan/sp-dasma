-- =====================================================================
-- SP Dasmariñas Committee Platform — database schema (Supabase / Postgres)
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Later changes go in NEW files (0002_..., 0003_...) — never edit this one
-- after it has been run in production.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. ORGANISATION: committees (offices) and user profiles
-- ---------------------------------------------------------------------

create table public.committees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,               -- e.g. Office of SPM Robin Cantimbuhan
  spm_name    text,                               -- code name printed on reports, e.g. Robin Cantimbuhan
  code_prefix text not null default 'SPM',        -- e.g. SPMRC  -> SPMRC-NGO-045
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id               uuid primary key references auth.users on delete cascade,
  email            text,
  encoder_name     text,                           -- Joseph Aguilar
  position         text,                           -- Administrative Assistant
  requested_office text,                           -- typed at registration, admin maps it to a committee
  committee_id     uuid references public.committees on delete set null,
  role             text not null default 'member' check (role in ('member', 'admin')),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at       timestamptz not null default now()
);

-- Create a profile automatically when someone registers.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper functions used by the security policies below.
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved' and role = 'admin');
$$;

create or replace function public.my_committee()
returns uuid language sql stable security definer set search_path = public as $$
  select committee_id from profiles where id = auth.uid() and status = 'approved';
$$;

-- Members may edit their own name/position, but never their role, status or committee.
-- (auth.uid() is empty in the Supabase SQL editor, so the first admin can be set there.)
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
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

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- 2. DIRECTORY: barangays and organizations (for type-ahead suggestions)
-- ---------------------------------------------------------------------

create table public.barangays (
  id   serial primary key,
  name text not null unique
);

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  barangay   text,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (name, barangay)
);

-- ---------------------------------------------------------------------
-- 3. TRANSMITTALS
-- ---------------------------------------------------------------------

-- One row = one generated transmittal report (a batch of entries).
create table public.transmittals (
  id               uuid primary key default gen_random_uuid(),
  committee_id     uuid not null references public.committees on delete cascade,
  type             text not null check (type in ('ngo', 'christmas', 'barangay', 'sk', 'medical', 'personal')),
  code             text not null,                 -- SPMRC-NGO-045
  week_no          int,
  covering         text,                          -- (44th | Oct 22 to Nov 5)
  transmitted_on   date not null default current_date,
  encoder_name     text,
  encoder_position text,
  created_by       uuid default auth.uid() references auth.users on delete set null,
  created_at       timestamptz not null default now()
);

-- One row = one solicitation request (all six transmittal types share this table;
-- each type only uses the columns it needs — see src/features/transmittal/config.ts).
create table public.entries (
  id                uuid primary key default gen_random_uuid(),
  committee_id      uuid not null references public.committees on delete cascade,
  type              text not null check (type in ('ngo', 'christmas', 'barangay', 'sk', 'medical', 'personal')),
  date_received     date not null default current_date,
  solicitor_name    text,                         -- Name of the solicitor / Name (personal)
  patient_name      text,                         -- Medical only
  organization      text,
  barangay          text,
  purpose           text,                         -- Purpose / Reason (personal) / Purpose-Request (medical)
  request           text,                         -- Cash, In-Kind, Cash/In-Kind, Raffle ...
  request_details   text,                         -- e.g. raffle items
  diagnosis         text,                         -- Medical
  assistance_spec   text,                         -- Medical
  contact_number    text,
  event_date        text,                         -- free text: "December 20, 2026", "Nov 20-21"
  remarks           text,
  assistance_status text not null default 'pending' check (assistance_status in ('pending', 'received')),
  assistance_date   date,
  status            text not null default 'draft' check (status in ('draft', 'transmitted', 'archived')),
  archived_reason   text,
  transmittal_id    uuid references public.transmittals on delete set null,
  attachment_paths  text[] not null default '{}',
  created_by        uuid default auth.uid() references auth.users on delete set null,
  updated_by        uuid references auth.users on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index entries_committee_type_status on public.entries (committee_id, type, status);
create index entries_status_date on public.entries (status, date_received);
create index entries_contact on public.entries (contact_number);

create or replace function public.touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated();

-- "Received" checkboxes: which offices have received a transmitted request.
create table public.entry_receipts (
  entry_id     uuid not null references public.entries on delete cascade,
  committee_id uuid not null references public.committees on delete cascade,
  received_by  uuid default auth.uid() references auth.users on delete set null,
  received_at  timestamptz not null default now(),
  primary key (entry_id, committee_id)
);

-- Flags / remarks for discrepancies found in published entries.
create table public.entry_flags (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.entries on delete cascade,
  committee_id  uuid not null references public.committees on delete cascade,  -- office that raised it
  raised_by     uuid default auth.uid() references auth.users on delete set null,
  note          text not null,
  status        text not null default 'open' check (status in ('open', 'resolved')),
  resolution    text,
  resolved_by   uuid references auth.users on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Moves the chosen draft entries into a new transmittal in one step (all or nothing).
create or replace function public.transmit_entries(
  p_type text, p_code text, p_week int, p_covering text, p_date date,
  p_encoder_name text, p_encoder_position text, p_entry_ids uuid[]
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_committee uuid := public.my_committee();
  v_count int;
begin
  if v_committee is null then
    raise exception 'Your account is not approved or has no committee yet.';
  end if;

  insert into transmittals (committee_id, type, code, week_no, covering, transmitted_on, encoder_name, encoder_position)
  values (v_committee, p_type, p_code, p_week, p_covering, coalesce(p_date, current_date), p_encoder_name, p_encoder_position)
  returning id into v_id;

  update entries
     set status = 'transmitted', transmittal_id = v_id
   where id = any (p_entry_ids)
     and committee_id = v_committee
     and type = p_type
     and status = 'draft';

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'None of the selected entries could be transmitted (already transmitted or not yours).';
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 4. DTR (daily time records)
-- ---------------------------------------------------------------------

create table public.employees (
  id             uuid primary key default gen_random_uuid(),
  committee_id   uuid not null references public.committees on delete cascade,
  name           text not null,
  position       text,
  dept           text,
  active         boolean not null default true,
  signature_path text,                            -- file in the "signatures" storage bucket
  created_at     timestamptz not null default now(),
  unique (committee_id, name)
);

-- Per-committee DTR rules and print calibration (JSON so new settings need no migration).
create table public.dtr_config (
  committee_id uuid primary key references public.committees on delete cascade,
  rules        jsonb,
  settings     jsonb,
  updated_at   timestamptz not null default now()
);

create table public.attendance (
  id           uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees on delete cascade,
  employee_id  uuid not null references public.employees on delete cascade,
  work_date    date not null,
  am_in        text,                              -- 'HH:mm' 24-hour text
  am_out       text,
  pm_in        text,
  pm_out       text,
  day_type     text not null default 'NORMAL',
  note         text,
  created_at   timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index attendance_committee_date on public.attendance (committee_id, work_date);

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY — who can see and change what
-- ---------------------------------------------------------------------

alter table public.committees     enable row level security;
alter table public.profiles       enable row level security;
alter table public.barangays      enable row level security;
alter table public.organizations  enable row level security;
alter table public.transmittals   enable row level security;
alter table public.entries        enable row level security;
alter table public.entry_receipts enable row level security;
alter table public.entry_flags    enable row level security;
alter table public.employees      enable row level security;
alter table public.dtr_config     enable row level security;
alter table public.attendance     enable row level security;

-- committees: names are public (shown on the registration form)
create policy committees_read  on public.committees for select using (true);
create policy committees_admin on public.committees for all using (public.is_admin()) with check (public.is_admin());
create policy committees_own_update on public.committees for update
  using (id = public.my_committee()) with check (id = public.my_committee());

-- profiles
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_admin() or (public.is_approved() and status = 'approved'));
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- directory
create policy barangays_read  on public.barangays for select using (auth.role() = 'authenticated');
create policy barangays_admin on public.barangays for all using (public.is_admin()) with check (public.is_admin());
create policy orgs_read   on public.organizations for select using (public.is_approved());
create policy orgs_insert on public.organizations for insert with check (public.is_approved());
create policy orgs_admin  on public.organizations for all using (public.is_admin()) with check (public.is_admin());

-- transmittals: everyone approved can read (History > Published), only own office creates
create policy transmittals_read   on public.transmittals for select using (public.is_approved());
create policy transmittals_insert on public.transmittals for insert with check (committee_id = public.my_committee());
create policy transmittals_modify on public.transmittals for update
  using (committee_id = public.my_committee() or public.is_admin());
create policy transmittals_delete on public.transmittals for delete
  using (committee_id = public.my_committee() or public.is_admin());

-- entries: own office sees everything it encoded; everyone sees transmitted (published) entries
create policy entries_read on public.entries for select using (
  public.is_admin()
  or committee_id = public.my_committee()
  or (public.is_approved() and status = 'transmitted')
);
create policy entries_insert on public.entries for insert with check (committee_id = public.my_committee());
create policy entries_update on public.entries for update
  using (committee_id = public.my_committee() or public.is_admin())
  with check (committee_id = public.my_committee() or public.is_admin());
create policy entries_delete on public.entries for delete
  using (public.is_admin() or (committee_id = public.my_committee() and status = 'draft'));

-- receipts and flags: any approved office can add its own; read by all approved users
create policy receipts_read   on public.entry_receipts for select using (public.is_approved());
create policy receipts_insert on public.entry_receipts for insert with check (committee_id = public.my_committee());
create policy receipts_delete on public.entry_receipts for delete using (committee_id = public.my_committee() or public.is_admin());

create policy flags_read   on public.entry_flags for select using (public.is_approved());
create policy flags_insert on public.entry_flags for insert with check (committee_id = public.my_committee());
create policy flags_update on public.entry_flags for update using (
  public.is_admin()
  or committee_id = public.my_committee()
  or exists (select 1 from public.entries e where e.id = entry_id and e.committee_id = public.my_committee())
);
create policy flags_delete on public.entry_flags for delete using (committee_id = public.my_committee() or public.is_admin());

-- DTR: strictly per office
create policy employees_all on public.employees for all
  using (committee_id = public.my_committee() or public.is_admin())
  with check (committee_id = public.my_committee() or public.is_admin());
create policy dtr_config_all on public.dtr_config for all
  using (committee_id = public.my_committee() or public.is_admin())
  with check (committee_id = public.my_committee() or public.is_admin());
create policy attendance_all on public.attendance for all
  using (committee_id = public.my_committee() or public.is_admin())
  with check (committee_id = public.my_committee() or public.is_admin());

-- ---------------------------------------------------------------------
-- 6. FILE STORAGE (scanned letters and e-signatures)
--    Files are stored under "<committee id>/<file>" so each office owns its folder.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('signatures', 'signatures', false)
  on conflict (id) do nothing;

create policy attachments_read on storage.objects for select
  using (bucket_id = 'attachments' and public.is_approved());
create policy attachments_write on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = public.my_committee()::text);
create policy attachments_delete on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = public.my_committee()::text);

create policy signatures_read on storage.objects for select
  using (bucket_id = 'signatures' and ((storage.foldername(name))[1] = public.my_committee()::text or public.is_admin()));
create policy signatures_write on storage.objects for insert
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = public.my_committee()::text);
create policy signatures_update on storage.objects for update
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = public.my_committee()::text);
create policy signatures_delete on storage.objects for delete
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = public.my_committee()::text);

-- ---------------------------------------------------------------------
-- 7. REAL-TIME: broadcast changes so open pages update without refresh
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table
  public.entries, public.transmittals, public.entry_receipts, public.entry_flags,
  public.employees, public.attendance, public.dtr_config, public.profiles, public.organizations,
  public.committees, public.barangays;
