# Folder Locker public installation page (Netlify)

## Included
- `install-page/index.html`: neon install/update landing page using `app/src/main/assets/icon.png`.
- `netlify.toml` and `netlify/functions/stats.mjs`: Netlify publish settings and a visitor counter that counts each browser ID once per 24 hours.
- `.github/workflows/build-apk.yml`: keeps the existing Actions artifact and publishes/replaces `Folder-Locker.apk` on the stable GitHub Release URL.
- `app/build.gradle`: uses the GitHub Actions run number for increasing Android `versionCode` and `versionName`, so newer release APKs can update older release APKs.
- `games.html`: adds the native share sheet hook for the public install URL.

## Publish on Netlify from a phone
1. Push this source to `biroodk/My-App` on `main`. Wait for the GitHub Actions build to succeed. The workflow will upload the APK artifact and create/update the stable `latest` release with asset `Folder-Locker.apk`.
2. In Netlify, create a site by importing `biroodk/My-App` from GitHub. Set the production branch to `main`. The included `netlify.toml` sets the publish directory to `install-page`, build command to `npm run build`, and function directory to `netlify/functions`.
3. After Netlify gives you the actual public URL, open `app/src/main/assets/games.html` and replace `https://YOUR-NETLIFY-SITE.netlify.app/` in `FOLDER_LOCKER_INSTALL_URL` with that exact URL. Commit/push this change and wait for a new APK build. (This is needed because the Games page is packaged inside the native app.)
4. Share the new APK build with testers and tap Games → Share this app to confirm the Android share sheet contains the Netlify URL.

## Honest behavior/limits
- The install page checks GitHub Releases for the latest release every time it opens. After the download, the visitor can tap `I installed it successfully` to mark that version as `Installed ✓` in that browser. If a newer release is published, the button becomes `Update Folder Locker` and shows the requested update message. This is user-confirmed browser state, not automatic proof of the installed APK version.
- Android does not let a normal webpage silently install/update a native APK. The visitor must download the APK and approve installation in Android. The page cannot reliably know whether installation finished, so it does not falsely label the app `Installed`.
- The `APK download requests` counter records clicks on the Install/Update button through the Netlify stats function. It does not prove that the APK download completed or that the app was installed.
- The unique visit count uses a random ID stored in each browser's local storage and counts it once per 24 hours. Clearing browser data or using another browser/device may count as a new visitor. Concurrent hits may make the simple aggregate counter approximate.
- A Netlify site must be connected to the GitHub repository before the public page and stats endpoint work. This package does not deploy to your Netlify account automatically.

## `sound4.mp3`
The file was not present in the source ZIP or available in this workspace. Copy it from your phone's Downloads folder into `app/src/main/assets/sound4.mp3` before committing if you want it included in the APK. Do not create an empty placeholder because that would not be playable audio.


## Community section (Supabase)

The community is served by the Netlify Function `netlify/functions/community.mjs`, routed through `/api/community`. Supabase stores user accounts, sessions, posts, likes, comments, and replies. The community displays 20 posts per page with Previous/Next pagination. Profile pictures are uploaded separately to Supabase Storage and are limited to JPEG, PNG, WebP, or GIF files up to 6 MB.

### Supabase setup

1. Create a Supabase project and open its SQL Editor.
2. Run the complete SQL migration from `supabase/migrations/20261017000000_folder_locker_community.sql`. Review the SQL before running it and confirm it completes successfully.
3. In Supabase project settings, copy the project URL and the service-role key. Never put the service-role key in frontend JavaScript, public files, screenshots, or Git.
4. In Netlify, open the site's environment-variable settings and add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Set them for the production deploy context and any deploy previews you intend to test.
5. Deploy the site after the database migration and environment variables are configured. Check the Netlify function logs if the community API returns an error.

The migration creates the community tables, applies row-level security, and configures the avatar storage bucket. The function uses the service-role key server-side; do not expose that key to the browser or grant public database access as a workaround.

### Security and testing notes

Passwords are hashed server-side. Test registration, login, posting, likes, comments, replies, pagination, and avatar upload on the deployed site before sharing it publicly. The local JavaScript syntax checks do not confirm that the Supabase project or live API is working. Arrange a verified password-recovery process before relying on accounts for sensitive or high-traffic use.


## System administrator and official announcements

1. In Supabase SQL Editor, apply these migrations in order: `20261017000000_folder_locker_community.sql`, then `20261018000000_folder_locker_system_admin.sql`, then `20261019000000_atomic_system_bootstrap.sql`. The third migration serializes first-time System setup inside the database so concurrent setup requests cannot create multiple first administrators. Keep each migration file intact and confirm each one succeeds before deploying.
2. In Netlify site environment variables, add `SYSTEM_SETUP_SECRET` with a long random value (at least 32 random bytes). Generate one in Termux with `openssl rand -hex 32`. Keep it private; never put it in the HTML, Git repository, or a public message. The backend also requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy the site and function after the migration is complete. Open the community's “First-time System administrator setup” panel. Enter the secret and choose a password of at least 16 characters containing uppercase, lowercase, a number, and a symbol. The secret is only accepted while no administrator exists. The setup creates or securely resets the reserved `System` account and assigns the administrator role.
4. Log in as `System` with the chosen password. The System Administration panel provides community counts, website visit/download-request totals, newest users, official announcements, and admin deletion of posts. Admin privileges are checked server-side; changing a username or browser storage cannot grant them.
5. Profile display-name colors are available to users; badge assignment is restricted to administrators. Official announcement titles and bodies are rendered as bold, distinct official notices.

The download metric is a count of requests/clicks recorded by the install page, not proof that the APK download completed or that Android installed it. Website visits are counted using the existing daily-per-browser visitor ID logic.
