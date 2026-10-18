import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const store = getStore("folder-locker-public-stats");
const DAY_MS = 24 * 60 * 60 * 1000;
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS"
};

export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    const url = new URL(request.url);
    if (request.method === "POST" && url.searchParams.get("action") === "download") {
      const total = await store.get("download-requests", { type: "json" }) || { count: 0 };
      total.count = Number(total.count || 0) + 1;
      await store.setJSON("download-requests", total);
      return new Response(JSON.stringify({ downloadRequests: total.count }), { status: 200, headers });
    }
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
    }
    if (url.searchParams.get("admin") === "1") {
      const dbUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
      if (!dbUrl || !serviceKey || !token || token.length > 200) return new Response(JSON.stringify({ error: "Administrator authorization required." }), { status: 403, headers });
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const checkUrl = new URL(`${dbUrl}/rest/v1/community_sessions`);
      checkUrl.searchParams.set("select", "user:community_users!community_sessions_user_id_fkey(role)");
      checkUrl.searchParams.set("token_hash", `eq.${tokenHash}`);
      checkUrl.searchParams.set("expires_at", `gt.${new Date().toISOString()}`);
      checkUrl.searchParams.set("limit", "1");
      const authResponse = await fetch(checkUrl, { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, accept: "application/json" } });
      const authRows = authResponse.ok ? await authResponse.json() : [];
      if (!authRows[0] || authRows[0].user?.role !== "admin") return new Response(JSON.stringify({ error: "Administrator permission required." }), { status: 403, headers });
      const totals = await store.get("totals", { type: "json" }) || { visits: 0 };
      const downloads = await store.get("download-requests", { type: "json" }) || { count: 0 };
      return new Response(JSON.stringify({ visits: Number(totals.visits || 0), downloadRequests: Number(downloads.count || 0) }), { status: 200, headers });
    }
    const visitorId = (url.searchParams.get("visitorId") || "").slice(0, 120);
    let counted = false;
    if (visitorId) {
      const hash = createHash("sha256").update(visitorId).digest("hex");
      const visitorKey = `visitor:${hash}`;
      const now = Date.now();
      const prior = await store.get(visitorKey, { type: "json" });
      const priorAt = prior && Number(prior.lastCountedAt || 0);
      if (!priorAt || now - priorAt >= DAY_MS) {
        const totals = await store.get("totals", { type: "json" }) || { visits: 0 };
        totals.visits = Number(totals.visits || 0) + 1;
        await store.setJSON("totals", totals);
        await store.setJSON(visitorKey, { lastCountedAt: now });
        counted = true;
      }
    }
    const totals = await store.get("totals", { type: "json" }) || { visits: 0 };
    const downloads = await store.get("download-requests", { type: "json" }) || { count: 0 };
    return new Response(JSON.stringify({ visits: Number(totals.visits || 0), downloadRequests: Number(downloads.count || 0), counted }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Stats temporarily unavailable" }), { status: 503, headers });
  }
};
