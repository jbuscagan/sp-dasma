# SP Dasmariñas Committee Platform

A reporting, data-encoding and collaboration platform for the committees of the **Sangguniang Panlungsod ng Dasmariñas**.

| Module | What it does |
|---|---|
| **Transmittal** | A live, spreadsheet-like table per type (CSO/NGO, Christmas Party, Barangay, SK, Medical, Personal). Encode in the last row (Enter = save and new row) with dropdowns and a calendar, reorder by typing a number, filter by organization / barangay / request, tick to record who received each document, and **Upload & scan** many photos or PDFs at once (fields are read automatically and reviewed before saving). **Submit** daily and **Publish** weekly (locked), producing a coded report (e.g. `SPMRC-NGO-045`) in **PDF, Word or Excel**. |
| **History** | *Transmitted (own)*: your office's transmittals, which you can regenerate or recall. *Published*: requests from every office, with "received" checkboxes, remarks/flags and automatic discrepancy checks. *Archived*: removed entries, which can be restored. |
| **DTR** | The Apps Script DTR automation, rebuilt for the web: rules, special days, attendance review, and e-signatures. Prints 3 forms per A4 landscape (1-15, 16-31, 1-15 …) with the certifying official's e-signature. Each office has its own employees. |
| **Budget** | SP Contribution report (balance ledger), weekly Solicitation Monitoring (claim sheet / amount list), and annual Barangay & SK budgets. Editable by admins and "Budget encoder" accounts; viewable by everyone approved. |
| **Settings / Admin** | Encoder name and position, office details, dark mode, account approval, offices, barangay/organization directory. |

Changes appear **live** for every user (Supabase Realtime), without refreshing the page.

## Tech stack
Next.js 15 (React 19, TypeScript, Tailwind) on **Vercel** · **Supabase** (Postgres, Auth, Storage, Realtime) · jsPDF / docx / ExcelJS for reports · tesseract.js for scanning.

## Documentation
- [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md): methodology, team roles, architecture, roadmap, open questions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): beginner-friendly, step-by-step setup on Supabase, GitHub and Vercel
- [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md): Tailwind-based UI rules for a consistent look
- [supabase/tests/README.md](supabase/tests/README.md): database security tests

## Where to change things
| I want to… | Edit |
|---|---|
| Change columns, titles, codes or dropdown options of a transmittal type | `src/features/transmittal/config.ts` |
| Change how the report header or code is computed | `src/features/reports/header.ts` |
| Change the PDF / Word / Excel look | `src/features/reports/pdf.ts`, `docx.ts`, `xlsx.ts` |
| Change DTR logic or form positions | `src/features/dtr/engine.ts`, `src/features/dtr/layout.ts` (form images: `public/dtr/`) |
| Change budget reports | `src/features/budget/` (`ledger.ts` = SP contribution printout) |
| Change the menu | `src/features/shell/nav.ts` |
| Change colours | `src/app/globals.css` (CSS variables) |
| Change the database | edit `supabase/setup.sql` (keep every statement safe to run again) |

## Commands
```bash
npm install        # once
npm run dev        # local development (needs .env.local, see .env.example)
npm run typecheck  # TypeScript check
npm test           # unit + report-rendering tests
npm run build      # production build
```
