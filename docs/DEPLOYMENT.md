# Putting the website online: a beginner's guide

This guide assumes you have never used GitHub, Vercel or Supabase. Follow it from top to bottom. It takes about **45 minutes** the first time.

## First, what are these three things?

Think of the website like an office:

| Service | Plain-language meaning | What it does for us |
|---|---|---|
| **GitHub** | A **Google Drive for code**. It also remembers every version, like "Version history" in Google Docs. | Keeps the website's code safe and lets us send updates. |
| **Vercel** | The **publisher**. It takes the code from GitHub and turns it into a real website with a link. | Every time the code on GitHub changes, Vercel updates the website by itself in about 2 minutes. |
| **Supabase** | The **filing cabinet and the guard at the door**. | Stores all the data (requests, DTR, budget), handles log-ins, and stores uploaded photos and e-signatures. |

All three have **free plans**, which are enough to start.

> 💡 **One important note:** Vercel's free plan is meant for non-commercial use. Before the whole SP uses this officially, ask your IT office whether the City prefers a paid plan or an LGU-owned account.

You will need:
- An email address you can open (use an **office email** if possible, so the accounts belong to the office and not to one person).
- About 45 minutes.
- A computer with Chrome or Edge. A phone is not enough for setup.

---

## Part 1: Supabase (the database), about 15 minutes

### 1.1 Create the account and project
1. Go to **supabase.com** and click **Start your project**. Sign up, then confirm your email.
2. Click **New project**.
3. Fill in:
   - **Name:** `sp-dasma`
   - **Database Password:** click **Generate a password**, then **copy it and keep it somewhere safe**, such as a password manager or a sealed note. You rarely need it, but it cannot be recovered.
   - **Region:** **Southeast Asia (Singapore)**, the closest region to Dasmariñas, which makes the site faster.
4. Click **Create new project**. Wait 1–2 minutes until the dashboard appears.

### 1.2 Create the tables (copy-paste 6 files)
This sets up all the "drawers" of the filing cabinet.

1. On the left menu, click **SQL Editor** (the icon looks like `>_`).
2. Click **+ New query**.
3. In the project folder, open `supabase/migrations/0001_init.sql`. Select everything (**Ctrl+A**), copy it (**Ctrl+C**), paste it into Supabase (**Ctrl+V**), then click the green **Run** button.
   ✅ It should say **"Success. No rows returned."**
4. Do the same for the other files, **in this order**, each in a **new query** (10 files in total). Files 0005 to 0010 are safe to run again if you are unsure whether you already ran them:
   - `0002_seed_barangays.sql` (the 75 barangays)
   - `0003_sprint2_budget_privacy.sql` (budget module, personal-request privacy)
   - `0004_seed_organizations.sql` (starter list of organizations)
   - `0005_sprint3_workflow.sql` (Submit / Publish / lock, received by, ordering)
   - `0006_sprint4_orgs_permissions_audit.sql` (one record per organization, office permissions, activity log; also fixes "column entries.position does not exist")
   - `0007_sprint5_publish_permissions_logo.sql` (weekly published lists, office Budget / Publish permissions, city logo storage)
   - `0008_publish_uses_edit_permission.sql` (one office permission for edit / delete / publish)
   - `0009_normalize.sql` (every name stored once and linked by id — see docs/ARCHITECTURE.md)
   - `0010_org_barangay_cleanup.sql` (organization only / barangay only, "Received by" = SPM name, weekly list dates)

❗ If you see a red error, stop and send me a screenshot. Do not run the same file twice.

### 1.3 Copy the two "keys" the website needs
1. Left menu → **Project Settings** (gear icon) → **API** (it may be called **Data API** / **API Keys**).
2. Copy these two values into a Notepad file for now:
   - **Project URL**, which looks like `https://abcdxyz.supabase.co`
   - **anon public** key, a long text starting with `eyJ…`
3. ⚠️ **Do NOT copy the `service_role` key anywhere.** That one is like a master key to the whole building.

### 1.4 Login emails
Left menu → **Authentication** → **Sign In / Providers** → **Email**: keep **Confirm email** turned ON. New users then get a confirmation link by email.

---

## Part 2: GitHub (where the code lives), about 15 minutes

### 2.1 Create the account
1. Go to **github.com** and click **Sign up**. Use the office email and choose a username, e.g. `sp-dasma-it`.
2. Verify your email.

