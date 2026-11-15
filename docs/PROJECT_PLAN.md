# Project plan — SP Dasmariñas Committee Platform

## 1. Methodology: Agile, Scrum-lite (iterative and incremental)

We build the system in short **sprints** of about 1–2 weeks. Every sprint ends with something you can open and use, not just a plan.

**Why this approach**

- Requirements will change once committees start using it (for example, the Budget module and the transmittal workflow changed a lot after the first reviews). Agile expects change. A waterfall plan would lock everything in up front.
- You are the **Product Owner**: you know the office workflow. Short cycles let you check the real screens early and correct direction cheaply.
- Each module (Transmittal, History, DTR, Budget) is built and released on its own, so one module never blocks another.

**How a sprint works for us**

| Step | Who | What happens |
|---|---|---|
| 1. Backlog | You + Claude | List of wanted features (user stories), ordered by priority. |
| 2. Sprint planning | You pick | Choose the top items for this sprint. |
| 3. Build | Claude | Code, database changes, tests, and a short changelog. |
| 4. Review / demo | You + 1–2 committee users | Try it on the test (Preview) link from Vercel. |
| 5. Retrospective | Both | What to keep, change or drop, written as new backlog items. |

**Definition of Done** (every feature, every sprint): it works on desktop and phone, in light and dark mode. It respects the access rules (an office only edits its own data). It passes `npm run typecheck`, `npm test` and the database tests. It is deployed to a Preview link and you approved it.

## 2. Roles Claude takes on

| Role | Responsibility in this project |
|---|---|
| Business analyst | Turns your notes and sample files into user stories, workflows (draft → transmit → publish → receive/flag → archive) and acceptance criteria. |
| Systems architect | Chooses the stack and module boundaries, so one feature can change without breaking others. |
| Database designer / data analyst | Tables, security rules, discrepancy checks (same number with different names, one person asking several offices), and the report-filter summaries. |
| Programmer (full stack) | Next.js pages, Supabase queries, PDF/Word/Excel generators, and the DTR engine ported from Apps Script. |
| UI/UX designer | Layout, forms built for fast encoding (type-ahead, "Save & add another"), mobile use, and dark mode. |
| Graphic artist | Navy-and-gold civic palette and a placeholder mark. **The official seal is not used** until the office approves its use: replace `public/logo.svg`. |
| QA / tester | Unit tests (DTR engine, report codes), report rendering tests, database security tests, and screenshot checks. |
| DevOps | GitHub + Vercel + Supabase setup, environment variables, and Preview deployments. |
| Technical writer | This plan, the deployment guide and the in-app help text. |

**Your role (Product Owner):** set priorities, provide sample files and lists, test each sprint, and approve go-live.

## 3. Architecture in one picture

```
Browser (Next.js app on Vercel)
  ├── Pages:  Transmittal · History · DTR · Budget · Settings · Admin
  ├── Reports are generated in the browser: PDF (jsPDF), Word (docx), Excel (ExcelJS)
  └── Live updates: Supabase Realtime (lists refresh by themselves when anyone saves)
                │
Supabase (Postgres database + Auth + File storage + Realtime)
  ├── Row Level Security = each office edits only its own rows; published rows are visible to all
  └── Storage: scanned letters (attachments), e-signatures (signatures)
```

**Why this stack:** it is free to start (Vercel Hobby + Supabase Free), needs no server to maintain, has real-time updates built in, and enforces security inside the database.

**Note:** Vercel's Hobby plan is for non-commercial use. For official government use, check with your IT office whether a Pro plan or an LGU-owned account is required.

### Modular code

See **docs/ARCHITECTURE.md** for the programming method, the folder structure and the database design (normalization).

## 4. How we work together (to save tokens and stay consistent)

1. **Ask for changes against the existing code.** Say "In `config.ts`, add …" or "On the Published page, …". Claude edits only the affected files. It does not regenerate the project.
2. **One sprint = one Git branch = one Vercel Preview link.** Merge to `main` only after you approve. `main` is what users see.
3. **Database changes** are made in the single file `supabase/setup.sql`; after each update you run it again in Supabase (safe to repeat).
4. **Send real samples:** filled-in reports, scanned letters (with personal details blurred if needed), and the official barangay and organization lists. Real samples prevent guesswork.
5. **Report bugs** with: page, what you did, what you expected, a screenshot.

## 5. Sprint roadmap

