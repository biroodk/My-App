import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createKV } from '../lib/supabase-kv.mjs';

const APK_URL = 'https://github.com/biroodk/My-App/releases/latest/download/Folder-Locker.apk';
const stats = createKV('folder-locker-public-stats');
const MIN_APK_BYTES = 100 * 1024;

async function recordCompletedDownload() {
  const key = `completed-downloads/${Date.now()}-${randomBytes(12).toString('hex')}`;
  await stats.set(key, '1', { onlyIfNew: true });
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
    await recordCompletedDownload();
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
