#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${1:-$HOME/storage/downloads/video1.mp4}"
DEST="$ROOT/app/src/main/assets/video1.mp4"
OLD_SAMPLE_SHA="a79d8ee8c13eda555522c5c7efa8f90dc63f8d9fd75b7fcde0fda537ade3461b"

if [ ! -f "$SOURCE" ]; then
  printf 'ERROR: Replacement video was not found: %s\n' "$SOURCE" >&2
  printf 'Put your video in Android Downloads with the exact name video1.mp4, then run this script again.\n' >&2
  exit 1
fi
if [ ! -s "$SOURCE" ]; then
  printf 'ERROR: The replacement video is empty. Nothing was changed.\n' >&2
  exit 1
fi
SOURCE_SHA="$(sha256sum "$SOURCE" | awk '{print $1}')"
if [ "$SOURCE_SHA" = "$OLD_SAMPLE_SHA" ]; then
  printf 'ERROR: This is the old bundled sample, not the replacement video. Nothing was changed.\n' >&2
  exit 1
fi
mkdir -p "$(dirname "$DEST")"
TMP="$DEST.replacement.tmp"
cp "$SOURCE" "$TMP"
if [ ! -s "$TMP" ]; then rm -f "$TMP"; printf 'ERROR: Copy verification failed.\n' >&2; exit 1; fi
mv -f "$TMP" "$DEST"
printf '\nReplacement sample video installed in the source project.\n'
ls -lh "$SOURCE" "$DEST"
sha256sum "$DEST"
printf '\nThe Android migration code will replace the old sample in the vault only when its SHA-256 matches the old bundled sample. Other user-owned video1.mp4 files are preserved.\n'
