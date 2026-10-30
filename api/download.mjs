import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createKV } from '../lib/supabase-kv.mjs';

const APK_URL = 'https://github.com/biroodk/My-App/releases/latest/download/Folder-Locker.apk';
const stats = createKV('folder-locker-public-stats');
const MIN_APK_BYTES = 100 * 1024;

function headerValue(req, name, max = 180) {
  const value = req.headers?.[name.toLowerCase()];
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}
function decodedHeader(req, name, max = 120) {
  const raw = headerValue(req, name, max * 3);
  try { return decodeURIComponent(raw).trim().slice(0, max); } catch { return raw.slice(0, max); }
}
function validCoordinate(value, min, max) {
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function deviceDetails(req) {
  let details = {};
  try { details = JSON.parse(decodeURIComponent(headerValue(req, 'x-folder-locker-device', 1200) || '%7B%7D')); } catch {}
  const userAgent = headerValue(req, 'user-agent', 500);
  const androidModel = userAgent.match(/Android\s[^;]+;\s*([^;)]+)/i)?.[1]?.replace(/\sBuild\/.*/, '').trim();
  const model = String(details.model || headerValue(req, 'sec-ch-ua-model', 100).replace(/^"|"$/g, '') || androidModel || '').slice(0, 100);
  const platform = String(details.platform || (/Android/i.test(userAgent) ? 'Android' : /iPhone|iPad/i.test(userAgent) ? 'iOS' : /Windows/i.test(userAgent) ? 'Windows' : /Macintosh/i.test(userAgent) ? 'macOS' : /Linux/i.test(userAgent) ? 'Linux' : 'Unknown')).slice(0, 40);
  const browser = String(details.browser || (/(Edg|EdgiOS)\//i.test(userAgent) ? 'Edge' : /Firefox\//i.test(userAgent) ? 'Firefox' : /Chrome\//i.test(userAgent) ? 'Chrome' : /Safari\//i.test(userAgent) ? 'Safari' : 'Other browser')).slice(0, 40);
  return { model: model || (platform === 'Android' ? 'Android device (model unavailable)' : `${platform} device`), platform, browser };
}
async function recordCompletedDownload(req) {
  const now = Date.now();
  const consent = headerValue(req, 'x-folder-locker-location-consent', 8) === 'true';
  const latitude = consent ? validCoordinate(headerValue(req, 'x-folder-locker-latitude', 30), -90, 90) : null;
  const longitude = consent ? validCoordinate(headerValue(req, 'x-folder-locker-longitude', 30), -180, 180) : null;
  const accuracy = consent ? validCoordinate(headerValue(req, 'x-folder-locker-accuracy', 30), 0, 100000) : null;
  const city = decodedHeader(req, 'x-vercel-ip-city', 100);
  const record = {
    downloadedAt: new Date(now).toISOString(),
    countryCode: headerValue(req, 'x-vercel-ip-country', 2).toUpperCase(),
    region: decodedHeader(req, 'x-vercel-ip-country-region', 100),
    city,
    district: consent ? decodedHeader(req, 'x-folder-locker-district', 100) : '',
    locality: consent ? decodedHeader(req, 'x-folder-locker-locality', 100) : '',
    device: deviceDetails(req),
    locationConsent: consent,
    latitude,
    longitude,
    accuracyMeters: accuracy
  };
  const key = `completed-downloads/${now}-${randomBytes(12).toString('hex')}`;
  await stats.setJSON(key, record, { onlyIfNew: true });
}

export default async function downloadHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    res.setHeader('cache-control', 'no-store');
    res.end('Method not allowed.');
    return;
  }

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });

  try {
    const upstream = await fetch(APK_URL, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: abort.signal,
      headers: {
        'User-Agent': 'Folder-Locker-Install-Page',
        'Accept': 'application/octet-stream'
      }
    });
    if (!upstream.ok || !upstream.body) {
      throw Object.assign(new Error('The official APK release is temporarily unavailable.'), { status: upstream.status || 502 });
    }

    const expectedLength = Number(upstream.headers.get('content-length') || 0);
    if (expectedLength > 0 && expectedLength < MIN_APK_BYTES) {
      await upstream.body.cancel().catch(() => {});
      throw Object.assign(new Error('The official release did not return a complete APK file.'), { status: 502 });
    }

    const reader = upstream.body.getReader();
    const first = await reader.read();
    if (first.done || !first.value || first.value.byteLength < 4) {
      await reader.cancel().catch(() => {});
      throw Object.assign(new Error('The official release returned an empty file.'), { status: 502 });
    }
    const firstBytes = Buffer.from(first.value);
    if (firstBytes[0] !== 0x50 || firstBytes[1] !== 0x4b) {
      await reader.cancel().catch(() => {});
      throw Object.assign(new Error('The official release did not return an APK archive.'), { status: 502 });
    }

    let totalBytes = 0;
    async function* bodyStream() {
      totalBytes += firstBytes.length;
      yield firstBytes;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = Buffer.from(next.value);
        totalBytes += chunk.length;
        yield chunk;
      }
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/vnd.android.package-archive');
    res.setHeader('content-disposition', 'attachment; filename="Folder-Locker.apk"');
    res.setHeader('cache-control', 'no-store, no-transform');
    res.setHeader('x-content-type-options', 'nosniff');
    if (expectedLength > 0) res.setHeader('content-length', String(expectedLength));

    await pipeline(Readable.from(bodyStream()), res);

    // Do not count aborted, short, or otherwise incomplete transfers.
    if (totalBytes < MIN_APK_BYTES || (expectedLength > 0 && totalBytes !== expectedLength)) return;
    await recordCompletedDownload(req);
  } catch (error) {
    if (res.headersSent) {
      if (!res.writableFinished) res.destroy(error instanceof Error ? error : undefined);
      return;
    }
    res.statusCode = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end('Folder Locker APK download is temporarily unavailable. Please try again shortly.');
  }
}
