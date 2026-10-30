import { createKV } from '../lib/supabase-kv.mjs';
import { createHash, randomBytes } from 'node:crypto';

const stats = createKV('folder-locker-public-stats');
const community = createKV('folder-locker-community-v2');
const DAY_MS = 24 * 60 * 60 * 1000;
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS'
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const digest = value => createHash('sha256').update(value).digest('hex');
async function completedCount() {
  const results = await stats.list({ prefix: 'completed-downloads/' });
  return results.blobs?.length || 0;
}
async function completedDownloadRecords(limit = 300) {
  const results = await stats.list({ prefix: 'completed-downloads/' });
  const keys = (results.blobs || []).map(item => item.key).sort().reverse().slice(0, limit);
  const values = typeof stats.getMany === 'function'
    ? await stats.getMany(keys)
    : await Promise.all(keys.map(key => stats.get(key)));
  return keys.map((key, index) => {
    const value = values[index];
    if (value && typeof value === 'object' && !Array.isArray(value)) return { id: key, ...value };
    const suffix = key.slice('completed-downloads/'.length);
    const timestamp = Number(suffix.split('-')[0]);
    return {
      id: key,
      downloadedAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : '',
      countryCode: '', region: '', city: '', district: '', locality: '',
      device: { model: 'Not recorded (older download)', platform: 'Unknown', browser: 'Unknown' },
      locationConsent: false, latitude: null, longitude: null, accuracyMeters: null,
      legacyRecord: true
    };
  });
}
async function isAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 200) return false;
  const session = await community.get(`sessions/${digest(token)}`, { type: 'json', consistency: 'strong' });
  if (!session || Number(session.expiresAt || 0) <= Date.now()) return false;
  const user = await community.get(`users/${session.userId}`, { type: 'json', consistency: 'strong' });
  return user?.role === 'admin';
}
async function statsHandler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.searchParams.get('action') === 'download-complete') {
      // Each completed body transfer gets a unique event key instead of a racy shared counter.
      await stats.set(`completed-downloads/${Date.now()}-${randomBytes(12).toString('hex')}`, '1', { onlyIfNew: true });
      return json({ completedDownloads: await completedCount() }, 201);
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    if (url.searchParams.get('admin') === '1') {
      if (!(await isAdmin(request))) return json({ error: 'Administrator permission required.' }, 403);
      const totals = await stats.get('totals', { type: 'json', consistency: 'strong' }) || { visits: 0 };
      const [completedDownloads, downloadRecords] = await Promise.all([completedCount(), completedDownloadRecords(300)]);
      return json({ visits: Number(totals.visits || 0), completedDownloads, downloadRecords, downloadRecordsLimit: 300 });
    }
    const visitorId = (url.searchParams.get('visitorId') || '').slice(0, 120);
    let counted = false;
    if (visitorId) {
      const visitorKey = `visitor:${digest(visitorId)}`;
      const now = Date.now();
      const prior = await stats.get(visitorKey, { type: 'json', consistency: 'strong' });
      const priorAt = Number(prior?.lastCountedAt || 0);
      if (!priorAt || now - priorAt >= DAY_MS) {
        const totals = await stats.get('totals', { type: 'json', consistency: 'strong' }) || { visits: 0 };
        totals.visits = Number(totals.visits || 0) + 1;
        await stats.setJSON('totals', totals);
        await stats.setJSON(visitorKey, { lastCountedAt: now });
        counted = true;
      }
    }
    const totals = await stats.get('totals', { type: 'json', consistency: 'strong' }) || { visits: 0 };
    return json({ visits: Number(totals.visits || 0), completedDownloads: await completedCount(), counted });
  } catch (error) {
    return json({ error: 'Website statistics are temporarily unavailable.' }, 503);
  }
};


export const config = { api: { bodyParser: false } };

export default async function vercelHandler(req, res) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers || {})) {
      if (Array.isArray(value)) headers.set(name, value.join(', '));
      else if (value !== undefined) headers.set(name, String(value));
    }
    const url = new URL(req.url || '/api/stats', `https://${req.headers?.host || 'localhost'}`);
    let body;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      body = Buffer.concat(chunks);
      if (body.length === 0) body = undefined;
    }
    const request = new Request(url, { method, headers, ...(body === undefined ? {} : { body }) });
    const response = await statsHandler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = Number.isInteger(error?.status) ? error.status : 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ error: 'Website statistics are temporarily unavailable.' }));
  }
}