### 2.2 Create an empty "repository" (a project folder): **only for Way A**
(If you will use **Way B** below, skip this step. GitHub Desktop creates the repository for you.)
1. Click the **+** at the top right → **New repository**.
2. **Repository name:** `sp-dasma`
3. Choose **Private**.
4. **Do not tick** "Add a README" or anything else. It must stay **empty**.
5. Click **Create repository**. Leave this page open.

### 2.3 Upload the code. Choose ONE way.

#### Way A, easiest: let Claude upload it
Reply to Claude: *"Push the project to **your-username/sp-dasma**."*
GitHub may show a page asking to **Authorize** or **Install** the Claude app for that repository. Click it. Then refresh your repository page: you will see folders like `src`, `docs`, `supabase`. ✅ Done. Go to Part 3.

#### Way B: do it yourself with GitHub Desktop (no typing of commands)
GitHub's website only accepts 100 files per drag-and-drop, and the project has more. **GitHub Desktop** is a free app that uploads everything at once.

1. **Download the project:** in the Claude app, download **`sp-dasma.zip`** (Claude sends it). Right-click it → **Extract All…** → choose `Documents`. You now have a folder `Documents\sp-dasma`.
2. **Install GitHub Desktop:** go to **desktop.github.com** → download → install → **Sign in to GitHub.com** with the account from 2.1.
3. **Add the folder:** in GitHub Desktop: **File → Add local repository…** → **Choose…** → select `Documents\sp-dasma` → **Add repository**.
   - If it says *"This directory does not appear to be a Git repository"*, click **create a repository** → **Create repository** (keep the defaults).
4. **Save a first version:** bottom-left, in **Summary**, type `First upload`, then click **Commit to main**.
5. **Upload:** click **Publish repository** (top bar).
   - **Name:** `sp-dasma`, and keep **"Keep this code private"** ticked → **Publish repository**.
   - If it says the name already exists, you created it in 2.2 by mistake: on github.com open that empty repository → **Settings** → bottom **Delete this repository**, then click **Publish repository** again.
6. Open **github.com/your-username/sp-dasma** to check that the folders are there. ✅

> ⚠️ Never upload a file called `.env.local`. It holds keys. The project's `.gitignore` already keeps it out.

## Part 3: Vercel (makes it a real website), about 10 minutes

1. Go to **vercel.com** → **Sign Up** → choose **Continue with GitHub**. This links the two accounts. Approve it.
2. On the Vercel dashboard click **Add New… → Project**.
3. You will see your `sp-dasma` repository in the list. Click **Import**.
   - If it is not listed, click **Adjust GitHub App Permissions** and allow Vercel to see `sp-dasma`.
4. On the setup screen, open **Environment Variables** and add the two keys from Part 1.3:

   | Key (copy exactly) | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key |

   Type the key name in the left box, paste the value in the right box, and click **Add**. Do this for both.
5. Click **Deploy**. Wait 1–3 minutes for the confetti 🎉.
6. Click **Continue to Dashboard**. Your link is shown under **Domains**, e.g. `https://sp-dasma.vercel.app`. **This is your website.**

---

## Part 4: Connect Supabase to your website link, about 2 minutes

This makes the confirmation emails open your website instead of a broken page.

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL:** paste your Vercel link (e.g. `https://sp-dasma.vercel.app`), then **Save**.
3. **Redirect URLs** → **Add URL** → `https://sp-dasma.vercel.app/**` (your link plus `/**`) → **Save**.

---

## Part 5: Make yourself the administrator, about 5 minutes

1. Open your website → **Register your committee** → fill in the form → **Register**.
2. Open the confirmation email and click the link, then sign in. You will see **"Waiting for approval"**. That's expected.
3. Supabase → **SQL Editor** → **New query** → paste this, **replacing the email with yours**, then click **Run**:

   ```sql
   update profiles set role = 'admin', status = 'approved' where email = 'you@example.com';
   ```

4. Refresh the website. You now see the full menu including **Admin**. 🎉

### First things to do as admin
1. **Admin → Offices:** add each SPM office (e.g. Name: *Office of SPM Robin Cantimbuhan*, SPM code name: *Robin Cantimbuhan*, Prefix: *SPMRC*).
2. **Admin → Accounts:** set **your own** office in the dropdown.
3. **Admin → Barangays & organizations → Import list:** upload the official list (Excel or CSV) or paste it from Google Sheets.
4. **Admin → Accounts → Budget encoder:** tick it for the people who will encode budget reports.
5. **DTR → Rules & settings:** type the certifying official's name and upload their e-signature.
6. Ask each committee to register. Approve them under **Admin → Accounts**.

