import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';

const DB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AVATAR_BUCKET = 'community-avatars';
const AVATAR_LIMIT = 6 * 1024 * 1024;
const PAGE_SIZE = 20;
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS'
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const clean = (value, max = 1200) => String(value ?? '').trim().slice(0, max);
const randomId = () => randomBytes(18).toString('hex');
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const passwordHash = (password, salt = randomBytes(16).toString('hex')) => ({
  salt,
  hash: pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('hex')
});
function passwordMatches(password, user) {
  const actual = Buffer.from(passwordHash(password, user.password_salt).hash, 'hex');
  const expected = Buffer.from(user.password_hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function ensureConfigured() {
  if (!DB_URL || !SERVICE_KEY) {
    const error = new Error('Community database is not configured yet. The site administrator must finish the Supabase setup.');
    error.status = 503;
    throw error;
  }
}
function apiUrl(path, params = {}) {
  const url = new URL(`${DB_URL}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url;
}
async function db(path, { method = 'GET', body, prefer, count = false } = {}) {
  ensureConfigured();
  const url = path instanceof URL ? path : new URL(`${DB_URL}/rest/v1/${path}`);
  const requestHeaders = {
    apikey: SERVICE_KEY,
    accept: 'application/json'
  };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  const preferences = [prefer, count ? 'count=exact' : ''].filter(Boolean).join(',');
  if (preferences) requestHeaders.prefer = preferences;
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(response.status === 409 ? 'That username is already taken.' : 'The community database could not complete that request.');
    error.status = response.status;
    throw error;
  }
  return { data, headers: response.headers };
}
async function rows(path, params) {
  return (await db(apiUrl(path, params))).data || [];
}
async function findUserById(userId) {
  const result = await rows('community_users', { select: 'id,username,username_lower,avatar_url,password_salt,password_hash,created_at,role,display_name_color,badge', id: `eq.${userId}`, limit: 1 });
  return result[0] || null;
}
function publicUser(user) {
  return { id: user.id, username: user.username, avatar: user.avatar_url || '', role: user.role || 'user', displayNameColor: user.display_name_color || '#e9faff', badge: user.badge || '' };
}
async function authUser(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 200) return null;
  const sessions = await rows('community_sessions', {
    select: 'user_id', token_hash: `eq.${tokenHash(token)}`, expires_at: `gt.${new Date().toISOString()}`, limit: 1
  });
  if (!sessions[0]) return null;
  return findUserById(sessions[0].user_id);
}
async function createSession(user) {
  const token = randomBytes(32).toString('hex');
  await db('community_sessions', {
    method: 'POST',
    body: { token_hash: tokenHash(token), user_id: user.id, expires_at: new Date(Date.now() + 30 * 86400000).toISOString() },
    prefer: 'return=minimal'
  });
  return token;
}
async function createAvatarUpload(user, body) {
  const mime = clean(body.mimeType, 80).toLowerCase();
  const size = Number(body.size);
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  if (!extensions[mime]) throw Object.assign(new Error('Choose a JPG, PNG, WEBP, or GIF image.'), { status: 400 });
  if (!Number.isFinite(size) || size < 1 || size > AVATAR_LIMIT) {
    throw Object.assign(new Error('Profile pictures must be no larger than 6 MB.'), { status: 413 });
  }
  const path = `avatars/${user.id}/${randomId()}.${extensions[mime]}`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${DB_URL}/storage/v1/object/upload/sign/${AVATAR_BUCKET}/${encodedPath}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.url) throw Object.assign(new Error('Could not prepare the profile picture upload. Check the Supabase Storage setup.'), { status: 503 });
  const storageBase = `${DB_URL}/storage/v1`;
  const signedUrl = `${storageBase}${result.url}`;
  const avatarUrl = `${storageBase}/object/public/${AVATAR_BUCKET}/${encodedPath}`;
  return { signedUrl, avatarUrl, mimeType: mime, maxBytes: AVATAR_LIMIT };
}
function validAvatarUrl(value, user) {
  if (!value) return '';
  if (typeof value !== 'string') throw Object.assign(new Error('Invalid profile picture URL.'), { status: 400 });
  const prefix = `${DB_URL}/storage/v1/object/public/${AVATAR_BUCKET}/avatars/${user.id}/`;
  if (!value.startsWith(prefix) || value.length > 2048) {
    throw Object.assign(new Error('Choose a profile picture using the community upload form.'), { status: 400 });
  }
  return value;
}
function mapAuthor(author) {
  return { id: author?.id || '', username: author?.username || 'Community member', avatar: author?.avatar_url || '', role: author?.role || 'user', displayNameColor: author?.display_name_color || '#e9faff', badge: author?.badge || '' };
}
function isAdmin(user) { return user?.role === 'admin'; }
function secureEqual(a, b) { const aa=Buffer.from(String(a||'')); const bb=Buffer.from(String(b||'')); return aa.length===bb.length && aa.length>0 && timingSafeEqual(aa,bb); }
async function countRows(table) { const { headers: h } = await db(apiUrl(table, { select: 'id', limit: 1 }), { count: true }); const m=(h.get('content-range')||'').match(/\/(\d+|\*)$/); return m && m[1] !== '*' ? Number(m[1]) : 0; }
async function adminDashboard() {
  const [users, posts, comments, announcements, recentUsers] = await Promise.all([
    countRows('community_users'), countRows('community_posts'), countRows('community_comments'), countRows('community_announcements'),
    rows('community_users', { select: 'id,username,avatar_url,role,created_at,display_name_color,badge', order: 'created_at.desc', limit: 25 })
  ]);
  return { stats: { users, posts, comments, announcements }, recentUsers: recentUsers.map(u => ({ id:u.id, username:u.username, role:u.role||'user', createdAt:u.created_at, avatar:u.avatar_url||'', displayNameColor:u.display_name_color||'#e9faff', badge:u.badge||'' })) };
}
async function loadPage(request, page, user) {
  const offset = (page - 1) * PAGE_SIZE;
  const postUrl = apiUrl('community_posts', {
    select: 'id,author_id,text,created_at,updated_at,author:community_users!community_posts_author_id_fkey(id,username,avatar_url,role,display_name_color,badge)',
    order: 'created_at.desc,id.desc', limit: PAGE_SIZE, offset
  });
  const { data: postRows, headers: postHeaders } = await db(postUrl, { count: true });
  const posts = postRows || [];
  const range = postHeaders.get('content-range') || '';
  const totalMatch = range.match(/\/(\d+|\*)$/);
  const total = totalMatch && totalMatch[1] !== '*' ? Number(totalMatch[1]) : offset + posts.length;
  if (!posts.length) {
    const announcements = await rows('community_announcements', { select: 'id,title,body,created_at,author:community_users!community_announcements_author_id_fkey(username)', order: 'created_at.desc', limit: 10 });
    return { user: user ? publicUser(user) : null, posts: [], announcements: announcements.map(a=>({id:a.id,title:a.title,body:a.body,createdAt:a.created_at,authorName:a.author?.username||'System'})), page, pageSize: PAGE_SIZE, total, hasMore: false };
  }

  const postIds = posts.map(post => post.id);
  const idFilter = `in.(${postIds.join(',')})`;
  const [likeRows, commentRows] = await Promise.all([
    rows('community_likes', { select: 'post_id,user_id', post_id: idFilter }),
    rows('community_comments', {
      select: 'id,post_id,author_id,text,created_at,author:community_users!community_comments_author_id_fkey(id,username,avatar_url,role,display_name_color,badge)',
      post_id: idFilter, order: 'created_at.asc'
    })
  ]);
  const commentIds = commentRows.map(comment => comment.id);
  const replyRows = commentIds.length ? await rows('community_replies', {
    select: 'id,comment_id,author_id,text,created_at,author:community_users!community_replies_author_id_fkey(id,username,avatar_url,role,display_name_color,badge)',
    comment_id: `in.(${commentIds.join(',')})`, order: 'created_at.asc'
  }) : [];
  const repliesByComment = new Map();
  for (const reply of replyRows) {
    const item = { id: reply.id, authorId: reply.author_id, authorName: reply.author?.username || 'Community member', authorColor: reply.author?.display_name_color || '#e9faff', badge: reply.author?.badge || '', role: reply.author?.role || 'user', text: reply.text, createdAt: reply.created_at };
    if (!repliesByComment.has(reply.comment_id)) repliesByComment.set(reply.comment_id, []);
    repliesByComment.get(reply.comment_id).push(item);
  }
  const commentsByPost = new Map();
  for (const comment of commentRows) {
    const item = { id: comment.id, authorId: comment.author_id, authorName: comment.author?.username || 'Community member', authorColor: comment.author?.display_name_color || '#e9faff', badge: comment.author?.badge || '', role: comment.author?.role || 'user', text: comment.text, createdAt: comment.created_at, replies: repliesByComment.get(comment.id) || [] };
    if (!commentsByPost.has(comment.post_id)) commentsByPost.set(comment.post_id, []);
    commentsByPost.get(comment.post_id).push(item);
  }
  const likesByPost = new Map();
  for (const like of likeRows) {
    if (!likesByPost.has(like.post_id)) likesByPost.set(like.post_id, []);
    likesByPost.get(like.post_id).push(like.user_id);
  }
  const resultPosts = posts.map(post => ({
    id: post.id, authorId: post.author_id, authorName: post.author?.username || 'Community member', authorColor: post.author?.display_name_color || '#e9faff', badge: post.author?.badge || '', authorRole: post.author?.role || 'user',
    authorAvatar: post.author?.avatar_url || '', text: post.text, createdAt: post.created_at,
    updatedAt: post.updated_at, likes: likesByPost.get(post.id) || [], comments: commentsByPost.get(post.id) || []
  }));
  const announcements = await rows('community_announcements', { select: 'id,title,body,created_at,author:community_users!community_announcements_author_id_fkey(username)', order: 'created_at.desc', limit: 10 });
  return { user: user ? publicUser(user) : null, posts: resultPosts, announcements: announcements.map(a=>({id:a.id,title:a.title,body:a.body,createdAt:a.created_at,authorName:a.author?.username||'System'})), page, pageSize: PAGE_SIZE, total, hasMore: offset + posts.length < total };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  try {
    ensureConfigured();
    if (request.method === 'GET') {
      const user = await authUser(request);
      const requestedPage = Number(new URL(request.url).searchParams.get('page') || 1);
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
      return reply(await loadPage(request, page, user));
    }
    const body = await request.json();
    const action = clean(body.action, 40);
    const username = clean(body.username, 24);
    let user = await authUser(request);

    if (action === 'bootstrapSystem') {
      const setupSecret = process.env.SYSTEM_SETUP_SECRET || '';
      if (!setupSecret || !secureEqual(body.setupSecret, setupSecret)) return reply({ error: 'System setup authorization failed.' }, 403);
      if (typeof body.password !== 'string' || body.password.length < 16 || body.password.length > 128 || !/[A-Z]/.test(body.password) || !/[a-z]/.test(body.password) || !/[0-9]/.test(body.password) || !/[^A-Za-z0-9]/.test(body.password)) return reply({ error: 'Use at least 16 characters with uppercase, lowercase, a number, and a symbol.' }, 400);
      const pass = passwordHash(body.password);
      // The database function takes a transaction-scoped advisory lock, so simultaneous
      // first-time setup requests cannot both create/promote a System administrator.
      const setup = await db('rpc/community_bootstrap_system', {
        method: 'POST',
        body: { p_password_salt: pass.salt, p_password_hash: pass.hash }
      });
      if (setup.data?.status === 409) {
        return reply({ error: 'System administrator setup has already been completed.' }, 409);
      }
      const systemUser = setup.data?.user;
      if (!systemUser?.id) throw new Error('System account could not be created.');
      const systemToken = await createSession(systemUser);
      return reply({ user:publicUser(systemUser), token:systemToken, message:'System administrator account created.' }, 201);
    }
    if (action === 'register') {
      if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return reply({ error: 'Username must be 3–24 letters, numbers, or underscores.' }, 400);
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return reply({ error: 'Password must be 8–128 characters.' }, 400);
      const pass = passwordHash(body.password);
      let inserted;
      try {
        inserted = await db('community_users', { method: 'POST', body: { username, username_lower: username.toLowerCase(), password_salt: pass.salt, password_hash: pass.hash }, prefer: 'return=representation' });
      } catch (error) {
        if (error.status === 409) return reply({ error: 'That username is already taken.' }, 409);
        throw error;
      }
      user = inserted.data?.[0];
      if (!user) throw new Error('Could not create the community account.');
      const token = await createSession(user);
      return reply({ user: publicUser(user), token });
    }
    if (action === 'login') {
      const matches = await rows('community_users', { select: 'id,username,username_lower,avatar_url,password_salt,password_hash,created_at,role,display_name_color,badge', username_lower: `eq.${username.toLowerCase()}`, limit: 1 });
      const target = matches[0];
      if (!target || typeof body.password !== 'string' || !passwordMatches(body.password, target)) return reply({ error: 'Username or password is incorrect.' }, 401);
      const token = await createSession(target);
      return reply({ user: publicUser(target), token });
    }
    if (action === 'logout') {
      const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      if (token) await db(apiUrl('community_sessions', { token_hash: `eq.${tokenHash(token)}` }), { method: 'DELETE', prefer: 'return=minimal' });
      return reply({ ok: true });
    }
    if (!user) return reply({ error: 'Please log in to continue.' }, 401);

    if (action === 'adminDashboard') {
      if (!isAdmin(user)) return reply({ error:'Administrator permission required.' },403);
      return reply(await adminDashboard());
    }
    if (action === 'updateAppearance') {
      const update = {};
      if (body.displayNameColor !== undefined) {
        const color = clean(body.displayNameColor, 7);
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) return reply({error:'Choose a valid six-digit color.'},400);
        update.display_name_color = color;
      }
      if (body.badge !== undefined) {
        const badge = clean(body.badge, 18);
        if (badge && !isAdmin(user)) return reply({error:'Only administrators can assign profile badges.'},403);
        if (!/^[A-Za-z0-9 _-]{0,18}$/.test(badge)) return reply({error:'Badge must be 18 characters or fewer.'},400);
        update.badge = badge || null;
      }
      if (!Object.keys(update).length) return reply({user:publicUser(user)});
      const updated = await db(apiUrl('community_users',{id:`eq.${user.id}`}),{method:'PATCH',body:update,prefer:'return=representation'});
      return reply({user:publicUser(updated.data?.[0] || {...user,...update})});
    }
    if (action === 'createAnnouncement') {
      if (!isAdmin(user)) return reply({error:'Administrator permission required.'},403);
      const title = clean(body.title,100), text = clean(body.text,2000);
      if (!title || !text) return reply({error:'Announcement title and body are required.'},400);
      const created = await db('community_announcements',{method:'POST',body:{author_id:user.id,title,body:text},prefer:'return=representation'});
      return reply({ok:true,announcement:created.data?.[0]||null},201);
    }
    if (action === 'deleteAnnouncement') {
      if (!isAdmin(user)) return reply({error:'Administrator permission required.'},403);
      const id=clean(body.announcementId,80);
      await db(apiUrl('community_announcements',{id:`eq.${id}`}),{method:'DELETE',prefer:'return=minimal'});
      return reply({ok:true});
    }
    if (action === 'adminDeletePost') {
      if (!isAdmin(user)) return reply({error:'Administrator permission required.'},403);
      const postId=clean(body.postId,80);
      await db(apiUrl('community_posts',{id:`eq.${postId}`}),{method:'DELETE',prefer:'return=minimal'});
      return reply({ok:true});
    }
    if (action === 'createAvatarUpload') return reply(await createAvatarUpload(user, body));
    if (action === 'profile') {
      const update = {};
      const nextName = clean(body.username, 24);
      if (nextName && nextName !== user.username) {
        if (!/^[A-Za-z0-9_]{3,24}$/.test(nextName)) return reply({ error: 'Username must be 3–24 letters, numbers, or underscores.' }, 400);
        update.username = nextName;
        update.username_lower = nextName.toLowerCase();
      }
      if (Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) update.avatar_url = validAvatarUrl(body.avatarUrl, user) || null;
      if (body.password) {
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return reply({ error: 'New password must be 8–128 characters.' }, 400);
        const pass = passwordHash(body.password); update.password_salt = pass.salt; update.password_hash = pass.hash;
      }
      if (!Object.keys(update).length) return reply({ user: publicUser(user) });
      let updated;
      try {
        updated = await db(apiUrl('community_users', { id: `eq.${user.id}` }), { method: 'PATCH', body: update, prefer: 'return=representation' });
      } catch (error) {
        if (error.status === 409) return reply({ error: 'That username is already taken.' }, 409);
        throw error;
      }
      return reply({ user: publicUser(updated.data?.[0] || { ...user, ...update, avatar_url: update.avatar_url ?? user.avatar_url }) });
    }
    if (action === 'createPost') {
      const text = clean(body.text);
      if (!text) return reply({ error: 'Write something before publishing.' }, 400);
      await db('community_posts', { method: 'POST', body: { author_id: user.id, text }, prefer: 'return=minimal' });
    } else if (action === 'editPost') {
      const postId = clean(body.postId, 80), text = clean(body.text);
      if (!text) return reply({ error: 'Post cannot be empty.' }, 400);
      const found = await rows('community_posts', { select: 'id,author_id', id: `eq.${postId}`, limit: 1 });
      if (!found[0]) return reply({ error: 'Post not found.' }, 404);
      if (found[0].author_id !== user.id) return reply({ error: 'Only the post owner can edit it.' }, 403);
      await db(apiUrl('community_posts', { id: `eq.${postId}`, author_id: `eq.${user.id}` }), { method: 'PATCH', body: { text, updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
    } else if (action === 'deletePost') {
      const postId = clean(body.postId, 80);
      const found = await rows('community_posts', { select: 'id,author_id', id: `eq.${postId}`, limit: 1 });
      if (!found[0]) return reply({ error: 'Post not found.' }, 404);
      if (found[0].author_id !== user.id) return reply({ error: 'Only the post owner can delete it.' }, 403);
      await db(apiUrl('community_posts', { id: `eq.${postId}`, author_id: `eq.${user.id}` }), { method: 'DELETE', prefer: 'return=minimal' });
    } else if (action === 'likePost') {
      const postId = clean(body.postId, 80);
      await db('rpc/community_toggle_like', { method: 'POST', body: { p_post_id: postId, p_user_id: user.id } });
    } else if (action === 'comment') {
      const postId = clean(body.postId, 80), text = clean(body.text, 700);
      if (!text) return reply({ error: 'Write a text comment first.' }, 400);
      await db('community_comments', { method: 'POST', body: { post_id: postId, author_id: user.id, text }, prefer: 'return=minimal' });
    } else if (action === 'reply') {
      const commentId = clean(body.commentId, 80), text = clean(body.text, 500);
      if (!text) return reply({ error: 'Write a text reply first.' }, 400);
      await db('community_replies', { method: 'POST', body: { comment_id: commentId, author_id: user.id, text }, prefer: 'return=minimal' });
    } else {
      return reply({ error: 'Unknown action.' }, 400);
    }
    return reply({ ok: true });
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
    return reply({ error: error?.message || 'Community service is temporarily unavailable.' }, status);
  }
}
