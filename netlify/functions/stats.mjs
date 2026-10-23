import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';

const stats = getStore({ name: 'folder-locker-public-stats', consistency: 'strong' });
const community = getStore({ name: 'folder-locker-community-v2', consistency: 'strong' });
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
async function isAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 200) return false;
  const session = await community.get(`sessions/${digest(token)}`, { type: 'json', consistency: 'strong' });
  if (!session || Number(session.expiresAt || 0) <= Date.now()) return false;
  const user = await community.get(`users/${session.userId}`, { type: 'json', consistency: 'strong' });
  return user?.role === 'admin';
}
export default async request => {
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
      return json({ visits: Number(totals.visits || 0), completedDownloads: await completedCount() });
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
