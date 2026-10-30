# Folder Locker — Admin download records and community profiles

Based on the uploaded `Folder-Locker-Latest-main.zip` checkpoint `c961eca`, with the already-deployed admin download/profile features from commit `ee430a7` preserved.

## Community presentation
- The community page now has a clearly visible cyan board border with a layered neon shadow.
- Public announcement cards sit in a framed notes panel and have a stronger neon box shadow.

## Completed APK download records
- The install page logs a record only after the complete APK transfer finishes successfully.
- The administrator can click **Completed APK downloads** in the dashboard to inspect up to the 300 latest records.
- Each new record contains the hosting-provided country code, available network city/region, best-effort device model/platform/browser, and server timestamp.
- The IP address is not stored in the download record.
- Exact GPS coordinates are requested only when a downloader checks the optional location-sharing box and then grants the browser's location permission.
- District and town/area labels are optional fields entered by the downloader. The admin view includes a map link when opted-in GPS coordinates are available.
- The browser may not expose a commercial phone model on every device; in that case the dashboard reports the available platform/device description.
- Older aggregate-only download events remain counted and appear as legacy records without fabricated location or device details.

## Registered-user activity
- Every registered user in the admin user list is selectable and shows their profile picture.
- The profile view separates posts authored by that user from posts on which that user commented.
- Each activity item includes an **Open this post** link/button to inspect the post and its discussion in the community feed.

## Deployment and database notes
- Uses the existing Vercel API routes and Supabase-backed key/value stores.
- No new environment variables or SQL migration are required for these changes.
- Deploy the updated project to Vercel before testing the dashboard. New detailed download records begin with completed downloads after deployment; previous aggregate counts cannot be reconstructed into exact location/device history.


## Public announcement color and account input improvements (2026-10-31)
- Public announcement cards retain the exact cyan background `rgba(0,255,255,0.5)` while keeping their neon border and box shadow.
- Usernames now accept 1–32 printable characters, including spaces, punctuation, symbols, and upper/lowercase letters. Names are case-insensitive for uniqueness and login; the displayed spelling is preserved. Repeated internal whitespace is normalized to a single space.
- Registration requires username, password, and password confirmation; the server verifies the two password values match.
- Password changes require the current password, new password, and matching confirmation as a complete set.
- A **Show password** checkbox is provided beside relevant password fields. It is not a required input.

## Account form and session updates (2026-10-31)
- Public announcement cards use the exact background `rgba(0,255,255,0.5)`.
- Usernames accept 1–32 printable characters, including spaces and symbols, with case-insensitive uniqueness and login lookup.
- Registration and password changes require matching confirmation fields; password-change fields are all required together.
- Show password controls are available for login, registration, account password changes, and administrator account creation.
- Login includes a “Remember me” checkbox. Without it, sessions retain the two-hour expiry and use session storage in the browser. With it, the session lasts up to 30 days and the token is stored in local storage.
