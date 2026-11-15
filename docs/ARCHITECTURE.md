# How the system is built

This page explains the programming method, the code structure and the database design, in plain words.

## 1. Programming method

| What | Name of the method | In simple words |
|---|---|---|
| How the work is planned | **Agile / Scrum-style sprints** | Small rounds of work (Sprint 1, 2, 3 …). After each round you test it and send corrections; the next round fixes them. |
| How the code is organised | **Feature-based modular architecture** | Each part of the website (Transmittal, History, DTR, Budget, Admin …) has its own folder. Changing one part does not break the others. |
| How the code is split inside a feature | **Layered design (separation of concerns)** | Screens only show things. Database calls live in `api` files. Rules and calculations live in plain files with no screen code (and are tested). Settings such as columns live in one `config` file. |
| How the screens are made | **Component-based UI (React)** | Every button, table and dialog is a small reusable piece. The same Generate dialog is used everywhere. |
| How security works | **Security in the database (Row Level Security)** | Even if someone bypasses the website, the database itself refuses what an office is not allowed to see or change. |
| How data is stored | **Relational database, normalized to 3rd Normal Form** | Each fact is stored once and linked by an id (see part 3). |
| How it fits every screen | **Responsive design (mobile-first)** | Phones: every table turns into cards with a label beside each value, and buttons and filters line up in two columns. Tablets: wide tables (Transmittal, Published, Monitoring) also use cards. Desktop: full tables. One shared rule does this for all tables (`shell/StackTables.tsx` + `globals.css`). |
| How quality is checked | **Automated tests** | 34 unit tests (DTR, reports, scanning, formatting, discrepancies) and 67 database security checks run before every release. |

## 2. Code structure (layers)

```
src/
  app/                 ROUTES — thin files that only say "this address shows that page"
  features/            ONE FOLDER PER PART OF THE WEBSITE
    transmittal/
      config.ts          ← columns, titles, codes, dropdown options of each type (change them here only)
      api/               ← DATA LAYER: every database call of this feature, split by topic
        entries.ts         requests: list, save, delete, received, order
        transmittals.ts    Submit, Transmit, revisions
        publications.ts    weekly published lists
        flags.ts           remarks / discrepancies
        attachments.ts     scanned letters
        index.ts           one door: pages import from "@/features/transmittal/api"
      TransmittalPage.tsx, TransmittalSheet.tsx …   ← SCREENS
    history/
      published/         Published (All): PublishedHistory (tabs) · AllRecords · WeeklyLists · ChecksDialog · PublishDialog
      OwnHistory, ArchivedHistory, discrepancies.ts (rules, tested)
    admin/               one file per tab: Accounts · Revisions · Offices · Directory · ActivityLog
    dtr/                 engine.ts (rules, tested) · layout.ts (form positions) · pdf.ts · screens
    budget/  reports/  scan/  dashboard/  settings/  shell/  auth/  directory/
  components/ui/       shared building blocks (Button, Modal, Icon, Combobox …)
  lib/                 shared helpers: db.ts (table names), format.ts (phone/name/date), dates.ts, types.ts
  hooks/               shared React helpers (live data, drag-to-reorder)
supabase/setup.sql     THE database: tables, rules, security, storage — one file, safe to run again
supabase/tests/        database security checks
docs/                  this guide, deployment steps, project plan
```

**Rule of thumb:** a screen never talks to the database directly. It asks its feature's `api`,
and the `api` asks the database. So if the database changes, only the `api` file changes.

## 3. Database design (normalization)

**Normalization** means every piece of information is saved in **one place only**, and other
records point to it with an **id**. Fix a spelling once and it is fixed everywhere.

```
committees (offices) ──< profiles (accounts)
      │
      ├──< entries (requests) >── organizations       (organization_id)
      │        │              >── barangays           (barangay_id)
      │        │              >── committees          (received_committee_id = receiving office)
      │        ├──< entry_flags (remarks)
      │        ├──< publication_entries >── publications (weekly published lists)
      │        └──> transmittals (weekly transmitted list of one office)
      ├──< employees ──< attendance  (DTR)
      └── permissions: can_edit_published (edit / delete / publish), can_budget
barangays ──< barangay_budgets (one row per barangay per year)
sp_contribution_reports ──< sp_contribution_lines
monitoring_batches ──< monitoring_items
audit_log (activity log, written only by the database)
```

`──<` means "one … has many …".

### What changed when the data was normalized

| Before | After |
|---|---|
| Each request stored the organization **name** as text (plus a link) | Only the link `organization_id`; the name lives in `organizations` |
| Each request stored the barangay **name** as text | Link `barangay_id`; the name lives in `barangays` |
| "Received by" stored the office **name** as text | Link `received_committee_id`; the name lives in `committees` |
| Barangay budgets stored the barangay **name** | Link `barangay_id` |
| Budget permission existed per account **and** per office | Per office only |
| "Publish" had its own checkbox, same meaning as "edit / delete published" | One checkbox |

The website reads requests through the **view** `entry_list`, which shows the names next to the
ids. When you type an organization or barangay name, the database finds the matching record (ignoring
capital letters and extra spaces) or creates it, and saves only its id.

### Copies we keep on purpose

A copy is correct when it records **what was true at that moment**, like a signed paper:

* `transmittals.encoder_name / encoder_position` — the name printed on that transmittal on that date.
  If the encoder is promoted later, the old document must not change.
* `monitoring_items` requestor / association / amount — the release record as written when the money was released.
* `audit_log` — a history of changes; it must never follow later edits.
* `attachment_paths` — the list of scanned files of one request. Files belong to exactly one request
  and are never searched by themselves, so a separate table would add work without benefit.
* One `entries` table for all six request types — the types share almost every column, and one table
  keeps reports, history, permissions and duplicate checks in one place. Type-specific fields
  (patient, diagnosis …) are simply empty for the other types.
