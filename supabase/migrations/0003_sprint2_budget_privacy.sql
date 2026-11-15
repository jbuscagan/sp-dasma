-- =====================================================================
-- Sprint 2: Personal requests stay private · Budget module · budget permission
-- Run once in Supabase SQL Editor AFTER 0001 and 0002.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Personal requests are visible ONLY to the office that encoded them
--    (even after transmitting, and also hidden from admins of other offices).
-- ---------------------------------------------------------------------
drop policy if exists entries_read on public.entries;
create policy entries_read on public.entries for select using (
  committee_id = public.my_committee()
  or (type <> 'personal' and (public.is_admin() or (public.is_approved() and status = 'transmitted')))
);

drop policy if exists entries_update on public.entries;
create policy entries_update on public.entries for update
  using (committee_id = public.my_committee() or (public.is_admin() and type <> 'personal'))
  with check (committee_id = public.my_committee() or (public.is_admin() and type <> 'personal'));

drop policy if exists transmittals_read on public.transmittals;
create policy transmittals_read on public.transmittals for select using (
  committee_id = public.my_committee()
  or (type <> 'personal' and public.is_approved())
);

-- ---------------------------------------------------------------------
-- 2. Budget permission: admins tick "Budget encoder" on chosen accounts.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists can_budget boolean not null default false;

create or replace function public.can_budget()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
     where id = auth.uid() and status = 'approved' and (role = 'admin' or can_budget)
  );
$$;

-- Members may not give themselves the budget permission either.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.committee_id is distinct from old.committee_id
       or new.can_budget is distinct from old.can_budget then
      raise exception 'Only an administrator can change role, status, committee or budget access.';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. SP Contribution report (beginning balance + additions − disbursements)
-- ---------------------------------------------------------------------
create table public.sp_contribution_reports (
  id                uuid primary key default gen_random_uuid(),
  report_date       date not null default current_date,
  title             text not null default 'SP CONTRIBUTION REPORT',
  beginning_balance numeric(14, 2) not null default 0,
  notes             text,
  created_by        uuid default auth.uid() references auth.users on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.sp_contribution_lines (
  id        uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.sp_contribution_reports on delete cascade,
  kind      text not null check (kind in ('addition', 'disbursement')),
  grp       text,                                  -- e.g. "Solicitation"
  label     text not null,                         -- e.g. "CSO", "SP Contribution", "Ms. Base"
  amount    numeric(14, 2) not null default 0,
  sort      int not null default 0
);

-- ---------------------------------------------------------------------
-- 4. Weekly solicitation monitoring (approved organizations that an SPM/BM gives money to)
-- ---------------------------------------------------------------------
create table public.monitoring_batches (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'CSO',         -- CSO, SK, BRGY, MEDICAL, OTHER
  title       text,                                -- default: "<category>| WEEKLY SOLICITATION MONITORING"
  week_no     int,
  covering    text,                                -- (44th | Nov 03 - 05, 2026)
  released_on date not null default current_date,
  created_by  uuid default auth.uid() references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

create table public.monitoring_items (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references public.monitoring_batches on delete cascade,
  entry_id         uuid references public.entries on delete set null,  -- when picked from a published request
  requestor        text,
  association      text,
  event_date       text,
  contact_number   text,
  amount           numeric(14, 2),
  given_by         text,                           -- SPM / BM who gives the amount
  date_claimed     date,
  remarks          text,
  attachment_paths text[] not null default '{}',
  sort             int not null default 0,
  created_at       timestamptz not null default now()
);

create index monitoring_items_batch on public.monitoring_items (batch_id, sort);

-- ---------------------------------------------------------------------
-- 5. Annual budget per barangay (barangay + SK)
-- ---------------------------------------------------------------------
create table public.barangay_budgets (
  id          uuid primary key default gen_random_uuid(),
  year        int not null,
  barangay    text not null,
  brgy_budget numeric(16, 2),
  sk_budget   numeric(16, 2),
  remarks     text,
  updated_at  timestamptz not null default now(),
  unique (year, barangay)
);

-- ---------------------------------------------------------------------
-- 6. Security: every approved account can VIEW, only budget encoders/admins can CHANGE
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sp_contribution_reports', 'sp_contribution_lines', 'monitoring_batches', 'monitoring_items', 'barangay_budgets']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_approved())', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.can_budget())', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.can_budget()) with check (public.can_budget())', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.can_budget())', t || '_delete', t);
  end loop;
end $$;

-- Budget encoders upload scanned letters for monitoring under a shared "budget" folder.
create policy attachments_budget_write on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = 'budget' and public.can_budget());

-- The office signatory's e-signature for DTRs lives in the office folder (already allowed by signatures_* policies).

alter publication supabase_realtime add table
  public.sp_contribution_reports, public.sp_contribution_lines,
  public.monitoring_batches, public.monitoring_items, public.barangay_budgets;
