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
