import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { createKV, createAvatarStore } from '../lib/supabase-kv.mjs';

// Simple persistent key-value storage hosted with this Netlify site.
const DB = createKV('folder-locker-community-v2');
const AVATARS = createAvatarStore();
const PAGE_SIZE = 20;
const AVATAR_LIMIT = 3 * 1024 * 1024;
const SESSION_MS = 2 * 60 * 60 * 1000; // Require login again after two hours.
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS'
};
const reply = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extraHeaders } });
const clean = (value, max = 1200) => String(value ?? '').trim().slice(0, max);
const randomId = () => randomBytes(18).toString('hex');
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const keyPart = value => encodeURIComponent(String(value));
const avatarUrl = user => user?.avatarKey ? `/api/community?avatar=${encodeURIComponent(user.id)}&v=${Number(user.avatarUpdatedAt || 0)}` : '';
const passwordHash = (password, salt = randomBytes(16).toString('hex')) => ({ salt, hash: pbkdf2Sync(password, salt, 150000, 32, 'sha256').toString('hex') });
function passwordMatches(password, user) {
  const actual = Buffer.from(passwordHash(password, user.passwordSalt).hash, 'hex');
  const expected = Buffer.from(user.passwordHash || '', 'hex');
  return actual.length === expected.length && actual.length > 0 && timingSafeEqual(actual, expected);
}
function publicUser(user) {
  return { id: user.id, username: user.username, avatar: avatarUrl(user), role: user.role || 'user', displayNameColor: user.displayNameColor || '#e9faff', badge: user.badge || '' };
}
function userRecord(username, pass, role = 'user') {
  const now = new Date().toISOString();
  return { id: randomId(), username, usernameLower: username.toLowerCase(), passwordSalt: pass.salt, passwordHash: pass.hash, createdAt: now, role, displayNameColor: '#e9faff', badge: '', avatarKey: '', avatarMime: '', avatarUpdatedAt: 0 };
}
async function getJSON(key) { return await DB.get(key, { type: 'json', consistency: 'strong' }); }
async function putJSON(key, value, options = {}) { return DB.setJSON(key, value, options); }
async function listJSON(prefix) {
  const found = await DB.list({ prefix });
  if (!found.blobs?.length) return [];
  return (await Promise.all(found.blobs.map(item => getJSON(item.key)))).filter(Boolean);
}
async function getUser(id) { return id ? getJSON(`users/${id}`) : null; }
async function findUserByName(username) {
  const id = await DB.get(`usernames/${clean(username, 24).toLowerCase()}`, { consistency: 'strong' });
  return id ? getUser(id) : null;
}
async function createSession(user) {
  const token = randomBytes(32).toString('hex');
  await putJSON(`sessions/${tokenHash(token)}`, { userId: user.id, expiresAt: Date.now() + SESSION_MS });
  return token;
}
async function authUser(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 200) return null;
  const session = await getJSON(`sessions/${tokenHash(token)}`);
  if (!session || Number(session.expiresAt || 0) <= Date.now()) return null;
  return getUser(session.userId);
}
function isAdmin(user) { return user?.role === 'admin'; }
function secureEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length > 0 && aa.length === bb.length && timingSafeEqual(aa, bb);
}
function validateUsername(username) {
  return /^[A-Za-z0-9_]{3,24}$/.test(username);
}
function validPassword(password, min = 4) {
  return typeof password === 'string' && password.length >= min && password.length <= 128;
}
async function reserveUsername(username, id) {
  const result = await DB.set(`usernames/${username.toLowerCase()}`, id, { onlyIfNew: true });
  return result.modified;
}
async function loadPage(page, user) {
  const [allPosts, allUsers, allComments, allReplies, allAnnouncements] = await Promise.all([
    listJSON('posts/'), listJSON('users/'), listJSON('comments/'), listJSON('replies/'), listJSON('announcements/')
  ]);
  const userMap = new Map(allUsers.map(item => [item.id, item]));
  const sortedPosts = allPosts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));
  const total = sortedPosts.length;
  const offset = (page - 1) * PAGE_SIZE;
  const pagePosts = sortedPosts.slice(offset, offset + PAGE_SIZE);
  const pageIds = new Set(pagePosts.map(item => item.id));
  const relevantComments = allComments.filter(item => pageIds.has(item.postId)).sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const relevantCommentIds = new Set(relevantComments.map(item => item.id));
  // Newest replies are presented first within each comment.
  const relevantReplies = allReplies.filter(item => relevantCommentIds.has(item.commentId)).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const commentResults = relevantComments.map(comment => {
    const author = userMap.get(comment.authorId);
    return { id: comment.id, postId: comment.postId, authorId: comment.authorId, authorName: author?.username || 'Community member', authorColor: author?.displayNameColor || '#e9faff', authorAvatar: avatarUrl(author), badge: author?.badge || '', role: author?.role || 'user', text: comment.text, createdAt: comment.createdAt,
      replies: relevantReplies.filter(item => item.commentId === comment.id).map(item => { const replyAuthor = userMap.get(item.authorId); return { id: item.id, authorId: item.authorId, authorName: replyAuthor?.username || 'Community member', authorColor: replyAuthor?.displayNameColor || '#e9faff', authorAvatar: avatarUrl(replyAuthor), badge: replyAuthor?.badge || '', role: replyAuthor?.role || 'user', text: item.text, createdAt: item.createdAt }; }) };
  });
  const posts = await Promise.all(pagePosts.map(async post => {
    const author = userMap.get(post.authorId);
    const likes = (await listJSON(`likes/${post.id}/`)).map(item => item.userId);
    return { id: post.id, authorId: post.authorId, authorName: author?.username || 'Community member', authorColor: author?.displayNameColor || '#e9faff', badge: author?.badge || '', authorRole: author?.role || 'user', authorAvatar: avatarUrl(author), text: post.text, createdAt: post.createdAt, updatedAt: post.updatedAt || '', likes, comments: commentResults.filter(item => item.postId === post.id) };
  }));
  const announcements = allAnnouncements.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,10).map(item => ({ id:item.id, title:item.title, body:item.body, createdAt:item.createdAt, authorName:userMap.get(item.authorId)?.username || 'System' }));
  const chatMode = await getJSON('meta/chat-paused');
  return { user: user ? publicUser(user) : null, posts, announcements, chatPaused: !!chatMode?.paused, page, pageSize: PAGE_SIZE, total, hasMore: offset + posts.length < total };
}
async function adminDashboard() {
  const [users, posts, comments, replies, announcements, notes, likes, chatMode] = await Promise.all([
    listJSON('users/'), listJSON('posts/'), listJSON('comments/'), listJSON('replies/'),
    listJSON('announcements/'), listJSON('admin-notes/'), listJSON('likes/'), getJSON('meta/chat-paused')
  ]);
  const userMap = new Map(users.map(user => [user.id, user]));
  const postMap = new Map(posts.map(post => [post.id, post]));
  const commentMap = new Map(comments.map(comment => [comment.id, comment]));
  const postCounts = new Map(), commentCounts = new Map(), replyCounts = new Map(), likeCounts = new Map(), likesPerPost = new Map();
  for (const item of posts) postCounts.set(item.authorId, (postCounts.get(item.authorId) || 0) + 1);
  for (const item of comments) commentCounts.set(item.authorId, (commentCounts.get(item.authorId) || 0) + 1);
  for (const item of replies) replyCounts.set(item.authorId, (replyCounts.get(item.authorId) || 0) + 1);
  for (const item of likes) { likeCounts.set(item.userId, (likeCounts.get(item.userId) || 0) + 1); likesPerPost.set(item.postId, (likesPerPost.get(item.postId) || 0) + 1); }
  const publicAdminUser = user => ({
    id: user.id, username: user.username, role: user.role || 'user', createdAt: user.createdAt,
    avatar: avatarUrl(user), displayNameColor: user.displayNameColor || '#e9faff', badge: user.badge || '',
    postCount: postCounts.get(user.id) || 0, commentCount: commentCounts.get(user.id) || 0,
    replyCount: replyCounts.get(user.id) || 0, likeCount: likeCounts.get(user.id) || 0
  });
  const details = {
    users: users.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicAdminUser),
    posts: posts.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(post => ({
      id: post.id, authorId: post.authorId, authorName: userMap.get(post.authorId)?.username || 'Community member',
      authorRole: userMap.get(post.authorId)?.role || 'user', text: post.text, createdAt: post.createdAt,
      updatedAt: post.updatedAt || '', likeCount: likesPerPost.get(post.id) || 0,
      commentCount: comments.filter(comment => comment.postId === post.id).length
    })),
    comments: comments.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(comment => ({
      id: comment.id, postId: comment.postId, postText: (postMap.get(comment.postId)?.text || '').slice(0,160),
      authorName: userMap.get(comment.authorId)?.username || 'Community member', text: comment.text, createdAt: comment.createdAt,
      replyCount: replies.filter(reply => reply.commentId === comment.id).length
    })),
    replies: replies.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(item => {
      const comment = commentMap.get(item.commentId);
      return { id: item.id, commentId: item.commentId, postId: comment?.postId || '',
        authorName: userMap.get(item.authorId)?.username || 'Community member',
        commentText: (comment?.text || '').slice(0,160), text: item.text, createdAt: item.createdAt };
    }),
    likes: likes.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(item => ({
      userName:userMap.get(item.userId)?.username || 'Community member', postText:(postMap.get(item.postId)?.text || '').slice(0,160), createdAt:item.createdAt
    })),
    announcements: announcements.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(item => ({
      id:item.id, title:item.title, body:item.body, createdAt:item.createdAt,
      authorName:userMap.get(item.authorId)?.username || 'System'
    })),
    notes: notes.sort((a,b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))).map(item => ({
      id:item.id, title:item.title, text:item.text, createdAt:item.createdAt, updatedAt:item.updatedAt || '',
      authorName:userMap.get(item.authorId)?.username || 'Admin'
    }))
  };
  return { stats: { users:users.length, posts:posts.length, comments:comments.length, replies:replies.length, likes:likes.length, announcements:announcements.length, adminNotes:notes.length }, recentUsers: details.users.slice(0,25), details, chatPaused: !!chatMode?.paused };
}
async function removePostData(postId) {
  const [comments, replies, likes] = await Promise.all([listJSON('comments/'), listJSON('replies/'), listJSON(`likes/${postId}/`)]);
  const commentIds = new Set(comments.filter(item => item.postId === postId).map(item => item.id));
  await Promise.all([
    ...comments.filter(item => item.postId === postId).map(item => DB.delete(`comments/${item.id}`)),
    ...replies.filter(item => commentIds.has(item.commentId)).map(item => DB.delete(`replies/${item.id}`)),
    ...likes.map(item => DB.delete(`likes/${postId}/${item.userId}`)),
    DB.delete(`posts/${postId}`)
  ]);
}

