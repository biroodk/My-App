#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOADS="${HOME}/storage/downloads"
VIDEO_SOURCE="$DOWNLOADS/video1.mp4"
PDF_SOURCE="$DOWNLOADS/About.pdf"
VIDEO_DEST="$ROOT/app/src/main/assets/video1.mp4"
PDF_DEST="$ROOT/app/src/main/assets/About.pdf"
JAVA_FILE="$ROOT/app/src/main/java/com/securevault/app/MainActivity.java"
OLD_VIDEO_SHA="a79d8ee8c13eda555522c5c7efa8f90dc63f8d9fd75b7fcde0fda537ade3461b"
OLD_PDF_SHA="21618b1ee4ca7d539f2650e5ba151de7c030d54c733fc7119489440be059e173"

fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ -d "$DOWNLOADS" ] || fail "Android Downloads folder was not found at $DOWNLOADS. Run termux-setup-storage first and grant access."
[ -s "$VIDEO_SOURCE" ] || fail "Put the replacement video at $VIDEO_SOURCE with the exact name video1.mp4."
[ -s "$PDF_SOURCE" ] || fail "Put the replacement PDF at $PDF_SOURCE with the exact name About.pdf."

VIDEO_SIGNATURE="$(head -c 64 "$VIDEO_SOURCE" | grep -ao 'ftyp' | head -n 1 || true)"
[ "$VIDEO_SIGNATURE" = "ftyp" ] || fail "Downloads/video1.mp4 does not look like an MP4 file (missing ftyp signature). Nothing was changed."
PDF_SIGNATURE="$(head -c 5 "$PDF_SOURCE" || true)"
[ "$PDF_SIGNATURE" = "%PDF-" ] || fail "Downloads/About.pdf does not begin with the PDF signature. Nothing was changed."

VIDEO_SHA="$(sha256sum "$VIDEO_SOURCE" | awk '{print $1}')"
PDF_SHA="$(sha256sum "$PDF_SOURCE" | awk '{print $1}')"
[ "$VIDEO_SHA" != "$OLD_VIDEO_SHA" ] || fail "Downloads/video1.mp4 is the same old 2.1 MB bundled sample. Nothing was changed. Choose the newer video."
[ "$PDF_SHA" != "$OLD_PDF_SHA" ] || fail "Downloads/About.pdf is identical to the old bundled sample. Nothing was changed. Choose the replacement PDF."

VIDEO_SIZE="$(wc -c < "$VIDEO_SOURCE" | tr -d ' ')"
OLD_VIDEO_SIZE="$(wc -c < "$VIDEO_DEST" 2>/dev/null | tr -d ' ' || printf '0')"
if [ "$VIDEO_SIZE" -le "$OLD_VIDEO_SIZE" ]; then
  printf 'WARNING: The Downloads video (%s bytes) is not larger than the bundled version (%s bytes).\n' "$VIDEO_SIZE" "$OLD_VIDEO_SIZE"
  printf 'If you are certain this is the correct replacement, type exactly REPLACE-SMALLER-VIDEO: '
  read -r CONFIRM
  [ "$CONFIRM" = "REPLACE-SMALLER-VIDEO" ] || fail "Video replacement cancelled. No assets were changed."
fi

mkdir -p "$(dirname "$VIDEO_DEST")"
VIDEO_TMP="$VIDEO_DEST.import.tmp"
PDF_TMP="$PDF_DEST.import.tmp"
cleanup(){ rm -f "$VIDEO_TMP" "$PDF_TMP"; }
trap cleanup EXIT
cp "$VIDEO_SOURCE" "$VIDEO_TMP"
cp "$PDF_SOURCE" "$PDF_TMP"
[ -s "$VIDEO_TMP" ] && [ -s "$PDF_TMP" ] || fail "A temporary copy was empty. Nothing was installed."
[ "$(sha256sum "$VIDEO_TMP" | awk '{print $1}')" = "$VIDEO_SHA" ] || fail "Video copy verification failed."
[ "$(sha256sum "$PDF_TMP" | awk '{print $1}')" = "$PDF_SHA" ] || fail "PDF copy verification failed."
mv -f "$VIDEO_TMP" "$VIDEO_DEST"
mv -f "$PDF_TMP" "$PDF_DEST"
trap - EXIT

# Safely add the About.pdf sample migration to the current Java file without
# replacing that entire file or disturbing unrelated local changes.
python - "$JAVA_FILE" "$OLD_PDF_SHA" <<'PY'
from pathlib import Path
import re, sys
path = Path(sys.argv[1])
pdf_sha = sys.argv[2]
text = path.read_text()
video_call = 'migrateLegacySampleVideoIfMatching("a79d8ee8c13eda555522c5c7efa8f90dc63f8d9fd75b7fcde0fda537ade3461b");'
if video_call not in text:
    raise SystemExit('ERROR: Could not find the known old-video migration call in MainActivity.java. Assets were imported, but the Java migration patch was not applied.')
if 'migrateLegacySamplePdfIfMatching(' not in text:
    text, count = re.subn(r'^(\s*)' + re.escape(video_call) + r'\s*$', lambda m: m.group(0) + '\n' + m.group(1) + f'migrateLegacySamplePdfIfMatching("{pdf_sha}");', text, count=1, flags=re.M)
    if count != 1:
        raise SystemExit('ERROR: Could not insert the PDF sample migration call into MainActivity.java.')
method_marker = '    private void migrateSampleSoundFiles(){'
if 'private void migrateLegacySamplePdfIfMatching(' not in text:
    method = '''    private void migrateLegacySamplePdfIfMatching(String oldSampleSha256){
        File current = new File(vaultRoot, "About.pdf");
        if (!current.isFile() || !oldSampleSha256.equals(fileSha256(current))) return;
        File temporary = new File(vaultRoot, ".About.pdf.migration");
        File previous = new File(vaultRoot, ".About.pdf.previous-sample");
        if (previous.exists()) return; // Leave any interrupted migration untouched.
        try (InputStream in = getAssets().open("About.pdf"); OutputStream out = new FileOutputStream(temporary)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            out.flush();
            if (!temporary.isFile() || temporary.length() <= 0) { temporary.delete(); return; }
            if (!current.renameTo(previous)) { temporary.delete(); return; }
            if (temporary.renameTo(current)) {
                previous.delete();
            } else {
                previous.renameTo(current);
                temporary.delete();
            }
        } catch (Exception ignored) {
            if (temporary.exists()) temporary.delete();
            if (!current.exists() && previous.exists()) previous.renameTo(current);
        }
    }

'''
    if method_marker not in text:
        raise SystemExit('ERROR: Could not find the sample migration method insertion point in MainActivity.java.')
    text = text.replace(method_marker, method + method_marker, 1)
path.write_text(text)
PY

printf '\nBoth sample assets were imported and SHA-256 verified.\n'
ls -lh "$VIDEO_SOURCE" "$VIDEO_DEST" "$PDF_SOURCE" "$PDF_DEST"
sha256sum "$VIDEO_DEST" "$PDF_DEST"
printf '\nThe Android app replaces the bundled old video/PDF only when the stored file SHA-256 matches the exact previous sample. User-modified files with those names are preserved.\n'