| Sprint | Goal | Status |
|---|---|---|
| 0 | Requirements, methodology, architecture, database design | ✅ Done |
| 1 | Accounts and approval, Transmittal (6 types), reports (PDF/Word/Excel + paper size), History, received/remarks/discrepancy checks, upload and scan, DTR, Settings, Admin | ✅ Done |
| 2 | Feedback round 1 (listed below) | ✅ Done |
| 3 | Feedback rounds 2–3: Submit/Publish workflow, received-by, ordering, in-table encoding, green theme (listed below) | ✅ Done |
| 3b | Deploy (GitHub + Vercel + Supabase) | ✅ Done |
| 4 | Feedback round 4: fixes, organizations, permissions, audit trail, table entry, bulk scanning (listed below) | ✅ Built, waiting for your review |
| 5 | Pilot with 2–3 committees, import official lists, DTR test print on real paper | Next |
| 6 | Hardening: backups, data-privacy review (RA 10173), user training, go-live | Planned |

**Sprint 4 changes (feedback round 4 — your phased plan):**
- **Phase 1 – fixes:** "column entries.position does not exist" fixed by `0006` (safe to re-run; includes everything from 0005). DTR: header text sits on the measured lines of both forms (Position on the 16–31 form no longer overflows); bottom area redrawn as two level blocks — SPM left, employee right — each with the e-signature directly above the printed name, a short underline and a smaller label; signatures scaled to the free space. SP Contribution PDF reproduces the sample's measurements (fonts, margins, columns, rules, spacing; "Remaining" vs "Ending Balance").
- **Phase 2 – database & permissions:** one record per organization (duplicates merged, spelling normalized, entries linked; barangay/chapter chosen per transmittal; admin can rename/merge). Admin › Offices & permissions: tick which offices may edit/delete their own published records (enforced in the database). Audit trail written by the database (create, edit, submit, publish, received, archive, delete, revisions, permission changes) — Admin › Activity log.
- **Phase 3 – transmittal:** no Add button (encode in the last row); dropdowns for Organization, Barangay, Request/Purpose; calendar for Date of event; filters for Organization, Barangay, Request; "Submit" (daily) and "Publish" (weekly, locks); Status column replaced by "Received by" (ticking fills your name; editable); required fields checked before Publish. Report filter removed. One Generate button style everywhere (DTR: PDF only, Word/Excel greyed). DTR "Attendance" renamed **Records** with month + 1st (1–15) / 2nd (16–end) cut-off; e-signatures uploaded once in Employees. Monitoring: dropdowns, calendar, Date Claimed input removed (still printed blank on the claim sheet), one Generate button for both files. Barangay budget report without Remarks. No email in the logout area; no extra scrollbars.
- **Phase 4 – scanning:** upload many photos and/or PDFs at once; digital PDFs read directly (prepared transmittal PDFs become one entry per table row, with the transmittal type detected from the code/title); scanned pages cleaned up and read by OCR (served by the site itself, two pages at a time); pages split into letters; fields guessed with a confidence colour; duplicates flagged (existing records and within the upload); review and correct before anything is saved; saved as drafts, never published automatically.

**Sprint 3.1 changes (feedback round 3):**
- **Theme:** Dasmariñas **green** with **butterfly** (Paru-Paro Festival) motifs: a butterfly mark (placeholder, not the official seal) and butterfly line art on sign-in and the dashboard.
- **Menu icons** per type: medical cross, gift (Christmas Party), house (Barangay), star (SK), people (CSO/NGO), person (Personal).
- **Cleaner Transmittal:**
  - Removed the office status board, the drag handle and the Received-by column.
  - The **checkbox beside #** now means **received** (saved, so it survives a refresh) and is also the selection for **Export / Publish**.
  - Rows move by typing a number in #.
  - Editing happens in the table; the ✎ icon opens the full form (attachments, long text).

**Sprint 3 changes (feedback round 2):**
- **Workflow:** Draft → **Submit** (done for the day) → **Publish** (finalized for the week, **locked**). An **Office status** board shows which offices submitted today and published this week. Published records can only change after an office clicks **Request revision** and an admin clicks **Allow revision**; then **Lock again**.
- **Encoding inside the table:** the separate Quick Encode section is gone. The last row of the table is always empty. Fill it in and press **Enter**: it saves and a new row opens (missing required cells turn red). Existing rows are edited in place. Pasting rows from Excel still works.
- **Ordering:** drag ⋮⋮ or type a number in **#** (e.g. KBDM first, then Senior Citizens). This works in Transmittal (the office's own order, used in the printed report) and in Published (each office keeps its own arrangement; exports follow it).
- **Filters:** by organization (with counts) and by view (not yet published / this week / published).
- **Received by** moved from Published to Transmittal. Click it to enter or choose the name of the person who received the document, with date and time. You can mark several selected rows at once. It stays editable after publishing.
- **DTR:** the employee's e-signature is printed over their name on the "Employee's signature" line. It is sized automatically so it never covers "I hereby certify…", and long names shrink. Upload buttons are in **Planner** and **Employees**.
- **Solicitation monitoring:** one **Generate reports** button downloads both files (Signature & Date Claimed + Amount).
- **Styling:** confirmed Tailwind CSS throughout; see `docs/STYLE_GUIDE.md`.