async function communityHandler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  try {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const avatarId = clean(url.searchParams.get('avatar'), 80);
      if (avatarId) {
        const user = await getUser(avatarId);
        if (!user?.avatarKey) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
        const image = await AVATARS.get(user.avatarKey, { type: 'arrayBuffer', consistency: 'strong' });
        if (!image) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
        return new Response(image, { status: 200, headers: { 'content-type': user.avatarMime || 'image/jpeg', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
      }
      const user = await authUser(request);
      const requestedPage = Number(url.searchParams.get('page') || 1);
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
      return reply(await loadPage(page, user));
    }

    let body;
    try { body = await request.json(); } catch { return reply({ error: 'The request body must be valid JSON.' }, 400); }
    const action = clean(body.action, 40);
    const username = clean(body.username, 24);
    let user = await authUser(request);

    if (action === 'provisionSystemAdmin') {
      // Preferred setup path: the strong password stays in Vercel environment settings.
      // This public one-time action never accepts or returns the administrator password.
      const configuredPassword = process.env.SYSTEM_ADMIN_PASSWORD || '';
      const strongPassword = typeof configuredPassword === 'string'
        && configuredPassword.length >= 20 && configuredPassword.length <= 128
        && /[A-Z]/.test(configuredPassword) && /[a-z]/.test(configuredPassword)
        && /[0-9]/.test(configuredPassword) && /[^A-Za-z0-9]/.test(configuredPassword);
      if (!strongPassword) return reply({ error: 'System account is not configured. Set SYSTEM_ADMIN_PASSWORD in Vercel to a strong password of at least 20 characters, then redeploy.' }, 503);
      const adminName = 'FolderLockerAdmin';
      const reservedId = await DB.get(`usernames/${adminName.toLowerCase()}`, { consistency: 'strong' });
      if (reservedId) {
        const existing = await getUser(reservedId);
        if (existing) return reply({ error: 'The system account already exists. Sign in through the normal Log in form as FolderLockerAdmin.' }, 409);
        // Recover a stale username reservation left by an interrupted first-time setup.
        await DB.delete(`usernames/${adminName.toLowerCase()}`);
      }
      let setup = await DB.set('meta/system-admin-created', new Date().toISOString(), { onlyIfNew: true });
      if (!setup.modified) {
        // If a prior failed attempt left only the marker, clear that orphan and retry once.
        if (await findUserByName(adminName)) return reply({ error: 'System administrator setup has already been completed. Use the normal Log in form.' }, 409);
        await DB.delete('meta/system-admin-created');
        setup = await DB.set('meta/system-admin-created', new Date().toISOString(), { onlyIfNew: true });
        if (!setup.modified) return reply({ error: 'System administrator setup is busy. Wait briefly and retry.' }, 409);
      }
      const admin = userRecord(adminName, passwordHash(configuredPassword), 'admin');
      if (!(await reserveUsername(adminName, admin.id))) {
        await DB.delete('meta/system-admin-created');
        return reply({ error: 'FolderLockerAdmin is already reserved. Check the existing account before retrying.' }, 409);
      }
      try {
        await putJSON(`users/${admin.id}`, admin, { onlyIfNew: true });
      } catch (error) {
        await DB.delete(`usernames/${adminName.toLowerCase()}`);
        await DB.delete('meta/system-admin-created');
        throw error;
      }
      return reply({ ok: true, username: adminName, message: 'System account created. Sign in through the normal Log in form.' }, 201);
    }

    if (action === 'bootstrapSystem') {
      const setupSecret = process.env.SYSTEM_SETUP_SECRET || '';
      if (!setupSecret || !secureEqual(body.setupSecret, setupSecret)) return reply({ error: 'System setup authorization failed. Set SYSTEM_SETUP_SECRET in Vercel to enable this optional setup.' }, 403);
      if (typeof body.password !== 'string' || body.password.length < 16 || body.password.length > 128 || !/[A-Z]/.test(body.password) || !/[a-z]/.test(body.password) || !/[0-9]/.test(body.password) || !/[^A-Za-z0-9]/.test(body.password)) return reply({ error: 'Use at least 16 characters with uppercase, lowercase, a number, and a symbol.' }, 400);
      const setup = await DB.set('meta/system-admin-created', new Date().toISOString(), { onlyIfNew: true });
      if (!setup.modified) return reply({ error: 'System administrator setup has already been completed.' }, 409);
      const adminName = 'FolderLockerAdmin';
      const pass = passwordHash(body.password);
      const admin = userRecord(adminName, pass, 'admin');
      if (!(await reserveUsername(adminName, admin.id))) { await DB.delete('meta/system-admin-created'); return reply({ error: 'System administrator username is already taken.' }, 409); }
      await putJSON(`users/${admin.id}`, admin);
      const token = await createSession(admin);
      return reply({ user: publicUser(admin), token, message: 'System administrator account created.' }, 201);
    }

    if (action === 'register') {
      if (!validateUsername(username)) return reply({ error: 'Username must be 3–24 letters, numbers, or underscores.' }, 400);
      if (!validPassword(body.password)) return reply({ error: 'Password must be 4–128 characters.' }, 400);
      if (body.password !== body.confirmPassword) return reply({ error: 'Passwords do not match.' }, 400);
      const newUser = userRecord(username, passwordHash(body.password));
      if (!(await reserveUsername(username, newUser.id))) return reply({ error: 'That username is already taken.' }, 409);
      try { await putJSON(`users/${newUser.id}`, newUser, { onlyIfNew: true }); }
      catch (error) { await DB.delete(`usernames/${username.toLowerCase()}`); throw error; }
      const token = await createSession(newUser);
      return reply({ user: publicUser(newUser), token }, 201);
    }
    if (action === 'login') {
      const target = await findUserByName(username);
      if (!target || !validPassword(body.password) || !passwordMatches(body.password, target)) return reply({ error: 'Username or password is incorrect.' }, 401);
      const token = await createSession(target);
      return reply({ user: publicUser(target), token });
    }
    if (action === 'logout') {
      const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      if (token) await DB.delete(`sessions/${tokenHash(token)}`);
      return reply({ ok: true });
    }
    if (!user) return reply({ error: 'Please log in to continue.' }, 401);

    if (action === 'adminDashboard') {
      if (!isAdmin(user)) return reply({ error: 'Administrator permission required.' }, 403);
      return reply(await adminDashboard());
    }
    if (action === 'createAdminAccount') {
      if (!isAdmin(user)) return reply({ error: 'Administrator permission required.' }, 403);
      const adminName = clean(body.username || 'SanShania', 24);
      const pass = body.password;
      if (!validateUsername(adminName)) return reply({ error: 'Username must be 3–24 letters, numbers, or underscores.' }, 400);
      if (typeof pass !== 'string' || pass.length < 20 || pass.length > 128 || !/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/[0-9]/.test(pass) || !/[^A-Za-z0-9]/.test(pass)) return reply({ error: 'Admin passwords must be 20–128 characters and include uppercase, lowercase, a number, and a symbol.' }, 400);
      if (pass !== body.confirmPassword) return reply({ error: 'Admin passwords do not match.' }, 400);
      const created = userRecord(adminName, passwordHash(pass), 'admin');
      created.badge = 'Admin';
      if (!(await reserveUsername(adminName, created.id))) return reply({ error: 'That username already exists.' }, 409);
      try { await putJSON(`users/${created.id}`, created, { onlyIfNew: true }); }
      catch (error) { await DB.delete(`usernames/${adminName.toLowerCase()}`); throw error; }
      return reply({ ok: true, username: adminName, message: 'Administrator account created. The new admin can log in normally.' }, 201);
    }
    if (action === 'setChatMode') {
      if (!isAdmin(user)) return reply({ error: 'Administrator permission required.' }, 403);
      if (typeof body.paused !== 'boolean') return reply({ error: 'Choose whether to pause or resume community chat.' }, 400);
      await putJSON('meta/chat-paused', { paused: body.paused, changedAt: new Date().toISOString(), changedBy: user.id });
      return reply({ ok: true, paused: body.paused });
    }
    if (action === 'createAdminNote') {
      if (!isAdmin(user)) return reply({ error: 'Administrator permission required.' }, 403);
      const title = clean(body.title, 100), text = clean(body.text, 4000);
      if (!title || !text) return reply({ error: 'A note title and note text are required.' }, 400);
      const note = { id: randomId(), authorId: user.id, title, text, createdAt: new Date().toISOString(), updatedAt: '' };
      await putJSON(`admin-notes/${note.id}`, note, { onlyIfNew: true });
      return reply({ ok: true, note }, 201);
    }
    if (action === 'editAdminNote') {
      if (!isAdmin(user)) return reply({ error: 'Administrator permission required.' }, 403);
      const id = clean(body.noteId, 80), title = clean(body.title, 100), text = clean(body.text, 4000);
      if (!title || !text) return reply({ error: 'A note title and note text are required.' }, 400);
      const note = await getJSON(`admin-notes/${id}`);
      if (!note) return reply({ error: 'Admin note not found.' }, 404);
      note.title = title; note.text = text; note.updatedAt = new Date().toISOString(); note.updatedBy = user.id;
      await putJSON(`admin-notes/${id}`, note);
      return reply({ ok: true });
    }
    if (action === 'deleteAdminNote') {
      if (!isAdmin(user)) return reply({ error: 'Administrator permission required.' }, 403);
      const id = clean(body.noteId, 80);
      if (!(await getJSON(`admin-notes/${id}`))) return reply({ error: 'Admin note not found.' }, 404);
      await DB.delete(`admin-notes/${id}`);
      return reply({ ok: true });
    }
    if (action === 'uploadAvatar') {
      const mime = clean(body.mimeType, 80).toLowerCase();
      const allowed = new Set(['image/jpeg','image/png','image/webp','image/gif']);
      if (!allowed.has(mime)) return reply({ error: 'Choose a JPG, PNG, WEBP, or GIF image.' }, 400);
      const dataUrl = String(body.dataUrl || '');
      const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match || match[1] !== mime) return reply({ error: 'The profile picture data is invalid.' }, 400);
      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length || bytes.length > AVATAR_LIMIT) return reply({ error: 'Profile pictures must be no larger than 3 MB.' }, 413);
      const key = `avatars/${user.id}`;
      await AVATARS.set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { metadata: { contentType: mime } });
      user.avatarKey = key; user.avatarMime = mime; user.avatarUpdatedAt = Date.now();
      await putJSON(`users/${user.id}`, user);
      return reply({ user: publicUser(user) });
    }
    if (action === 'profile') {
      const nextName = clean(body.username, 24);
      let changedName = false;
      const oldUsernameLower = user.usernameLower;
      if (nextName && nextName !== user.username) {
        if (!validateUsername(nextName)) return reply({ error: 'Username must be 3–24 letters, numbers, or underscores.' }, 400);
        if (!(await reserveUsername(nextName, user.id))) return reply({ error: 'That username is already taken.' }, 409);
        user.username = nextName; user.usernameLower = nextName.toLowerCase(); changedName = true;
      }
      if (body.password) {
        if (!validPassword(body.currentPassword, 4) || !passwordMatches(body.currentPassword, user)) return reply({ error: 'Your current password is incorrect.' }, 401);
        if (!validPassword(body.password, 4)) return reply({ error: 'New password must be 4–128 characters.' }, 400);
        if (body.password !== body.confirmPassword) return reply({ error: 'The new passwords do not match.' }, 400);
        const pass = passwordHash(body.password); user.passwordSalt = pass.salt; user.passwordHash = pass.hash;
      }
      try { await putJSON(`users/${user.id}`, user); }
      catch (error) { if (changedName) await DB.delete(`usernames/${user.usernameLower}`); throw error; }
      if (changedName) await DB.delete(`usernames/${oldUsernameLower}`);
      return reply({ user: publicUser(user), changedName });
    }
    if (action === 'updateAppearance') {
      if (body.displayNameColor !== undefined) {
        const color = clean(body.displayNameColor, 7);
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) return reply({ error: 'Choose a valid six-digit color.' }, 400);
        user.displayNameColor = color;
      }
      if (body.badge !== undefined) {
        const badge = clean(body.badge, 18);
        if (badge && !isAdmin(user)) return reply({ error: 'Only administrators can assign profile badges.' }, 403);
        if (!/^[A-Za-z0-9 _-]{0,18}$/.test(badge)) return reply({ error: 'Badge must be 18 characters or fewer.' }, 400);
        user.badge = badge;
      }
      await putJSON(`users/${user.id}`, user);
      return reply({ user: publicUser(user) });
    }
    if (action === 'createAnnouncement') {
      if (!isAdmin(user)) return reply({ error: 'Administrator permission required.' }, 403);
      const title = clean(body.title, 100), text = clean(body.text, 2000);
      if (!title || !text) return reply({ error: 'Announcement title and body are required.' }, 400);
      const announcement = { id: randomId(), authorId: user.id, title, body: text, createdAt: new Date().toISOString() };
      await putJSON(`announcements/${announcement.id}`, announcement, { onlyIfNew: true });
      return reply({ ok: true, announcement }, 201);
    }
    if (action === 'deleteAnnouncement') {
      if (!isAdmin(user)) return reply({ error: 'Administrator permission required.' }, 403);
      await DB.delete(`announcements/${clean(body.announcementId, 80)}`);
      return reply({ ok: true });
    }
    if (action === 'createPost') {
      const chatMode = await getJSON('meta/chat-paused');
      if (chatMode?.paused && !isAdmin(user)) return reply({ error: 'Community chat is paused. Only administrators can publish posts until chat is resumed.' }, 403);
      const text = clean(body.text, 1200);
      if (!text) return reply({ error: 'Write something before publishing.' }, 400);
      const post = { id: randomId(), authorId: user.id, text, createdAt: new Date().toISOString(), updatedAt: '' };
      await putJSON(`posts/${post.id}`, post, { onlyIfNew: true });
      return reply({ ok: true, id: post.id }, 201);
    }
    if (action === 'editPost') {
      const postId = clean(body.postId, 80), text = clean(body.text, 1200);
      if (!text) return reply({ error: 'Post cannot be empty.' }, 400);
      const chatMode = await getJSON('meta/chat-paused');
      if (chatMode?.paused && !isAdmin(user)) return reply({ error: 'Members cannot publish or edit posts while community chat is paused.' }, 403);
      const post = await getJSON(`posts/${postId}`);
      if (!post) return reply({ error: 'Post not found.' }, 404);
      if (post.authorId !== user.id) return reply({ error: 'Only the post owner can edit it.' }, 403);
      post.text = text; post.updatedAt = new Date().toISOString(); await putJSON(`posts/${postId}`, post);
      return reply({ ok: true });
    }
    if (action === 'deletePost' || action === 'adminDeletePost') {
      const postId = clean(body.postId, 80), post = await getJSON(`posts/${postId}`);
      if (!post) return reply({ error: 'Post not found.' }, 404);
      if (action === 'adminDeletePost' && !isAdmin(user)) return reply({ error: 'Administrator permission required.' }, 403);
      if (action === 'deletePost' && post.authorId !== user.id) return reply({ error: 'Only the post owner can delete it.' }, 403);
      await removePostData(postId);
      return reply({ ok: true });
    }
    if (action === 'likePost') {
      const postId = clean(body.postId, 80), post = await getJSON(`posts/${postId}`);
      if (!post) return reply({ error: 'Post not found.' }, 404);
      const chatMode = await getJSON('meta/chat-paused');
      if (chatMode?.paused && !isAdmin(user)) {
        const postAuthor = await getUser(post.authorId);
        if (!isAdmin(postAuthor)) return reply({ error: 'While chat is paused, members can like administrator posts only.' }, 403);
      }
      const key = `likes/${postId}/${user.id}`;
      if (await getJSON(key)) await DB.delete(key);
      else await putJSON(key, { postId, userId: user.id, createdAt: new Date().toISOString() }, { onlyIfNew: true });
      return reply({ ok: true });
    }
    if (action === 'comment') {
      const postId = clean(body.postId, 80), text = clean(body.text, 700);
      if (!text) return reply({ error: 'Write a text comment first.' }, 400);
      const post = await getJSON(`posts/${postId}`);
      if (!post) return reply({ error: 'Post not found.' }, 404);
      const chatMode = await getJSON('meta/chat-paused');
      if (chatMode?.paused && !isAdmin(user)) {
        const postAuthor = await getUser(post.authorId);
        if (!isAdmin(postAuthor)) return reply({ error: 'While chat is paused, members may comment on administrator posts only.' }, 403);
      }
      const comment = { id: randomId(), postId, authorId: user.id, text, createdAt: new Date().toISOString() };
      await putJSON(`comments/${comment.id}`, comment, { onlyIfNew: true });
      return reply({ ok: true }, 201);
    }
    if (action === 'reply') {
      const commentId = clean(body.commentId, 80), postId = clean(body.postId, 80), text = clean(body.text, 500);
      if (!text) return reply({ error: 'Write a text reply first.' }, 400);
      const comment = await getJSON(`comments/${commentId}`);
      if (!comment || comment.postId !== postId) return reply({ error: 'Comment not found.' }, 404);
      const chatMode = await getJSON('meta/chat-paused');
      if (chatMode?.paused && !isAdmin(user)) {
        const post = await getJSON(`posts/${postId}`), postAuthor = await getUser(post?.authorId);
        if (!isAdmin(postAuthor)) return reply({ error: 'While chat is paused, members may reply under administrator posts only.' }, 403);
      }
      const item = { id: randomId(), commentId, authorId: user.id, text, createdAt: new Date().toISOString() };
      await putJSON(`replies/${item.id}`, item, { onlyIfNew: true });
      return reply({ ok: true }, 201);
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
    return reply({ error: error?.message || 'Community service is temporarily unavailable.' }, status);
  }
}


export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

export default async function vercelHandler(req, res) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers || {})) {
      if (Array.isArray(value)) headers.set(name, value.join(', '));
      else if (value !== undefined) headers.set(name, String(value));
    }
    const url = new URL(req.url || '/api/community', `https://${req.headers?.host || 'localhost'}`);
    let body;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && req.body !== undefined) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
    const request = new Request(url, { method, headers, ...(body === undefined ? {} : { body }) });
    const response = await communityHandler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    const payload = Buffer.from(await response.arrayBuffer());
    res.end(payload);
  } catch (error) {
    res.statusCode = Number.isInteger(error?.status) ? error.status : 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ error: error?.message || 'The community service is temporarily unavailable.' }));
  }
}
