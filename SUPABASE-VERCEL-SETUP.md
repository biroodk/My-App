# Folder Locker Community — Supabase database + Vercel hosting

This configuration removes the Community API's runtime dependency on Netlify. Vercel serves `install-page/` and runs the Node API handlers in `api/`. Supabase Postgres stores accounts, sessions, posts, likes, comments/replies, announcements, and visit/download counters; Supabase Storage privately stores avatars.

## One-time setup

1. In the Supabase project you own, open **SQL Editor** and run the full file `supabase/migrations/20261023000000_folder_locker_vercel_supabase.sql`.
2. In Supabase **Project Settings → API Keys**, copy the **Project URL** and the server-side **Secret key** (`sb_secret_...`). If your project only shows the legacy `service_role` key, that is also supported. This key has elevated database/storage access: never paste it into HTML, GitHub source files, chat, or a public repository.
3. In Vercel, import `biroodk/My-App` (or import this updated repository ZIP into your repo). Set the project Root Directory to the repository root. Use `npm run build` as the build command and `install-page` as the output directory. The provided `vercel.json` already defines these values.
4. Add the following Vercel environment variables for **Production** (and Preview only when wanted):
   - `SUPABASE_URL` = your Supabase Project URL
   - `SUPABASE_SECRET_KEY` = the server-side Secret key (`sb_secret_...`). For an older project using only the legacy key, use `SUPABASE_SERVICE_ROLE_KEY` instead.
   - `SYSTEM_SETUP_SECRET` = a long, private, one-time administrator bootstrap secret (optional but recommended for setting up the Community admin)
5. Redeploy the Vercel project after saving environment variables. The website Community calls `/api/community` and `/api/stats` on the same Vercel origin; no Supabase secret is placed in the browser.
6. After Vercel gives you the real HTTPS project URL, update the in-app Games links from Termux with `bash tools/set-community-site-url.sh "https://your-real-project.vercel.app/"` (replace this example with the actual URL), then commit/push and build the APK. Do not use the example URL literally.

## Community admin

Open the Community's **First-time System administrator setup** panel once and enter the exact `SYSTEM_SETUP_SECRET` configured in Vercel plus a strong password. It creates the built-in `FolderLockerAdmin` administrator once; never share either secret.

## Data and migration cautions

- The new Supabase database starts empty. The uploaded ZIP contains the Netlify Blobs code, but it does not contain the existing hosted Netlify database records. Old Netlify Community accounts/posts cannot be migrated from source code alone. Do not delete the old Netlify project or its data store until you have confirmed whether its existing data can be exported.
- The Supabase server-side secret key must exist only in Vercel's server-side environment variables. Do not put it in `install-page/index.html`, application assets, or a public GitHub secret file.
- Do not run the migration repeatedly in a way that deletes tables. This migration is designed to be repeatable and does not drop existing records.

## What is available before deployment?

The source code is prepared, but it is not live until the SQL migration has been run, Vercel environment variables have been set, and Vercel has deployed successfully. A Netlify pause cannot be bypassed merely by changing local source files.
