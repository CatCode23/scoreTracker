# Deployment: GitHub Pages and Supabase

## What runs where

| Piece | Where it runs | Notes |
|---|---|---|
| React SPA | GitHub Pages | Static files only. Public. |
| Database, Auth, RLS, Realtime | Supabase | All data protection is enforced here. |
| Secrets | Nowhere in GitHub | Only the public URL and anon key are used. |

## 1. Supabase

Follow README → *Supabase setup*, steps 1–6, in this order:

1. Create the project.
2. Run the migrations in order.
3. Run `seed.sql`.
4. Configure Auth: invite-only, add `{{ .Token }}` to the email template, and set the
   redirect URLs.
5. Bootstrap the first admin.
6. Load the schedule for the tournament year.

Recommended:

- Configure **custom SMTP**. The default sender is rate-limited.
- Turn on **Point-in-time recovery** or take a manual backup before the event.

## 2. GitHub repository settings

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → Variables** tab → *New repository
   variable*:
   - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the anon / publishable key
   - optional: `VITE_APP_NAME`
   - optional: `VITE_GITHUB_PAGES_BASE` = `/<REPOSITORY_NAME>/`. It defaults to the
     repository name automatically.

   Use **Variables**, not Secrets. These values are public and end up in the browser
   bundle. Never add the service-role key.
3. **Settings → Environments → github-pages**: optionally restrict deployments to `main`.
4. Optional: protect `main` with required status checks, using the `build` job.

## 3. Deploy

Push or merge to `main`. The workflow in `.github/workflows/deploy-pages.yml` then runs
these steps:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `./scripts/test-db.sh`: applies all migrations to a throwaway Postgres and runs the
   RLS and workflow assertions
6. `npm run build`
7. uploads `dist/` and deploys it with the official Pages actions

The site goes live at `https://<owner>.github.io/<REPOSITORY_NAME>/`. For this
repository that is `https://catcode23.github.io/scoreTracker/`.

You can also run the workflow manually: **Actions → Deploy to GitHub Pages → Run
workflow**.

## 4. The Vite base path

`vite.config.ts` reads `VITE_GITHUB_PAGES_BASE` and falls back to `/scoreTracker/`. CI
sets it to `/<repository name>/`. If the base path is wrong, the page loads blank and the
browser console shows 404 errors for `/assets/...`.

## 5. QR codes

Generate QR codes for these URLs:

- `https://catcode23.github.io/scoreTracker/#/public`
- `https://catcode23.github.io/scoreTracker/#/sport/SOC`

The event codes are `SOC`, `CMB`, `ESP`, `DB`, `BSK`, `FFB`, `BPT` and `BIG7`. A QR code
is navigation only. Scoring always requires a named staff login.

## 6. Rollback

- **Frontend:** re-run an earlier successful workflow run, or revert the commit on `main`.
- **Data:** every change is in `audit_log`, with old and new values. Correct mistakes
  through the app's correction and void workflow. Use a Supabase backup for disasters.
