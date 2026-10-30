const TABLE = 'folder_locker_kv';
const AVATAR_BUCKET = 'community-avatars';

function config() {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  // Prefer Supabase's newer server-side secret key. Legacy service_role JWT keys remain supported.
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !key) {
    const error = new Error('The community database is not configured yet. Add SUPABASE_URL and SUPABASE_SECRET_KEY to the hosting environment.');
    error.status = 503;
    throw error;
  }
  return { base, key };
}

function apiHeaders(key, extra = {}) {
  // Supabase's new sb_secret_* API keys are not JWTs, so use them only as apikey.
  // Legacy service_role keys are JWTs and also support the Bearer header.
  const headers = { apikey: key, ...extra };
  if (!String(key).startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
  return headers;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function checkedFetch(url, init, context) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const error = new Error(context || 'The database request failed.');
    error.status = response.status >= 400 && response.status <= 599 ? response.status : 503;
    // Avoid passing upstream bodies or secrets to the public client.
    throw error;
  }
  return response;
}

export function createKV(storeName) {
  const store = String(storeName);
  async function selectOne(key) {
    const { base, key: secret } = config();
    const q = new URLSearchParams({ select: 'value', store: `eq.${store}`, key: `eq.${String(key)}`, limit: '1' });
    const response = await checkedFetch(`${base}/rest/v1/${TABLE}?${q}`, { headers: apiHeaders(secret) }, 'The community database could not be read.');
    const rows = await readJson(response);
    return Array.isArray(rows) && rows.length ? rows[0].value : null;
  }

  return {
    async get(key) { return selectOne(key); },
    async getMany(keys) {
      const wanted = [...new Set((Array.isArray(keys) ? keys : []).map(value => String(value)))];
      if (!wanted.length) return [];
      const inValues = wanted.map(value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
      const { base, key: secret } = config();
      const q = new URLSearchParams({ select: 'key,value', store: `eq.${store}`, key: `in.(${inValues})` });
      const response = await checkedFetch(`${base}/rest/v1/${TABLE}?${q}`, { headers: apiHeaders(secret) }, 'The community database could not read download records.');
      const rows = await readJson(response);
      if (!Array.isArray(rows)) throw new Error('The community database returned an unexpected response.');
      const values = new Map(rows.map(row => [row.key, row.value]));
      return wanted.map(key => values.has(key) ? values.get(key) : null);
    },
    async set(key, value, options = {}) {
      const { base, key: secret } = config();
      const q = new URLSearchParams({ on_conflict: 'store,key', select: 'key' });
      const prefer = options.onlyIfNew
        ? 'resolution=ignore-duplicates,return=representation'
        : 'resolution=merge-duplicates,return=representation';
      const response = await checkedFetch(`${base}/rest/v1/${TABLE}?${q}`, {
        method: 'POST',
        headers: apiHeaders(secret, { 'content-type': 'application/json', Prefer: prefer }),
        body: JSON.stringify({ store, key: String(key), value })
      }, 'The community database could not save this change.');
      const rows = await readJson(response);
      return { modified: Array.isArray(rows) ? rows.length > 0 : true };
    },
    async setJSON(key, value, options = {}) {
      return this.set(key, value, options);
    },
    async delete(key) {
      const { base, key: secret } = config();
      const q = new URLSearchParams({ store: `eq.${store}`, key: `eq.${String(key)}` });
      await checkedFetch(`${base}/rest/v1/${TABLE}?${q}`, {
        method: 'DELETE', headers: apiHeaders(secret, { Prefer: 'return=minimal' })
      }, 'The community database could not delete this record.');
      return true;
    },
    async list({ prefix = '' } = {}) {
      const { base, key: secret } = config();
      const found = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const q = new URLSearchParams({
          select: 'key', store: `eq.${store}`, key: `like.${String(prefix)}%`,
          order: 'key.asc', limit: String(pageSize)
        });
        const response = await checkedFetch(`${base}/rest/v1/${TABLE}?${q}`, {
          headers: apiHeaders(secret, { Range: `${offset}-${offset + pageSize - 1}`, 'Range-Unit': 'items' })
        }, 'The community database could not list records.');
        const rows = await readJson(response);
        if (!Array.isArray(rows)) throw new Error('The community database returned an unexpected response.');
        found.push(...rows.map(row => ({ key: row.key })));
        if (rows.length < pageSize) break;
      }
      return { blobs: found };
    }
  };
}

function storageUrl(base, key) {
  const safePath = String(key).split('/').map(part => encodeURIComponent(part)).join('/');
  return `${base}/storage/v1/object/${AVATAR_BUCKET}/${safePath}`;
}

export function createAvatarStore() {
  return {
    async get(key, options = {}) {
      const { base, key: secret } = config();
      const response = await fetch(storageUrl(base, key), { headers: apiHeaders(secret) });
      if (response.status === 404) return null;
      if (!response.ok) {
        const error = new Error('The community profile picture could not be loaded.');
        error.status = response.status >= 400 && response.status <= 599 ? response.status : 503;
        throw error;
      }
      if (options.type === 'arrayBuffer') return await response.arrayBuffer();
      return await response.arrayBuffer();
    },
    async set(key, bytes, options = {}) {
      const { base, key: secret } = config();
      await checkedFetch(storageUrl(base, key), {
        method: 'POST',
        headers: apiHeaders(secret, {
          'content-type': options.metadata?.contentType || 'application/octet-stream',
          'x-upsert': 'true',
          'cache-control': '86400'
        }),
        body: bytes
      }, 'The community profile picture could not be saved.');
      return { key };
    }
  };
}
