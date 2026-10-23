#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${1:-}"
if [ -z "$URL" ]; then
  echo 'Usage: bash tools/set-community-site-url.sh https://your-real-project.vercel.app/' >&2
  exit 2
fi
node - "$URL" "$ROOT" <<'NODE'
const fs = require('fs');
const path = require('path');
const raw = process.argv[2];
const root = process.argv[3];
let url;
try { url = new URL(raw); } catch { console.error('ERROR: Enter a complete URL.'); process.exit(2); }
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
  console.error('ERROR: Use an HTTPS site URL without credentials, query parameters, or a fragment.'); process.exit(2);
}
url.pathname = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
const finalUrl = url.toString();
const gameFile = path.join(root, 'app/src/main/assets/games.html');
const javaFile = path.join(root, 'app/src/main/java/com/securevault/app/MainActivity.java');
let html = fs.readFileSync(gameFile, 'utf8');
html = html.replace(/https:\/\/my-first-app-v1\.netlify\.app\//g, finalUrl);
html = html.replace(/const FOLDER_LOCKER_INSTALL_URL='[^']*';/, `const FOLDER_LOCKER_INSTALL_URL='${finalUrl}';`);
fs.writeFileSync(gameFile, html);
let java = fs.readFileSync(javaFile, 'utf8');
const host = url.hostname.toLowerCase();
if (!java.includes(JSON.stringify(host))) {
  java = java.replace('Arrays.asList("chat.whatsapp.com","wa.me","my-first-app-v1.netlify.app")',
    `Arrays.asList("chat.whatsapp.com","wa.me","my-first-app-v1.netlify.app",${JSON.stringify(host)})`);
  fs.writeFileSync(javaFile, java);
}
console.log('Updated the app link to: ' + finalUrl);
console.log('Updated the external-link host allowlist for: ' + host);
NODE
