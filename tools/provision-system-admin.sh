#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SITE_URL="${1:-}"
if [ -z "$SITE_URL" ]; then
  read -r -p "Enter your Vercel site URL (for example https://folder-locker-my-first-app.vercel.app): " SITE_URL
fi
SITE_URL="${SITE_URL%/}"
case "$SITE_URL" in
  https://*) ;;
  *) echo "ERROR: Use the full HTTPS Vercel URL." >&2; exit 2 ;;
esac
case "$SITE_URL" in
  *\?*|*\#*|*\@*) echo "ERROR: URL must not include query parameters, fragments, or credentials." >&2; exit 2 ;;
esac
command -v curl >/dev/null 2>&1 || { echo "ERROR: Install curl with: pkg install curl" >&2; exit 2; }
echo "Requesting one-time system-account setup. No password is sent from Termux."
curl --fail-with-body --silent --show-error \
  -X POST "$SITE_URL/api/community" \
  -H 'Content-Type: application/json' \
  --data '{"action":"provisionSystemAdmin"}'
printf '\n'
