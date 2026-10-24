# Folder Locker community update — 2026-10-24

- Added a dedicated `install-page/community.html` so community login and posts are separate from the APK install page.
- The install page now links to the dedicated community page.
- Increased post, comment, and reply text sizes for readability.
- The feed previews three comments and one reply per comment; **Read more** opens a single post and its complete thread, and **Back to posts** returns to the feed.
- Community API sessions expire after two hours.
- Updated old Netlify community/install URL references to `https://folder-locker-my-first-app.vercel.app/`.
- System administrator setup remains a one-time, setup-secret-protected action. Once created, `FolderLockerAdmin` signs in through the normal login form and retains administrator features.
- Added a preferred one-time system-account provisioning action that reads `SYSTEM_ADMIN_PASSWORD` only from Vercel environment variables; the Termux helper sends no password. The created `FolderLockerAdmin` account signs in through the normal login form.
