# Folder Locker repair package — October 23, 2026

## Changes in this package

- Password fields in the app's onboarding and Community forms request no Android/browser password autofill suggestions (`autocomplete="off"` plus password-manager ignore hints). The Android WebView excludes Android Autofill descendants when supported.
- Community loading now avoids re-toggling a password form while one of its fields has focus, reducing focus/keyboard loss when slow network responses arrive.
- Added a Vercel Node API version of Community and stats backed by the user's Supabase Postgres project and private Supabase Storage bucket. See `SUPABASE-VERCEL-SETUP.md`.
- Added repeatable Supabase SQL migration at `supabase/migrations/20261023000000_folder_locker_vercel_supabase.sql`.
- Added `tools/use-download-video.sh` to copy the user's own `video1.mp4` from Android Downloads into the bundled sample asset.
- Added SHA-256-gated video migration: only the exact old bundled sample is replaced in an existing vault. A custom video named `video1.mp4` with different contents is preserved.
- Existing sample audio mapping remains unchanged: `sound1.mp3` is retained, `sound2.mp3` is the old sound4 audio, `sound3.mp3` is the old sound5 audio, and the removed old sound files are not reintroduced.
- No vault folder, account preference, password hash, or user's non-sample files are cleared by these source changes.

## Important limits

- The replacement video from the user's phone is not embedded in this ZIP because it was not included in the upload. Run the helper script in Termux after copying the source files into the project and before building the APK.
- A normal Android update preserves app data when Android accepts it as the same application signed with the same certificate. Do not uninstall the current app to install an update, because Android normally deletes private app data on uninstall. Keep the old app installed until an update installs successfully and you confirm the vault files remain.
- The Community API is configured for Vercel + Supabase but is not live until the SQL migration and environment settings are applied in those services.
- Previous Netlify-hosted Community records are not included in this source ZIP and cannot be automatically recovered from code alone.


## APK update-signature caution

The existing GitHub Actions workflow builds a debug APK without an explicitly configured persistent signing keystore. Android accepts an in-place update only when the package ID and signing certificate match. I have not switched this project to a new signing key because doing so could make the installed APK reject the update; once a key is changed, Android may require uninstalling, which deletes the app's private data. Do not uninstall the installed app to troubleshoot an update. If Android reports a signature/package conflict, stop before proceeding. A stable signing-key migration must be planned separately with a safe backup.