---

## Updating a site that is already online (no Git needed)

Do these two things every time you receive a new version (`sp-dasma.zip`):

**1. Database (only when the update includes a new SQL file).** Supabase → **SQL Editor** → **New query** → paste the new file (for this update: `supabase/migrations/0010_org_barangay_cleanup.sql`; run `0007_…`, `0008_…` and `0009_…` first if you have not run them yet) → **Run**. It is safe to run more than once.

**2. Code — upload in 3 batches** (GitHub accepts at most 100 files per upload, and `src` has a few more). Extract the zip first. Dragging works for folders; the "choose your files" button only takes files.

| Batch | Where on github.com | Drag these from the extracted `sp-dasma` folder | Then |
|---|---|---|---|
| 1 | open the **`src`** folder of your repository → **Add file → Upload files** | from inside `sp-dasma\src`: the folders **`app`**, **`components`**, **`hooks`**, **`lib`** and the file **`middleware.ts`** | **Commit changes** |
| 2 | still in **`src`** → **Add file → Upload files** | from inside `sp-dasma\src`: the folder **`features`** | **Commit changes** |
| 3 | the **main page** of the repository → **Add file → Upload files** | from `sp-dasma`: the folders **`public`**, **`supabase`**, **`scripts`**, **`docs`** and the files **`package.json`**, **`package-lock.json`** | **Commit changes** |

Uploading replaces the old files. Vercel rebuilds after each commit (about 2 minutes); the last one is the one that counts. In Vercel → **Deployments**, wait for **Ready**, then open the site and refresh.

> Make sure batches 1 and 2 are done **inside** `src` (the address bar ends with `/tree/main/src`). Otherwise the folders end up in the wrong place.

## How updates will work from now on

**If Claude uploads (Way A):**
1. Claude makes the change and uploads it to a **separate branch** (a draft copy) on GitHub.
2. Vercel automatically makes a **Preview link** for that draft. Claude sends it to you. The real website is not touched.
3. Test the preview. If it's good, open GitHub → **Pull requests** → open Claude's → **Merge pull request** → **Confirm merge**.
4. About 2 minutes later, the real website is updated. Nothing else to do.

**If you upload yourself (Way B):**
1. Download the new `sp-dasma.zip` from Claude and extract it **over** your `Documents\sp-dasma` folder (choose **Replace the files**).
2. Open GitHub Desktop: it lists what changed. Type a summary (e.g. `Sprint 4 update`) → **Commit to main** → **Push origin**.
3. Vercel sees the change and updates the website in about 2 minutes.

**Database changes:** if an update includes a new file such as `supabase/migrations/0006_….sql`, run it **once** in the Supabase **SQL Editor** (like Part 1.2) **before** the website update goes live.

## Common problems

| What you see | What to do |
|---|---|
| Website shows an error or empty lists right after deploying | Vercel → your project → **Settings → Environment Variables**: check both keys (no extra spaces). Then **Deployments → ⋯ → Redeploy**. |
| Confirmation email opens a page that doesn't load | Do Part 4 again: Site URL and Redirect URLs. |
| Stuck on "Waiting for approval" | An admin must click **Approve** *and* choose an office in **Admin → Accounts**. |
| Changes made by other committees don't appear by themselves | Make sure all four SQL files ran successfully (Part 1.2). |
| Photo or e-signature upload fails | Supabase → **Storage**: there should be two buckets, `attachments` and `signatures`. If missing, file `0001_init.sql` didn't finish. Send me a screenshot. |
| DTR text not lined up after printing | Print at **100 % / Actual size** (not "Fit to page"). Then use **DTR → Rules & settings → Advanced calibration**. |

## Glossary
- **Repository (repo):** the project folder on GitHub.
- **Branch:** a draft copy of the code for testing changes.
- **Pull request (PR):** a request to put a draft into the real version. Clicking **Merge** approves it.
- **Deploy:** publishing the website.
- **Environment variable:** a setting (like the Supabase keys) kept outside the code for safety.
- **Migration:** a SQL file that adds or changes database tables. Run each one once, in order.
