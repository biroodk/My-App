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
- GitHub's release asset `download_count` is displayed as APK downloads. It records GitHub asset download requests, not proof that the APK was installed or that the entire transfer completed successfully.
- The unique visit count uses a random ID stored in each browser's local storage and counts it once per 24 hours. Clearing browser data or using another browser/device may count as a new visitor. Concurrent hits may make the simple aggregate counter approximate.
- A Netlify site must be connected to the GitHub repository before the public page and stats endpoint work. This package does not deploy to your Netlify account automatically.

## `sound4.mp3`
The file was not present in the source ZIP or available in this workspace. Copy it from your phone's Downloads folder into `app/src/main/assets/sound4.mp3` before committing if you want it included in the APK. Do not create an empty placeholder because that would not be playable audio.
