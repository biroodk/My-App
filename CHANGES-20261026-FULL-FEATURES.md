# Folder Locker full-feature update — 26 October 2026

## Community and administration
- Added admin-only `SanShania` account creation with a strong password and confirmation.
- Added admin dashboard open/close controls, clickable aggregate statistics, and detailed views for users, posts, comments, replies, likes, announcements, and admin notes.
- Added private administrator notes with create, edit, and delete actions; edits and deletions require confirmation.
- Added server-enforced pause/resume of community chat. While paused, only admins can publish posts; members can like/comment/reply under admin-authored posts only.
- Added newest-first reply ordering, a distinct reply style, and small author avatars on replies.
- Increased community text/control sizes and expanded the community panel to full width.
- Settings fade out and collapse after six seconds when changes save; a button reopens them.

## App assets
- Added `tools/update-downloaded-assets.sh` to import both `video1.mp4` and `About.pdf` from Android Downloads into `app/src/main/assets/`, validating their signatures and SHA-256 hashes before replacing them.
- `MainActivity.java` now replaces the shipped old sample video/PDF in the vault only if their hashes match the exact bundled old samples. This preserves user files with the same names that have been modified or replaced.
- The replacement video/PDF were not present as separate uploaded files in the source ZIP, so the ZIP still carries the old embedded samples until the import script is run on the user's phone.
- Increased Games page links, cards, and touch targets for readability.

## Validation performed
- `node --check` passed for the community API and related modules.
- Community inline JavaScript passed `node --check`.
- `bash -n` passed for the asset import and account setup scripts.
- `vercel.json` parsed successfully and `npm run build` passed.