**Sprint 2 changes (from your feedback):**
- **Received:** a dedicated "Received" column with one checkbox for your office. Clicking "N offices received ›" opens a modal with the list and dates, so the table stays clean.
- **Spreadsheet entry** on every transmittal page. Tab moves to the next cell, Enter moves down, you can paste many rows from Excel or Google Sheets, then "Save all rows". Picking an organization fills in its barangay.
- **Personal requests stay private** to the encoding office, even after transmitting (enforced in the database).
- **DTR:** prints 3 forms per A4 landscape on plain paper (the form itself is printed) in the order 1-15, 16-31, 1-15 | 16-31, 1-15, 16-31 … for easy cutting. The certifying official's name, title and e-signature appear bottom-left, like your sample. Times are now centered in their rows. The old "1 form per page" mode is kept for pre-printed forms.
- **Budget module:**
  1. SP Contribution report: beginning balance + additional − disbursements = remaining, with notes. Disbursements can be pulled from monitoring totals.
  2. Weekly Solicitation Monitoring: approved organizations only, from published requests, typed in, or uploaded and scanned. Records amount, giver (SPM/BM) and date claimed. Prints a claim sheet (Date Claimed + Signature) or an amount list with total.
  3. Barangay & SK annual budget per year, pasteable from Excel.
  - Only admins and accounts ticked "Budget encoder" can edit. Everyone approved can view.
- **Admin:** "Budget encoder" toggle, and **Import list** for barangays and organizations (Excel, CSV or paste). 16 organizations from your samples are pre-loaded.
- **Reports:** no line under the encoder's name. ₱ and ñ print correctly (embedded fonts).
- **Look and feel:** follows the Philippine Government Web Template style: a top bar (Republic of the Philippines · Province of Cavite · City of Dasmariñas) with Philippine Standard Time, a navy-and-gold sidebar, heritage-church and sun-ray line art, and an official footer.

### Sprint 5 — revisions round (done)
- Transmittal: Received By shows the receiving office automatically and sits before Remarks; Publish renamed **Transmit** (confirmation only); Delete all; no horizontal scrollbar; phone/name/barangay clean-up when typing or pasting; Date of event From–To calendar.
- Published (All): Received By column (optional in reports), working Checks with a details window, separate checkbox column, **Publish** of a weekly combined list (admin + allowed offices) and a **Weekly published** tab; report header only on page 1; optional Note; header colour swatches + custom colour.
- DTR: cut-offs 21–5 and 6–20; Planner shows names only; employee signature without printed name; both signature lines level and equal.
- Admin: Budget / Publish / Edit-published permissions per office ("Allowed" checkboxes); city logo upload. Sidebar: Admin before Settings, gear icon. Dashboard: greeting fixed, counts = published records. Capitalised titles, hidden scrollbars.

### Sprint 6 — normalization & structure (done)
- Database normalized (0009): organization, barangay and receiving office stored once and linked by id; budget and publish permissions in one place each. Requests are read and saved through the view `entry_list`.
- Code: transmittal data calls split by topic (`transmittal/api/`), Admin split into one file per tab, Published (All) split into parts, table names in `lib/db.ts`.
- Barangays can be renamed in Admin (changes every record at once); a barangay in use cannot be deleted.

### Sprint 7 — one database file (done)
- The 10 numbered SQL files were replaced by `supabase/setup.sql`: one file that creates or repairs the whole database and is safe to run again (re-running the old files had broken a few rules).
- Removed an old step that broke renaming organizations.

## 6. Suggested improvements (for your decision)

- **Data Privacy Act (RA 10173):** medical entries hold sensitive personal information. Recommended: a privacy notice on the registration page, an assigned Data Protection Officer, a retention period for archived entries, and limiting medical details in "Published" to what other offices need.
- **Audit trail:** record who edited or removed a published entry and when. Useful when discrepancies are disputed.
- **Duplicate prevention at encoding time:** warn while typing when the same name or number was already transmitted by another office this month.
- **Transmittal numbering:** the code uses the week number, so two transmittals of the same type in one week share a code. The code is editable today. A sequence suffix (e.g. `-045-2`) could be automated if you prefer.
- **Logo:** the app uses a neutral placeholder mark. Replace `public/logo.svg` with the official seal once its use is approved.

## 7. Open questions for you

1. Verify the 75 pre-loaded barangays, then import the official organization list (Admin → Import list).
2. A sample of a barangay annual budget report, if one exists, so the printout can match it.
3. After the first DTR test print: does the text line up? (DTR → Rules & settings → calibration page.)
