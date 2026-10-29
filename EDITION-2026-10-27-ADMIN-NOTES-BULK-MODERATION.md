# Folder Locker Community Edition — 2026-10-27

Changes in this patch:
- Admin notes dashboard combines the current notes prefix with supported older note prefixes and attempts a read-only fallback to the prior `folder-locker-community-v1` store.
- Legacy notes are normalized for display and included in the admin-notes statistic; editing migrates the note into the current `folder-locker-community-v2` store.
- Notes have Edit/Delete controls in both the notes board and the Admin Notes statistics detail panel.
- Admin can select and bulk-delete posts; associated comments, replies, and likes are removed with each post.
- Admin can select and bulk-delete comments; replies belonging to deleted comments are also removed.
- Bulk deletion is protected by administrator-role checks, confirmation dialogs, and batches of up to 100 records.
- Existing community styling and general page layout are retained.

Files to replace in the project root:
- `api/community.mjs`
- `install-page/community.html`

This patch does not alter or reset the Supabase database. If older notes were stored only in an unavailable external Netlify Blobs store and were never migrated into the Supabase key-value table, this patch cannot retrieve those records automatically; those notes would need an export from the old store.
