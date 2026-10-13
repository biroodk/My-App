# Folder Locker — Fixes Applied (2026-10-13)

Based on the uploaded `Folder-Locker-Audited-Source.zip` at commit `45d62df`.

## Changes

1. **WhatsApp offline guard:** The home page checks `navigator.onLine` before opening WhatsApp. The Android bridge also checks for a validated active internet network (`NET_CAPABILITY_INTERNET` and `NET_CAPABILITY_VALIDATED`) and returns an offline result without launching WhatsApp when unavailable. Added `ACCESS_NETWORK_STATE` permission. The home page shows the requested “No Internet Connection” popup.
2. **Recursive search:** Search on `files.html` searches files and folders across the full vault tree, including nested folder paths. Clearing the query restores the existing current-folder view. Home page category links were not changed.
3. **Image long-press selection:** Improved long-press handling on file cards and image-category cards, disabled native thumbnail image drag/context menus, and increased the movement threshold slightly while preserving vertical scrolling.
4. **Extension-preserving rename:** Rename dialogs in Files, Images, Videos, Music, Documents, and Category views now prompt for the filename without its extension. Shared JavaScript helpers retain the original extension, and the Android rename bridge enforces the original extension even if a different extension is entered.

## Validation performed

- All inline JavaScript blocks in root asset HTML pages passed `node --check`.
- `vault.js` passed `node --check`.
- `AndroidManifest.xml` parsed successfully as XML.
- The source ZIP passed `unzip -t` after packaging.

A fresh Android APK build and on-device testing are still required to verify Android compilation, offline popup behavior, nested search, long-press selection, and renaming at runtime.


## Follow-up update: music selection and public install page
- Music cards now support long-press selection with movement cancellation so normal scrolling does not trigger selection. The viewer supports horizontal swipe navigation between eligible files. Music header/viewer controls use the existing cyan/navy theme.
- Added `install-page/`, Netlify configuration, and a Netlify Blobs visitor counter (once per 24 hours per browser ID).
- GitHub Actions now publishes/replaces the stable `Folder-Locker.apk` release asset and increments Android versionCode/versionName using the workflow run number.
- Games page share button now uses Android's native share sheet after `FOLDER_LOCKER_INSTALL_URL` is changed to the actual Netlify URL.
- `sound4.mp3` was not included because it was not present in the supplied source ZIP/workspace.
