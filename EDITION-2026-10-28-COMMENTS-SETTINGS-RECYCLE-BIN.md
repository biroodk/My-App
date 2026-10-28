# Folder Locker Community Edition — 2026-10-28

## Changes
- Added small profile avatars to comments, matching the 25px reply avatars.
- Added administrator Edit and Save Changes controls for public announcements.
- Made account-settings submissions single-flight: the save button disables immediately, the settings panel closes while saving, and it reopens if the request fails. Fields reset only after successful confirmation.
- Added clearer handling for network errors during password changes. If the response is lost, password inputs are cleared and the user is told the save result may be uncertain rather than being incorrectly told the password was wrong.
- Added a 30-minute recycle bin for deleted posts. The post, comments, replies, and likes are snapshotted before removal. Admins can restore the full post or permanently delete its recycle-bin entry.
- Added a Recycle bin statistic and admin dashboard view.

## Validation
- `node --check api/community.mjs` passes.
- The inline JavaScript extracted from `install-page/community.html` passes `node --check`.
- `git diff --check` should be run after applying this patch in the project repository.

## Recycle-bin expiry note
Expired recycle-bin entries are not recoverable after 30 minutes. Physical cleanup is performed during subsequent community API requests, so an expired snapshot may remain stored until the next API request runs cleanup.

## Files
- `api/community.mjs`
- `install-page/community.html`
