# Folder Locker — Final v3

Final Android build source for the Folder Locker app.

## Final security behavior
- Password is stored as SHA-256 hash.
- Fingerprint is OFF by default on a fresh install.
- Settings contains one **Login Information** password section.
- Fingerprint setting is the single ON/OFF authority for login biometric access.
- Home displays **Biometric ON/OFF** from the native setting.
- Disabled fingerprint cannot unlock the vault and shows the required styled message.
- Android phone back is intercepted so it navigates back through app sections instead of unexpectedly exiting.

## Final vault behavior
- Files are stored inside the app's private vault, not browser localStorage.
- Unlimited nested folders are supported.
- Main Files page accepts all file types.
- Images, Videos, Music and Documents pages scan the complete vault recursively.
- File menus include Rename, Copy, Move, Share, Open with, Export, Remove from Folder Locker and Delete.
- Image viewer supports zoom and left/right navigation.
- Export uses Android's folder chooser.
- Remove from Folder Locker exports to the user-selected location and then removes the vault copy.
- Import attempts to remove the original source document after a successful vault copy; if the source provider refuses deletion, the app reports that instead of pretending it was removed.

## UI preservation
The existing Home and Games pages are retained. The supplied Files page architecture/style is used as the main Files-page reference.


## v3 fixes
- Imports are copied to the private vault completely before the original is removed.
- Added real Android Open With (ACTION_VIEW) support for files that are not previewed in Folder Locker.
- Device Credential (phone PIN/pattern/password) is now a real BiometricPrompt fallback on Android 14+.
- Settings Device Credential switch is connected to native storage/security state.
- Premium alert JavaScript syntax and animation reset were fixed.

## Follow-up repair set (2026-10-23)
- Welcome/onboarding screens replay from the first animation whenever the app launches. Existing users pass the first three animation screens, then continue directly to password login; only the first-time registration and vault-securing progress are skipped after a password is created.
- All category pages use the same multi-select “Move selected files back to phone storage” flow as the main Files page. Vault copies are removed only after native export reports verified copies.
- Community registration preserves the chosen Register tab while the initial API request finishes, preventing the initial online response from unexpectedly changing the form and dismissing the keyboard. Username/password fields also disable autocapitalization and autocorrect.
- The original Netlify Functions remain as a legacy fallback only. The updated Community deployment uses the Vercel Node API routes plus Supabase Postgres/Storage; follow `SUPABASE-VERCEL-SETUP.md` for the active setup path.
- The install page counts a download only after it receives a complete APK response. A direct-download fallback is not counted when the browser prevents completion tracking; this is not an Android-installation counter.

See `SUPABASE-VERCEL-SETUP.md` for current Community deployment steps. `INSTALL-PAGE-SETUP.md` documents the legacy Netlify deployment. These source changes do not become live until the website is deployed to Vercel and a new Android APK is built and tested.


## Updated Community deployment (Supabase + Vercel)

See [`SUPABASE-VERCEL-SETUP.md`](SUPABASE-VERCEL-SETUP.md) for the database migration and deployment steps. The source now contains Vercel-compatible `/api/community` and `/api/stats` endpoints so the Community does not depend on Netlify Functions after deployment.

## Replacement sample video

After copying this source into the project on your phone, run `bash tools/use-download-video.sh "$HOME/storage/downloads/video1.mp4"` in Termux before building. The script uses your own video and the app safely migrates the old sample only if its SHA-256 matches the exact previous bundled sample.

## Updating without clearing local vault data

Install an APK as an update over the existing app and do not uninstall the current version. Android retains the private vault and preferences on ordinary updates when application ID and signing certificate match. The app source does not clear the vault during upgrades.

**APK signing note:** The workflow currently produces a debug APK without an explicitly stored, stable keystore. Keep the installed app and its data; do not uninstall it if Android refuses an update. See `CHANGES-20261023-FINAL-FIX.md` before changing signing keys.


## Community UX and session update (2026-10-24)
- The install page links to a separate `/community.html` page, so the community experience no longer contains the APK install-page content.
- The community feed previews up to three comments and one reply per comment. **Read more** opens one post with its full comment/reply thread; **Back to posts** returns to the feed.
- Community post text and comment/reply text are larger for phone readability.
- Server-side community sessions expire after two hours. Expired sessions are returned to the login form.
- The app's Games-page online/share link now uses `https://folder-locker-my-first-app.vercel.app/`.

## First system administrator account

Preferred setup method (system password is never sent in the provisioning request):

1. In Termux, generate a strong password:
   ```sh
   openssl rand -base64 30 | tr -d '\\n'; printf '\\n'
   ```
2. Copy the generated password privately. In Vercel → Project → Settings → Environment Variables, set `SYSTEM_ADMIN_PASSWORD` to that exact value for Production, then redeploy.
3. After the deployment completes, run:
   ```sh
   bash tools/provision-system-admin.sh "https://folder-locker-my-first-app.vercel.app"
   ```
   The script requests one-time account creation without transmitting the password. A successful response names the account `FolderLockerAdmin`.
4. Open `/community.html` and use the normal **Log in** form with username `FolderLockerAdmin` and the generated password. Administrator-only features remain available.

The password must be at least 20 characters and include uppercase, lowercase, a number, and a symbol. Keep it private and never commit it to Git. If the system account already exists, the endpoint will not overwrite its password or role. The older one-time `SYSTEM_SETUP_SECRET` form remains available as a fallback for an account that has not yet been created.


## Import your replacement sample video and PDF (Termux)

Place the new files in Android Downloads as exactly `video1.mp4` and `About.pdf`. After extracting this project, run:

```bash
cd "$HOME/Folder-Locker-Final-v3-FIXED/Folder-Locker-Final-v3" || exit 1
bash tools/update-downloaded-assets.sh
```

The script validates both files and refuses to import the known old bundled samples. Once copied, rebuild and install the new APK. Existing vault files are replaced only when their SHA-256 matches the previous shipped sample, so user-owned files with those names are preserved.
